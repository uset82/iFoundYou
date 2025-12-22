const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const DEFAULT_RADIUS_METERS = 2000;
const DEFAULT_EXPIRES_MINUTES = 240;
const MAX_MESSAGE_LENGTH = 200;

const VALID_CATEGORIES = new Set([
  'water',
  'food',
  'medical',
  'shelter',
  'lost',
  'other',
]);

const toRadians = (value) => (value * Math.PI) / 180;

const distanceMeters = (latA, lonA, latB, lonB) => {
  const earthRadius = 6371000;
  const deltaLat = toRadians(latB - latA);
  const deltaLon = toRadians(lonB - lonA);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const a =
    sinLat * sinLat +
    Math.cos(toRadians(latA)) *
      Math.cos(toRadians(latB)) *
      sinLon *
      sinLon;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  body: JSON.stringify(payload),
});

const getToken = (headers) => {
  const value = headers.authorization || headers.Authorization;
  if (!value) {
    return null;
  }
  return value.replace('Bearer ', '').trim();
};

const supabaseRequest = async (path, token, options = {}) => {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    return { error: await response.text() };
  }

  if (response.status === 204) {
    return { data: null };
  }

  return { data: await response.json() };
};

const getUser = async (token) => {
  const userResult = await supabaseRequest('/auth/v1/user', token);
  if (userResult.error || !userResult.data?.id) {
    return null;
  }
  return userResult.data;
};

exports.handler = async (event) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return jsonResponse(500, { error: 'Missing Supabase env vars.' });
  }

  const token = getToken(event.headers);
  if (!token) {
    return jsonResponse(401, { error: 'Missing auth token.' });
  }

  const user = await getUser(token);
  if (!user) {
    return jsonResponse(401, { error: 'Invalid auth token.' });
  }

  if (event.httpMethod === 'POST') {
    let body = {};
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body.' });
    }

    const message =
      typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length < 3) {
      return jsonResponse(400, { error: 'Message is required.' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return jsonResponse(400, { error: 'Message is too long.' });
    }

    const category = VALID_CATEGORIES.has(body.category)
      ? body.category
      : 'other';
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return jsonResponse(400, { error: 'Valid coordinates are required.' });
    }

    const radiusMeters = clamp(
      Number(body.radius_m ?? DEFAULT_RADIUS_METERS),
      200,
      10000
    );
    const expiresMinutes = clamp(
      Number(body.expires_in_minutes ?? DEFAULT_EXPIRES_MINUTES),
      15,
      1440
    );

    const payload = {
      user_id: user.id,
      category,
      message,
      lat,
      lon,
      accuracy_m: Number.isFinite(Number(body.accuracy_m))
        ? Number(body.accuracy_m)
        : null,
      radius_m: Math.round(radiusMeters),
      expires_at: new Date(
        Date.now() + expiresMinutes * 60 * 1000
      ).toISOString(),
    };

    const insertResult = await supabaseRequest('/rest/v1/community_alerts', token, {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    if (insertResult.error) {
      return jsonResponse(400, { error: 'Failed to create alert.' });
    }

    return jsonResponse(200, { alert: insertResult.data?.[0] ?? payload });
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const params = new URLSearchParams(event.queryStringParameters || {});
  const radiusMeters = clamp(
    Number(params.get('radius_m') ?? DEFAULT_RADIUS_METERS),
    200,
    10000
  );

  const selfLocationQuery = new URLSearchParams({
    select: 'user_id,lat,lon,updated_at',
    user_id: `eq.${user.id}`,
  });

  const selfLocationResult = await supabaseRequest(
    `/rest/v1/last_locations?${selfLocationQuery.toString()}`,
    token
  );

  const selfLocation = (selfLocationResult.data ?? [])[0];
  if (!selfLocation) {
    return jsonResponse(200, { alerts: [] });
  }

  const nowIso = new Date().toISOString();
  const alertsQuery = new URLSearchParams({
    select: 'id,user_id,category,message,lat,lon,radius_m,created_at,expires_at',
    active: 'eq.true',
    order: 'created_at.desc',
    limit: '50',
  });
  alertsQuery.append('or', `(expires_at.is.null,expires_at.gt.${nowIso})`);

  const alertsResult = await supabaseRequest(
    `/rest/v1/community_alerts?${alertsQuery.toString()}`,
    token
  );

  if (alertsResult.error) {
    return jsonResponse(200, { alerts: [] });
  }

  const alerts = (alertsResult.data ?? [])
    .map((alert) => {
      const distance = distanceMeters(
        selfLocation.lat,
        selfLocation.lon,
        alert.lat,
        alert.lon
      );
      const allowedRadius = Math.min(radiusMeters, alert.radius_m ?? radiusMeters);
      return {
        ...alert,
        distance_m: distance,
        allowed_radius_m: allowedRadius,
      };
    })
    .filter((alert) => alert.distance_m <= alert.allowed_radius_m)
    .sort((a, b) => a.distance_m - b.distance_m);

  return jsonResponse(200, { alerts });
};

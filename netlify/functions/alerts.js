const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const ALERT_RADIUS_METERS = 500;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

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

exports.handler = async (event) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return jsonResponse(500, { error: 'Missing Supabase env vars.' });
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const token = getToken(event.headers);
  if (!token) {
    return jsonResponse(401, { error: 'Missing auth token.' });
  }

  const userResult = await supabaseRequest('/auth/v1/user', token);
  if (userResult.error || !userResult.data?.id) {
    return jsonResponse(401, { error: 'Invalid auth token.' });
  }

  const userId = userResult.data.id;
  const body = event.body ? JSON.parse(event.body) : {};
  const radiusMeters =
    typeof body.radius_m === 'number' ? body.radius_m : ALERT_RADIUS_METERS;

  const friendsQuery = new URLSearchParams({
    select: 'user_id,friend_id,status',
    status: 'eq.accepted',
    or: `user_id.eq.${userId},friend_id.eq.${userId}`,
  });

  const friendsResult = await supabaseRequest(
    `/rest/v1/friendships?${friendsQuery.toString()}`,
    token
  );

  const friendLinks = friendsResult.data ?? [];
  const friendIds = friendLinks.map((link) =>
    link.user_id === userId ? link.friend_id : link.user_id
  );

  if (friendIds.length === 0) {
    return jsonResponse(200, { sent: 0 });
  }

  const selfLocationQuery = new URLSearchParams({
    select: 'user_id,lat,lon,updated_at',
    user_id: `eq.${userId}`,
  });

  const locationQuery = new URLSearchParams({
    select: 'user_id,lat,lon,updated_at',
    user_id: `in.(${friendIds.join(',')})`,
  });

  const [selfLocationResult, locationsResult, profilesResult] =
    await Promise.all([
      supabaseRequest(
        `/rest/v1/last_locations?${selfLocationQuery.toString()}`,
        token
      ),
      supabaseRequest(`/rest/v1/last_locations?${locationQuery.toString()}`, token),
      supabaseRequest(
        `/rest/v1/profiles?select=id,display_name&id=in.(${friendIds.join(
          ','
        )})`,
        token
      ),
    ]);

  const selfLocation = (selfLocationResult.data ?? [])[0];
  if (!selfLocation) {
    return jsonResponse(200, { sent: 0 });
  }

  const profileMap = new Map();
  (profilesResult.data ?? []).forEach((profile) => {
    profileMap.set(profile.id, profile.display_name ?? 'Friend');
  });

  const nearbyFriends = (locationsResult.data ?? [])
    .map((loc) => {
      const distance = distanceMeters(
        selfLocation.lat,
        selfLocation.lon,
        loc.lat,
        loc.lon
      );
      return {
        id: loc.user_id,
        name: profileMap.get(loc.user_id) ?? 'Friend',
        distance_m: distance,
      };
    })
    .filter((friend) => friend.distance_m <= radiusMeters);

  if (nearbyFriends.length === 0) {
    return jsonResponse(200, { sent: 0 });
  }

  const sinceIso = new Date(Date.now() - ALERT_COOLDOWN_MS).toISOString();
  const notificationsQuery = new URLSearchParams({
    select: 'id,payload_json',
    user_id: `eq.${userId}`,
    type: 'eq.proximity',
    created_at: `gte.${sinceIso}`,
  });

  const notificationsResult = await supabaseRequest(
    `/rest/v1/notifications?${notificationsQuery.toString()}`,
    token
  );

  const recent = notificationsResult.data ?? [];
  const recentIds = new Set(
    recent
      .map((row) => row.payload_json?.friend_id)
      .filter((value) => typeof value === 'string')
  );

  const inserts = nearbyFriends
    .filter((friend) => !recentIds.has(friend.id))
    .map((friend) => ({
      user_id: userId,
      type: 'proximity',
      payload_json: {
        friend_id: friend.id,
        friend_name: friend.name,
        distance_m: Math.round(friend.distance_m),
      },
    }));

  if (inserts.length === 0) {
    return jsonResponse(200, { sent: 0 });
  }

  const insertResult = await supabaseRequest('/rest/v1/notifications', token, {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(inserts),
  });

  if (insertResult.error) {
    return jsonResponse(200, { sent: 0 });
  }

  return jsonResponse(200, { sent: inserts.length });
};

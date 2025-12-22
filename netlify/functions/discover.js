const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

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

const supabaseFetch = async (path, token) => {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    return { error: await response.text() };
  }
  return { data: await response.json() };
};

exports.handler = async (event) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return jsonResponse(500, { error: 'Missing Supabase env vars.' });
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const token = getToken(event.headers);
  if (!token) {
    return jsonResponse(401, { error: 'Missing auth token.' });
  }

  const userResult = await supabaseFetch('/auth/v1/user', token);
  if (userResult.error || !userResult.data?.id) {
    return jsonResponse(401, { error: 'Invalid auth token.' });
  }

  const userId = userResult.data.id;
  const params = new URLSearchParams(event.queryStringParameters || {});
  const radiusMeters = Number(params.get('radius_m') ?? '1000');

  const friendsQuery = new URLSearchParams({
    select: 'user_id,friend_id,status',
    status: 'eq.accepted',
    or: `user_id.eq.${userId},friend_id.eq.${userId}`,
  });

  const friendsResult = await supabaseFetch(
    `/rest/v1/friendships?${friendsQuery.toString()}`,
    token
  );

  const friendLinks = friendsResult.data ?? [];
  const friendIds = friendLinks.map((link) =>
    link.user_id === userId ? link.friend_id : link.user_id
  );

  const discoverableResult = await supabaseFetch(
    `/rest/v1/privacy_settings?select=user_id&discoverable=eq.true`,
    token
  );

  if (discoverableResult.error) {
    return jsonResponse(200, { people: [] });
  }

  const candidateIds = (discoverableResult.data ?? [])
    .map((row) => row.user_id)
    .filter((id) => id !== userId && !friendIds.includes(id));

  if (candidateIds.length === 0) {
    return jsonResponse(200, { people: [] });
  }

  const locationQuery = new URLSearchParams({
    select: 'user_id,lat,lon,updated_at',
    user_id: `in.(${candidateIds.join(',')})`,
  });

  const selfLocationQuery = new URLSearchParams({
    select: 'user_id,lat,lon,updated_at',
    user_id: `eq.${userId}`,
  });

  const [locationsResult, selfLocationResult, profilesResult] = await Promise.all(
    [
      supabaseFetch(`/rest/v1/last_locations?${locationQuery.toString()}`, token),
      supabaseFetch(
        `/rest/v1/last_locations?${selfLocationQuery.toString()}`,
        token
      ),
      supabaseFetch(
        `/rest/v1/profiles?select=id,display_name&id=in.(${candidateIds.join(
          ','
        )})`,
        token
      ),
    ]
  );

  if (locationsResult.error || selfLocationResult.error) {
    return jsonResponse(200, { people: [] });
  }

  const selfLocation = (selfLocationResult.data ?? [])[0];
  if (!selfLocation) {
    return jsonResponse(200, { people: [] });
  }

  const profileMap = new Map();
  (profilesResult.data ?? []).forEach((profile) => {
    profileMap.set(profile.id, profile.display_name ?? 'Someone');
  });

  const people = (locationsResult.data ?? [])
    .map((loc) => {
      const distance = distanceMeters(
        selfLocation.lat,
        selfLocation.lon,
        loc.lat,
        loc.lon
      );
      return {
        id: loc.user_id,
        name: profileMap.get(loc.user_id) ?? 'Someone',
        updatedAt: loc.updated_at,
        lat: loc.lat,
        lon: loc.lon,
        distance_m: distance,
      };
    })
    .filter((person) => person.distance_m <= radiusMeters)
    .sort((a, b) => a.distance_m - b.distance_m);

  return jsonResponse(200, { people });
};

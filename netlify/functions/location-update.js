export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { lat, lon, accuracy_m, source } = payload;
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return { statusCode: 400, body: 'Missing lat/lon' };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      received: { lat, lon, accuracy_m, source },
    }),
  };
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing Supabase service role config.' }),
    };
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/location_updates?created_at=lt.${cutoff}`,
    {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );

  if (!response.ok) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Cleanup failed.' }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true }),
  };
};

exports.config = {
  schedule: '@daily',
};

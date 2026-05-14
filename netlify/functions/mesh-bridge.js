const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing Supabase environment variables' }),
      };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user token
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, body: 'Unauthorized' };
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return { statusCode: 401, body: 'Invalid token' };
    }

    const body = JSON.parse(event.body);
    const { recipient_id, content, priority, channel } = body;

    if (!content) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required field: content' }),
      };
    }

    // Insert into mesh_relay_queue
    const { data, error } = await supabase
      .from('mesh_relay_queue')
      .insert({
        sender_id: user.id,
        recipient_id: recipient_id || null,
        content,
        priority: priority || 'normal',
        channel: channel || 'broadcast',
      })
      .select('id, status')
      .single();

    if (error) {
      console.error('Error inserting into mesh_relay_queue:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Database error' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, queueId: data.id, status: data.status }),
    };
  } catch (err) {
    console.error('Unhandled error in mesh-bridge function:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};

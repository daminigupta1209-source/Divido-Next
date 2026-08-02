// Supabase Edge Function: delete-account
// ---------------------------------------
// Permanently deletes the CALLING user's auth identity from Supabase.
//
// Why this must live server-side: deleting an auth user requires the
// `service_role` key (admin privileges). That key must NEVER ship in the
// frontend bundle, so the client calls this function, which verifies the
// caller's JWT and then deletes exactly that one user — nobody else.
//
// Deploy:
//   supabase functions deploy delete-account
// The function automatically has SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY available as secrets in the Supabase runtime.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  // Browser preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json(401, { error: 'Missing authorization header' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Identify the caller from their JWT (scoped, non-privileged client).
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return json(401, { error: 'Invalid or expired session' });
    }

    // 2. Admin client (service_role) — the only thing that can delete a user.
    const adminClient = createClient(supabaseUrl, serviceKey);

    // 3. Detach this user's group memberships so shared history/balances survive
    //    for the other members (defense-in-depth; the client also does this with
    //    the proper "(Left)" display-name rename before calling us).
    if (user.email) {
      await adminClient
        .from('group_members')
        .update({ user_email: null, is_pending: true })
        .eq('user_email', user.email);
    }

    // 4. Permanently delete the auth identity.
    const { error: delErr } = await adminClient.auth.admin.deleteUser(user.id);
    if (delErr) {
      return json(500, { error: delErr.message });
    }

    return json(200, { success: true });
  } catch (e) {
    return json(500, { error: String(e) });
  }
});

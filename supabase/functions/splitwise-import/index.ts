// Supabase Edge Function: splitwise-import
// -----------------------------------------
// Server-side proxy for the Splitwise OAuth2 + REST API, used to import a
// user's Splitwise groups/expenses into Divido.
//
// Why this must live server-side: exchanging an OAuth authorization code
// requires the Splitwise `client_secret`, which must NEVER ship in the
// frontend bundle. The client calls this function instead; it verifies the
// caller's Supabase JWT (so only signed-in Divido users can use it), then
// talks to Splitwise on the caller's behalf. The resulting Splitwise access
// token is returned to the caller for the lifetime of the import flow only —
// this function never stores or logs it.
//
// Deploy:
//   supabase functions deploy splitwise-import
// Secrets (must be set explicitly, see README.md):
//   supabase secrets set SPLITWISE_CLIENT_ID=... SPLITWISE_CLIENT_SECRET=...
// SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically by the
// Supabase runtime.

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

const SPLITWISE_OAUTH_TOKEN_URL = 'https://www.splitwise.com/oauth/token';
const SPLITWISE_API_BASE = 'https://secure.splitwise.com/api/v3.0';

// Splitwise represents "expenses that aren't in any group" (i.e. 1:1 friend
// expenses) using group_id 0 in get_expenses, and surfaces a synthetic
// "Non-group expenses" pseudo-group with id 0 in get_groups. We drop that
// pseudo-group from the groups list (it isn't a real group to import) and use
// the same id to recognize friend expenses.
const NON_GROUP_PSEUDO_ID = 0;

const EXPENSES_PAGE_LIMIT = 100;
const EXPENSES_MAX_PAGES = 50;

class SplitwiseApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function authorizedGet(accessToken: string): RequestInit {
  return { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } };
}

// Splitwise error bodies are typically `{ error, error_description }` (OAuth
// endpoint) or `{ error: string }` / `{ errors: { base: [string] } }` (REST
// API). We only ever surface these known, structured fields to the client —
// never the raw response body — so nothing unexpected (or a stray secret
// echoed back by a misbehaving proxy) can leak through.
function extractSplitwiseErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.error_description === 'string' && b.error_description) return b.error_description;
  if (typeof b.error === 'string' && b.error) return b.error;
  if (b.errors && typeof b.errors === 'object') {
    const base = (b.errors as Record<string, unknown>).base;
    if (Array.isArray(base) && base.length && typeof base[0] === 'string') return base[0];
  }
  return null;
}

async function splitwiseRequest(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const message = extractSplitwiseErrorMessage(body) ?? `Splitwise request failed with status ${res.status}`;
    throw new SplitwiseApiError(res.status, message);
  }
  return body;
}

// Maps a failed Splitwise call to a client-facing response, calling out an
// expired/invalid token distinctly from other failures.
function splitwiseErrorResponse(e: SplitwiseApiError, context: string): Response {
  if (e.status === 401) {
    return json(401, {
      error: `Splitwise authorization is invalid or expired while trying to ${context}. Please reconnect Splitwise.`,
    });
  }
  const status = e.status >= 400 && e.status < 600 ? e.status : 502;
  return json(status, { error: `Splitwise error while trying to ${context}: ${e.message}` });
}

async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const tokenBody = (await splitwiseRequest(SPLITWISE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })) as Record<string, unknown> | null;

  const accessToken = tokenBody?.access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new SplitwiseApiError(502, 'Splitwise did not return an access token');
  }
  return accessToken;
}

async function handleExchange(
  body: Record<string, unknown>,
  clientId: string,
  clientSecret: string,
): Promise<Response> {
  const { code, redirectUri } = body;
  if (typeof code !== 'string' || !code) {
    return json(400, { error: 'code is required' });
  }
  if (typeof redirectUri !== 'string' || !redirectUri) {
    return json(400, { error: 'redirectUri is required' });
  }

  let accessToken: string;
  try {
    accessToken = await exchangeAuthorizationCode(code, redirectUri, clientId, clientSecret);
  } catch (e) {
    if (e instanceof SplitwiseApiError) return splitwiseErrorResponse(e, 'exchange the authorization code');
    throw e;
  }

  let currentUserBody: Record<string, unknown> | null;
  let groupsBody: Record<string, unknown> | null;
  try {
    [currentUserBody, groupsBody] = (await Promise.all([
      splitwiseRequest(`${SPLITWISE_API_BASE}/get_current_user`, authorizedGet(accessToken)),
      splitwiseRequest(`${SPLITWISE_API_BASE}/get_groups`, authorizedGet(accessToken)),
    ])) as [Record<string, unknown> | null, Record<string, unknown> | null];
  } catch (e) {
    if (e instanceof SplitwiseApiError) return splitwiseErrorResponse(e, 'fetch the Splitwise profile');
    throw e;
  }

  const allGroups = Array.isArray(groupsBody?.groups) ? (groupsBody!.groups as Array<Record<string, unknown>>) : [];
  const groups = allGroups.filter((g) => g?.id !== NON_GROUP_PSEUDO_ID);

  return json(200, {
    accessToken,
    currentUser: currentUserBody?.user ?? null,
    groups,
  });
}

// Pages through get_expenses until a short/empty page is returned or the page
// cap is hit. `extraParams` carries endpoint-specific filters (e.g. group_id).
async function paginateExpenses(
  accessToken: string,
  extraParams: Record<string, string>,
): Promise<{ expenses: Array<Record<string, unknown>>; truncated: boolean }> {
  const expenses: Array<Record<string, unknown>> = [];

  for (let page = 0; page < EXPENSES_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      limit: String(EXPENSES_PAGE_LIMIT),
      offset: String(page * EXPENSES_PAGE_LIMIT),
      ...extraParams,
    });
    const pageBody = (await splitwiseRequest(
      `${SPLITWISE_API_BASE}/get_expenses?${params.toString()}`,
      authorizedGet(accessToken),
    )) as Record<string, unknown> | null;
    const rows = Array.isArray(pageBody?.expenses) ? (pageBody!.expenses as Array<Record<string, unknown>>) : [];
    expenses.push(...rows);

    if (rows.length < EXPENSES_PAGE_LIMIT) {
      return { expenses, truncated: false };
    }
  }

  // Hit EXPENSES_MAX_PAGES with a full page every time — there may be more
  // data beyond what we fetched.
  return { expenses, truncated: true };
}

async function handleExpenses(body: Record<string, unknown>): Promise<Response> {
  const { accessToken, groupId } = body;
  if (typeof accessToken !== 'string' || !accessToken) {
    return json(400, { error: 'accessToken is required' });
  }
  const groupIdNum = Number(groupId);
  if (!Number.isInteger(groupIdNum)) {
    return json(400, { error: 'groupId must be an integer' });
  }

  try {
    const { expenses, truncated } = await paginateExpenses(accessToken, { group_id: String(groupIdNum) });
    return json(200, { expenses, truncated });
  } catch (e) {
    if (e instanceof SplitwiseApiError) return splitwiseErrorResponse(e, 'fetch group expenses');
    throw e;
  }
}

async function handleFriendExpenses(body: Record<string, unknown>): Promise<Response> {
  const { accessToken } = body;
  if (typeof accessToken !== 'string' || !accessToken) {
    return json(400, { error: 'accessToken is required' });
  }

  try {
    // No group_id filter: this scans every expense (all groups + friends) so
    // we can pick out the ones that aren't in any group. See README for the
    // performance note this implies.
    const { expenses, truncated } = await paginateExpenses(accessToken, {});
    const friendExpenses = expenses.filter((e) => e.group_id === NON_GROUP_PSEUDO_ID || e.group_id === null);
    return json(200, { expenses: friendExpenses, truncated });
  } catch (e) {
    if (e instanceof SplitwiseApiError) return splitwiseErrorResponse(e, 'fetch friend expenses');
    throw e;
  }
}

Deno.serve(async (req: Request) => {
  // Browser preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json(401, { error: 'Missing authorization header' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const clientId = Deno.env.get('SPLITWISE_CLIENT_ID');
    const clientSecret = Deno.env.get('SPLITWISE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return json(500, { error: 'Splitwise integration is not configured on the server' });
    }

    // Identify the caller from their JWT (scoped, non-privileged client). We
    // don't need an admin client here — this function never touches the
    // database, it only proxies Splitwise's API for an already-authenticated
    // Divido user.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) {
      return json(401, { error: 'Invalid or expired session' });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    switch (body?.action) {
      case 'exchange':
        return await handleExchange(body, clientId, clientSecret);
      case 'expenses':
        return await handleExpenses(body);
      case 'friendExpenses':
        return await handleFriendExpenses(body);
      default:
        return json(400, { error: `Unknown action: ${String(body?.action)}` });
    }
  } catch (e) {
    return json(500, { error: String(e) });
  }
});

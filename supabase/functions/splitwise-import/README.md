# `splitwise-import` Edge Function

Server-side proxy for the Splitwise OAuth2 + REST API, used by the "Import
from Splitwise" flow. Required because exchanging an OAuth authorization code
needs the Splitwise `client_secret`, which must never live in the frontend.
The client calls this function via `supabase.functions.invoke('splitwise-import', { body: ... })`
after verifying the caller is signed in to Divido; it never persists or logs
the Splitwise access token or client secret.

## Deploy (one-time)

1. Install the Supabase CLI: https://supabase.com/docs/guides/cli
2. Link the project (find the ref in your Supabase dashboard → Project Settings):
   ```bash
   supabase link --project-ref <your-project-ref>
   ```
3. Deploy:
   ```bash
   supabase functions deploy splitwise-import
   ```

## Secrets

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically by the
Supabase runtime. `SPLITWISE_CLIENT_ID` and `SPLITWISE_CLIENT_SECRET` must be
set explicitly (from your Splitwise app registration at
https://secure.splitwise.com/apps):

```bash
supabase secrets set SPLITWISE_CLIENT_ID=<your-client-id> SPLITWISE_CLIENT_SECRET=<your-client-secret>
```

If either secret is unset, every request fails fast with `500 { error: "Splitwise
integration is not configured on the server" }`.

## Registered callback URL

Splitwise apps are registered with exactly **one** OAuth redirect URL. Use:

```
https://<host>/splitwise-callback
```

where `<host>` is the Divido web app's host (e.g. your production domain, or a
tunnel/preview host during development — whichever one is registered in the
Splitwise app settings at the time). The client must send this same URL back
as `redirectUri` in the `exchange` request below, since Splitwise validates it
matches the one used to obtain the `code`.

## Request / response contract

All requests are `POST` with header `Authorization: Bearer <divido-supabase-jwt>`
and a JSON body containing an `action` field. All responses are JSON.

Common failure responses (any action):
- `401 { error: "Missing authorization header" }` — no `Authorization` header sent.
- `401 { error: "Invalid or expired session" }` — the Divido JWT didn't resolve to a user.
- `500 { error: "Splitwise integration is not configured on the server" }` — secrets unset.
- `400 { error: "Invalid JSON body" }` — body isn't valid JSON.
- `400 { error: "Unknown action: <action>" }` — unrecognized/missing `action`.
- `401 { error: "Splitwise authorization is invalid or expired while trying to <context>. Please reconnect Splitwise." }` — Splitwise rejected the token (only for `expenses`/`friendExpenses`; a first-time `exchange` failure normally means the authorization `code` itself is bad).
- `<status> { error: "Splitwise error while trying to <context>: <message>" }` — any other Splitwise API failure; `<status>` mirrors Splitwise's HTTP status (or `502` if it wasn't a normal HTTP status), and `<message>` is a sanitized message extracted from Splitwise's error body (never the raw body).

### `exchange` — trade an OAuth code for a token + initial profile

Request:
```json
{ "action": "exchange", "code": "<oauth-code-from-splitwise-redirect>", "redirectUri": "https://<host>/splitwise-callback" }
```
- `code` (string, required): the `code` query param Splitwise appended to the redirect.
- `redirectUri` (string, required): must exactly match the URL used to start the OAuth flow (see above).

Success response `200`:
```json
{
  "accessToken": "<splitwise-access-token>",
  "currentUser": { "id": 123, "first_name": "Ada", "last_name": "Lovelace", "email": "ada@example.com", "...": "..." },
  "groups": [
    { "id": 321, "name": "Housemates", "group_type": "home", "members": [ { "id": 123, "first_name": "Ada", "...": "..." } ] }
  ]
}
```
- `currentUser` is Splitwise's `get_current_user` response's `user` object, passed through as-is (or `null` if Splitwise omitted it).
- `groups` is Splitwise's `get_groups` response's `groups` array, passed through as-is, **except** the synthetic id-`0` "Non-group expenses" pseudo-group is always removed (it isn't a real group to import — see `friendExpenses` below for those expenses).
- The client is responsible for holding `accessToken` in memory for the rest of the import session; this function never stores it.

### `expenses` — page through one group's expenses

Request:
```json
{ "action": "expenses", "accessToken": "<splitwise-access-token>", "groupId": 321 }
```
- `accessToken` (string, required): from a prior `exchange` call.
- `groupId` (integer, required; a numeric string is also accepted and coerced): the Splitwise group id.

Success response `200`:
```json
{ "expenses": [ { "id": 51023, "cost": "25.0", "description": "Brunch", "currency_code": "USD", "date": "2012-05-02T13:00:00Z", "group_id": 321, "deleted_at": null, "...": "..." } ], "truncated": false }
```
- `expenses` is the concatenation of Splitwise's `get_expenses?group_id=<groupId>&limit=100&offset=...` pages, passed through as-is, fetched in ascending offset order starting at 0 and stopping at the first page shorter than 100 rows.
- `truncated` is `true` only if 50 full (100-row) pages were fetched without reaching a short/empty page — i.e. there may be more expenses beyond what's returned. It is `false` whenever pagination ended naturally.

### `friendExpenses` — expenses that aren't in any group

Request:
```json
{ "action": "friendExpenses", "accessToken": "<splitwise-access-token>" }
```
- `accessToken` (string, required): from a prior `exchange` call.

Success response `200`:
```json
{ "expenses": [ { "id": 51099, "cost": "10.0", "description": "Coffee", "group_id": 0, "...": "..." } ], "truncated": false }
```
- Internally this calls `get_expenses?limit=100&offset=...` **without** a `group_id` filter — i.e. it scans **all** of the user's expenses across every group and friend, page by page (same 100-row page size / 50-page cap / truncation rule as `expenses` above), and only then filters the accumulated results down to rows with `group_id` `0` or `null` (Splitwise's representation of a 1:1 friend expense).
- Because it scans every page rather than filtering server-side, this action's cost and `truncated` risk scale with the user's **total** Splitwise expense history, not just their friend expenses — for users with very large histories, real friend expenses could still be missed if `truncated: true` comes back.

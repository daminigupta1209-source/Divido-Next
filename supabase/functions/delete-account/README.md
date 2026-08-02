# `delete-account` Edge Function

Permanently deletes the **calling user's** Supabase auth identity. Required because
deleting an auth user needs the `service_role` key, which must never live in the
frontend. The app calls this via `supabase.functions.invoke('delete-account')`
from the "Delete Account" flow.

## Deploy (one-time)

1. Install the Supabase CLI: https://supabase.com/docs/guides/cli
2. Link the project (find the ref in your Supabase dashboard → Project Settings):
   ```bash
   supabase link --project-ref <your-project-ref>
   ```
3. Deploy:
   ```bash
   supabase functions deploy delete-account
   ```

## Secrets

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically by the Supabase runtime — you do **not** need to set them manually.

## Verify

After deploying, delete a throwaway test account, then try "Continue with Google"
again: Supabase should treat you as a **brand-new signup** (no old data), which
confirms the auth identity was actually removed. If the function is *not* deployed,
the app safely falls back to the previous soft-delete (unlink data + sign out).

## Behavior

1. Verifies the caller's JWT to identify exactly who is calling.
2. Detaches that user's `group_members` rows (keeps shared group history intact).
3. Calls `auth.admin.deleteUser(user.id)` to erase the identity.

Only ever deletes the caller — the JWT scopes it to that one user.

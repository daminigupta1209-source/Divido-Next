-- Optional email captured when you add a friend, so that when they later sign
-- in with that exact Google email their group spot is auto-claimed silently
-- (no "pick your name" card). This is separate from:
--   * user_email        — set once the person has actually joined/claimed;
--   * link_request_email — the existing "request to match a placeholder" flow.
-- invite_email is just the address you (the adder) supplied up front; it becomes
-- the member's identity for display/dedup and drives the auto-claim on join.
--
-- Safe, additive, nullable — existing rows are unaffected. Run before deploying
-- the code that uses it.

ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS invite_email text;

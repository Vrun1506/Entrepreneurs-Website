-- ════════════════════════════════════════════════════════════════════
-- Email-change audit trail
--
-- /settings can now change a member's email address (#46). That flow
-- verifies the OLD inbox: Supabase sends a 6-digit code there and only
-- that code applies the change, which is what stops someone on a stolen
-- session moving an account to an address they control.
--
-- What it cannot do is prove the member can read the NEW address. GoTrue
-- stores that code as hash(code + new_address) and has to find the account
-- by the email in the request — and no account holds the new address yet,
-- so that code is unverifiable by construction, not by policy. Proving it
-- would take a challenge flow of our own (a table, an RPC, a server
-- action, a third screen). That was weighed and rejected: it buys
-- protection against a rare, self-inflicted, recoverable mistake and
-- charges permanent complexity in the most security-sensitive flow here.
--
-- The mistake it leaves behind is a member mistyping the new address. The
-- account moves somewhere they cannot read, they cannot sign in, and
-- password reset goes to the wrong mailbox. They can still reach the
-- society through the public contact form — and at that point an admin has
-- their name and an address they cannot read, and no way to tell them from
-- someone claiming to be them.
--
-- So this records every email change, which buys two things:
--
--   * A LOCKED-OUT MEMBER CAN BE IDENTIFIED. The support flow is "write to
--     us from your previous address", matched against the recorded value.
--     That is proof of control, not knowledge — asking someone what their
--     old email was proves nothing, since anyone who knows the member
--     could guess an Imperial address.
--
--   * AN EMAIL CHANGE THAT WAS NOT THE MEMBER'S LEAVES A TRACE. Today
--     auth.users.email simply becomes something else and nothing anywhere
--     remembers what it was.
--
-- A TRIGGER RATHER THAN APPLICATION LOGGING, deliberately: this catches
-- changes made from the Supabase dashboard, or by a future script, not
-- only ones that went through EmailChangeForm. Those are exactly the
-- changes most worth having a record of.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.email_change_log (
  id         uuid        primary key default gen_random_uuid(),
  -- ON DELETE CASCADE IS LOAD-BEARING, not decoration. This project keeps
  -- PII sparingly on purpose — reject_user deletes the whole account and
  -- retains only the rejection reason, with a comment calling that "the
  -- only PII we retain". A log of former addresses is a step the other
  -- way, and it is defensible only while deleting an account still deletes
  -- everything about them. This is what keeps delete_my_account,
  -- admin_delete_user and reject_user complete deletions.
  user_id    uuid        not null references auth.users(id) on delete cascade,
  old_email  text        not null,
  new_email  text        not null,
  changed_at timestamptz not null default now()
);

-- "What was this account's previous address?" — the only question this
-- table is ever asked, and it is asked newest-first.
create index if not exists email_change_log_user_idx
  on public.email_change_log (user_id, changed_at desc);

-- No policies. authenticated/anon therefore cannot read or write this at
-- all; only the service role (which bypasses RLS) can, and the only writer
-- is the SECURITY DEFINER trigger below. Same posture as outbound_email.
alter table public.email_change_log enable row level security;

-- Belt and braces, per the rule 20260608000001 established: on Supabase a
-- `revoke ... from public` is a no-op on its own, because `anon` and
-- `authenticated` hold their own direct grants from default privileges.
-- Both named roles have to be revoked explicitly.
revoke all on table public.email_change_log from public, anon, authenticated;

-- ─── The trigger ────────────────────────────────────────────────────
-- Runs INSIDE GoTrue's transaction, so anything that can raise in here is
-- something that can stop a member changing their email. That is the whole
-- reason the body is one insert of four columns and does nothing else — no
-- lookups, no joins, no formatting.
create or replace function public.tg_log_email_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- `after update of email` fires whenever the UPDATE names the column,
  -- even when the value is unchanged.
  if new.email is not distinct from old.email then
    return null;
  end if;

  insert into public.email_change_log (user_id, old_email, new_email)
  values (new.id, old.email::text, new.email::text);

  return null;
end;
$$;

revoke execute on function public.tg_log_email_change() from public, anon, authenticated;

-- AFTER, not BEFORE: the record should describe what actually happened,
-- not what was attempted. The existing before-update trigger
-- (on_auth_user_email_change, migration 20260529000001) re-applies the
-- Imperial domain rule for students and is untouched by this — a student
-- change it rejects never reaches here, which is correct.
drop trigger if exists on_auth_user_email_change_log on auth.users;
create trigger on_auth_user_email_change_log
  after update of email on auth.users
  for each row execute function public.tg_log_email_change();

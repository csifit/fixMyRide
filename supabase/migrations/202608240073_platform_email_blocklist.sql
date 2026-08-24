begin;

create table public.platform_email_blocklist (
  email text primary key check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  blocked boolean not null default true,
  reason text not null check (char_length(btrim(reason)) between 2 and 500),
  created_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_email_block_history (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  previous_blocked boolean,
  blocked boolean not null,
  reason text not null check (char_length(btrim(reason)) between 2 and 500),
  changed_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (previous_blocked is null or previous_blocked is distinct from blocked)
);

create index platform_email_blocklist_status_idx
  on public.platform_email_blocklist(blocked, updated_at desc);
create index platform_email_block_history_email_idx
  on public.platform_email_block_history(email, created_at desc);

create trigger platform_email_blocklist_updated_at
before update on public.platform_email_blocklist
for each row execute function public.set_updated_at();

create trigger platform_email_block_history_immutable
before update or delete on public.platform_email_block_history
for each row execute function private.prevent_location_organisation_history_mutation();

alter table public.platform_email_blocklist enable row level security;
alter table public.platform_email_block_history enable row level security;
revoke all on table public.platform_email_blocklist,
  public.platform_email_block_history from public, anon, authenticated;
grant select on table public.platform_email_blocklist to service_role;

create function public.set_admin_email_block_status(
  requested_email text,
  requested_blocked boolean,
  requested_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(requested_email));
  previous_blocked boolean;
  record_exists boolean := false;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required' using errcode = '42501';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(normalized_email) > 254
    or requested_blocked is null
    or char_length(btrim(coalesce(requested_reason, ''))) not between 2 and 500 then
    raise exception 'Valid email block details are required' using errcode = '22023';
  end if;
  if exists (
    select 1 from auth.users users where lower(btrim(users.email)) = normalized_email
  ) then
    raise exception 'Use the registered account control for this email'
      using errcode = '23505';
  end if;

  select block.blocked, true into previous_blocked, record_exists
  from public.platform_email_blocklist block
  where block.email = normalized_email
  for update;

  if record_exists and previous_blocked = requested_blocked then
    raise exception 'Email block status is unchanged' using errcode = '22023';
  end if;

  if record_exists then
    update public.platform_email_blocklist
    set blocked = requested_blocked,
        reason = btrim(requested_reason)
    where email = normalized_email;
  else
    insert into public.platform_email_blocklist (
      email, blocked, reason, created_by_auth_user_id
    ) values (
      normalized_email, requested_blocked, btrim(requested_reason), (select auth.uid())
    );
  end if;

  insert into public.platform_email_block_history (
    email, previous_blocked, blocked, reason, changed_by_auth_user_id
  ) values (
    normalized_email,
    case when record_exists then previous_blocked else null end,
    requested_blocked, btrim(requested_reason), (select auth.uid())
  );
end;
$$;

create function public.get_admin_email_blocklist()
returns table (
  email text,
  blocked boolean,
  reason text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required' using errcode = '42501';
  end if;
  return query
  select block.email, block.blocked, block.reason, block.created_at, block.updated_at
  from public.platform_email_blocklist block
  order by block.blocked desc, block.updated_at desc;
end;
$$;

create function private.reject_blocklisted_auth_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and exists (
    select 1 from public.platform_email_blocklist block
    where block.email = lower(btrim(new.email)) and block.blocked
  ) then
    raise exception 'Account request unavailable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger reject_blocklisted_auth_email
before insert or update of email on auth.users
for each row execute function private.reject_blocklisted_auth_email();

create function private.reject_blocklisted_support_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.platform_email_blocklist block
    where block.email = lower(btrim(new.requester_email)) and block.blocked
  ) then
    raise exception 'Support request unavailable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger reject_blocklisted_support_email
before insert or update of requester_email on public.support_tickets
for each row execute function private.reject_blocklisted_support_email();

create function private.reject_blocklisted_booking_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_email is not null and exists (
    select 1 from public.platform_email_blocklist block
    where block.email = lower(btrim(new.customer_email)) and block.blocked
  ) then
    raise exception 'Booking request unavailable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger reject_blocklisted_booking_email
before insert or update of customer_email on public.service_booking_requests
for each row execute function private.reject_blocklisted_booking_email();

revoke all on function public.set_admin_email_block_status(text, boolean, text)
  from public, anon, authenticated;
revoke all on function public.get_admin_email_blocklist()
  from public, anon, authenticated;
revoke all on function private.reject_blocklisted_auth_email(),
  private.reject_blocklisted_support_email(),
  private.reject_blocklisted_booking_email()
  from public, anon, authenticated;
grant execute on function public.set_admin_email_block_status(text, boolean, text)
  to authenticated;
grant execute on function public.get_admin_email_blocklist()
  to authenticated;

comment on table public.platform_email_blocklist is
  'Administrator-managed exact-email restrictions for addresses without a registered Auth account.';
comment on function public.set_admin_email_block_status(text, boolean, text) is
  'Audited administrator control for blocking or releasing an unregistered email address.';

commit;

begin;

alter table public.support_tickets
  add column is_spam boolean not null default false,
  add column spam_marked_at timestamptz,
  add column spam_marked_by_auth_user_id uuid references auth.users(id) on delete restrict;

alter table public.support_tickets
  add constraint support_tickets_spam_state_check check (
    (not is_spam and spam_marked_at is null and spam_marked_by_auth_user_id is null)
    or
    (is_spam and spam_marked_at is not null and spam_marked_by_auth_user_id is not null)
  );

create index support_tickets_spam_created_idx
  on public.support_tickets(is_spam, created_at desc);

create function public.mark_support_ticket_spam_and_block_email(
  requested_ticket_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket public.support_tickets%rowtype;
  normalized_email text;
  existing_blocked boolean;
  block_exists boolean := false;
  block_reason text;
begin
  if not private.is_active_superadmin() then
    raise exception 'Superadministrator access required' using errcode = '42501';
  end if;

  select candidate.* into ticket
  from public.support_tickets candidate
  where candidate.id = requested_ticket_id
  for update;
  if not found then
    raise exception 'Support ticket not found' using errcode = 'P0002';
  end if;

  normalized_email := lower(btrim(ticket.requester_email));
  if exists (
    select 1 from auth.users users
    where lower(btrim(users.email)) = normalized_email
  ) then
    raise exception 'Registered account email requires account controls'
      using errcode = '23505';
  end if;

  block_reason := concat('Support ticket ', ticket.reference, ' marked as spam');
  select block.blocked, true into existing_blocked, block_exists
  from public.platform_email_blocklist block
  where block.email = normalized_email
  for update;

  if not block_exists then
    insert into public.platform_email_blocklist (
      email, blocked, reason, created_by_auth_user_id
    ) values (
      normalized_email, true, block_reason, (select auth.uid())
    );
    insert into public.platform_email_block_history (
      email, previous_blocked, blocked, reason, changed_by_auth_user_id
    ) values (
      normalized_email, null, true, block_reason, (select auth.uid())
    );
  elsif not existing_blocked then
    update public.platform_email_blocklist
    set blocked = true, reason = block_reason
    where email = normalized_email;
    insert into public.platform_email_block_history (
      email, previous_blocked, blocked, reason, changed_by_auth_user_id
    ) values (
      normalized_email, false, true, block_reason, (select auth.uid())
    );
  end if;

  update public.support_tickets
  set status = 'closed',
      is_spam = true,
      spam_marked_at = coalesce(spam_marked_at, now()),
      spam_marked_by_auth_user_id = coalesce(spam_marked_by_auth_user_id, (select auth.uid())),
      internal_note = case
        when position(block_reason in coalesce(internal_note, '')) > 0 then internal_note
        else concat_ws(E'\n', nullif(internal_note, ''), block_reason)
      end,
      closure_stage = case
        when ticket_type = 'account_closure' then 'cancelled'
        else closure_stage
      end,
      closure_wait_days = case
        when ticket_type = 'account_closure' then null
        else closure_wait_days
      end,
      closure_scheduled_at = case
        when ticket_type = 'account_closure' then null
        else closure_scheduled_at
      end,
      deletion_due_at = case
        when ticket_type = 'account_closure' then null
        else deletion_due_at
      end,
      deletion_completed_at = case
        when ticket_type = 'account_closure' then null
        else deletion_completed_at
      end
  where id = requested_ticket_id;

  return normalized_email;
end;
$$;

revoke all on function public.mark_support_ticket_spam_and_block_email(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_support_ticket_spam_and_block_email(uuid)
  to authenticated;

comment on function public.mark_support_ticket_spam_and_block_email(uuid) is
  'Atomically closes a spam ticket and adds its unregistered requester email to the audited exact-email blocklist.';

commit;

alter table public.support_tickets
  drop constraint support_tickets_ticket_type_check;

alter table public.support_tickets
  add constraint support_tickets_ticket_type_check
  check (ticket_type in ('support', 'problem', 'account_closure'));

alter table public.support_tickets
  add column closure_stage text not null default 'not_applicable'
    check (closure_stage in (
      'not_applicable', 'requested', 'account_suspended',
      'scheduled_for_deletion', 'deletion_completed', 'cancelled'
    )),
  add column closure_wait_days smallint
    check (closure_wait_days is null or closure_wait_days in (30, 60)),
  add column closure_scheduled_at timestamptz,
  add column deletion_due_at timestamptz,
  add column deletion_completed_at timestamptz;

alter table public.support_tickets
  add constraint support_tickets_closure_workflow_check check (
    (
      ticket_type <> 'account_closure'
      and closure_stage = 'not_applicable'
      and closure_wait_days is null
      and closure_scheduled_at is null
      and deletion_due_at is null
      and deletion_completed_at is null
    )
    or (
      ticket_type = 'account_closure'
      and closure_stage <> 'not_applicable'
    )
  );

create index support_tickets_closure_due_idx
  on public.support_tickets(deletion_due_at)
  where ticket_type = 'account_closure'
    and closure_stage = 'scheduled_for_deletion';

create or replace function public.create_support_ticket(
  requested_ticket_type text,
  requested_requester_type text,
  requested_requester_name text,
  requested_requester_email text,
  requested_subject text,
  requested_description text,
  requested_page_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(requested_requester_email));
  normalized_page_url text := nullif(btrim(requested_page_url), '');
  ticket_reference text;
  ticket_id uuid;
begin
  if requested_ticket_type is null
    or requested_requester_type is null
    or requested_requester_name is null
    or requested_requester_email is null
    or requested_subject is null
    or requested_description is null
    or requested_ticket_type not in ('support', 'problem', 'account_closure')
    or requested_requester_type not in ('customer', 'service_organisation', 'workshop_manager', 'other')
    or char_length(btrim(requested_requester_name)) not between 2 and 120
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(normalized_email) > 254
    or char_length(btrim(requested_subject)) not between 4 and 160
    or char_length(btrim(requested_description)) not between 20 and 5000
    or (normalized_page_url is not null and (
      char_length(normalized_page_url) > 1000
      or normalized_page_url !~ '^https?://'
    ))
  then
    raise exception using errcode = '22023', message = 'invalid support ticket';
  end if;

  if (
    select count(*) >= 5
    from public.support_tickets ticket
    where lower(ticket.requester_email) = normalized_email
      and ticket.created_at >= now() - interval '1 hour'
  ) then
    return jsonb_build_object('state', 'rate_limited');
  end if;

  ticket_reference := 'PIT-' || to_char(current_date, 'YYYYMMDD') || '-'
    || lpad(nextval('public.support_ticket_reference_seq')::text, 6, '0');

  insert into public.support_tickets (
    reference, ticket_type, requester_type, requester_name, requester_email,
    subject, description, page_url, auth_user_id, closure_stage
  ) values (
    ticket_reference, requested_ticket_type, requested_requester_type,
    btrim(requested_requester_name), normalized_email, btrim(requested_subject),
    btrim(requested_description), normalized_page_url, auth.uid(),
    case when requested_ticket_type = 'account_closure' then 'requested' else 'not_applicable' end
  ) returning id into ticket_id;

  return jsonb_build_object(
    'state', 'created',
    'ticketId', ticket_id,
    'reference', ticket_reference
  );
end;
$$;

create function public.update_admin_support_ticket(
  requested_ticket_id uuid,
  requested_status text,
  requested_internal_note text,
  requested_closure_stage text,
  requested_closure_wait_days smallint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_ticket public.support_tickets%rowtype;
  next_scheduled_at timestamptz;
  next_due_at timestamptz;
  next_completed_at timestamptz;
begin
  if not private.is_active_superadmin() then
    raise exception using errcode = '42501', message = 'administrator access required';
  end if;

  if requested_status not in ('open', 'in_progress', 'waiting_on_requester', 'resolved', 'closed')
    or requested_internal_note is not null and char_length(requested_internal_note) > 3000
  then
    raise exception using errcode = '22023', message = 'invalid ticket update';
  end if;

  select * into existing_ticket
  from public.support_tickets
  where id = requested_ticket_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'support ticket not found';
  end if;

  if existing_ticket.ticket_type <> 'account_closure' then
    if requested_closure_stage <> 'not_applicable' or requested_closure_wait_days is not null then
      raise exception using errcode = '22023', message = 'closure workflow is not applicable';
    end if;

    update public.support_tickets
    set status = requested_status,
        internal_note = nullif(btrim(requested_internal_note), '')
    where id = requested_ticket_id;
    return;
  end if;

  if requested_closure_stage not in (
    'requested', 'account_suspended', 'scheduled_for_deletion',
    'deletion_completed', 'cancelled'
  ) then
    raise exception using errcode = '22023', message = 'invalid closure stage';
  end if;

  if requested_closure_stage = 'scheduled_for_deletion' then
    if requested_closure_wait_days is null or requested_closure_wait_days not in (30, 60) then
      raise exception using errcode = '22023', message = 'a 30 or 60 day deletion wait is required';
    end if;

    if existing_ticket.closure_stage <> 'scheduled_for_deletion'
      or existing_ticket.closure_wait_days is distinct from requested_closure_wait_days
      or existing_ticket.closure_scheduled_at is null
    then
      next_scheduled_at := now();
      next_due_at := now() + make_interval(days => requested_closure_wait_days);
    else
      next_scheduled_at := existing_ticket.closure_scheduled_at;
      next_due_at := existing_ticket.deletion_due_at;
    end if;
    next_completed_at := null;
  elsif requested_closure_stage = 'deletion_completed' then
    next_scheduled_at := existing_ticket.closure_scheduled_at;
    next_due_at := existing_ticket.deletion_due_at;
    next_completed_at := coalesce(existing_ticket.deletion_completed_at, now());
  else
    requested_closure_wait_days := null;
    next_scheduled_at := null;
    next_due_at := null;
    next_completed_at := null;
  end if;

  update public.support_tickets
  set status = requested_status,
      internal_note = nullif(btrim(requested_internal_note), ''),
      closure_stage = requested_closure_stage,
      closure_wait_days = requested_closure_wait_days,
      closure_scheduled_at = next_scheduled_at,
      deletion_due_at = next_due_at,
      deletion_completed_at = next_completed_at
  where id = requested_ticket_id;
end;
$$;

revoke update on table public.support_tickets from authenticated;
revoke all on function public.update_admin_support_ticket(uuid, text, text, text, smallint)
  from public;
grant execute on function public.update_admin_support_ticket(uuid, text, text, text, smallint)
  to authenticated;

comment on function public.update_admin_support_ticket(uuid, text, text, text, smallint) is
  'Superadministrator-only support update with an auditable 30- or 60-day account-closure schedule.';

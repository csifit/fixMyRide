create sequence public.support_ticket_reference_seq;

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^PIT-[0-9]{8}-[0-9]{6}$'),
  ticket_type text not null check (ticket_type in ('support', 'problem')),
  requester_type text not null check (requester_type in ('customer', 'service_organisation', 'workshop_manager', 'other')),
  requester_name text not null check (char_length(requester_name) between 2 and 120),
  requester_email text not null check (char_length(requester_email) between 3 and 254),
  subject text not null check (char_length(subject) between 4 and 160),
  description text not null check (char_length(description) between 20 and 5000),
  page_url text check (page_url is null or char_length(page_url) <= 1000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_on_requester', 'resolved', 'closed')),
  internal_note text check (internal_note is null or char_length(internal_note) <= 3000),
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_status_created_idx
  on public.support_tickets(status, created_at desc);
create index support_tickets_requester_rate_idx
  on public.support_tickets(lower(requester_email), created_at desc);

create trigger support_tickets_updated_at
before update on public.support_tickets
for each row execute function public.set_updated_at();

alter table public.support_tickets enable row level security;

create policy support_tickets_superadmin_read
on public.support_tickets for select to authenticated
using ((select private.is_active_superadmin()));

create policy support_tickets_superadmin_update
on public.support_tickets for update to authenticated
using ((select private.is_active_superadmin()))
with check ((select private.is_active_superadmin()));

create function public.create_support_ticket(
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
  if requested_ticket_type not in ('support', 'problem')
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
    subject, description, page_url, auth_user_id
  ) values (
    ticket_reference, requested_ticket_type, requested_requester_type,
    btrim(requested_requester_name), normalized_email, btrim(requested_subject),
    btrim(requested_description), normalized_page_url, auth.uid()
  ) returning id into ticket_id;

  return jsonb_build_object(
    'state', 'created',
    'ticketId', ticket_id,
    'reference', ticket_reference
  );
end;
$$;

revoke all on table public.support_tickets from public, anon, authenticated;
grant select, update on table public.support_tickets to authenticated;
revoke all on sequence public.support_ticket_reference_seq from public, anon, authenticated;
revoke all on function public.create_support_ticket(text, text, text, text, text, text, text)
  from public;
grant execute on function public.create_support_ticket(text, text, text, text, text, text, text)
  to anon, authenticated;

comment on table public.support_tickets is
  'Public support and problem-report tickets. Direct public table access is denied; creation is validated through create_support_ticket.';


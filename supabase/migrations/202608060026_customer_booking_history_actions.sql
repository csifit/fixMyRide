begin;

-- PostgreSQL requires enum additions to be committed before a later migration
-- can safely use the new values in functions and data writes.
alter type public.service_booking_management_action
  add value if not exists 'proposal_accepted';
alter type public.service_booking_management_action
  add value if not exists 'proposal_declined';
alter type public.service_booking_management_action
  add value if not exists 'customer_cancelled';

commit;

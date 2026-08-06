begin;

alter type public.service_booking_management_action add value if not exists 'checked_in';
alter type public.service_booking_management_action add value if not exists 'diagnosis_recorded';
alter type public.service_booking_management_action add value if not exists 'estimate_sent';
alter type public.service_booking_management_action add value if not exists 'estimate_approved';
alter type public.service_booking_management_action add value if not exists 'estimate_declined';
alter type public.service_booking_management_action add value if not exists 'work_started';
alter type public.service_booking_management_action add value if not exists 'ready_for_collection';
alter type public.service_booking_management_action add value if not exists 'completed';
alter type public.service_booking_management_action add value if not exists 'no_show';

commit;

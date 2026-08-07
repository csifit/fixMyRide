begin;

create function public.get_automotive_admin_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generatedAt', now(),
    'counts', jsonb_build_object(
      'providers', (select count(*) from public.service_providers),
      'workshops', (select count(*) from public.workshops),
      'customers', (select count(*) from public.customer_profiles),
      'managers', (select count(*) from public.workshop_manager_profiles),
      'openBookings', (select count(*) from public.service_booking_requests
        where status in ('requested', 'confirmed', 'checked_in', 'diagnosing',
          'awaiting_approval', 'in_service', 'ready_for_collection')),
      'smsAttention', (select count(*) from public.service_booking_notifications
        where status = 'failed' and attempt_count < 5)
    ),
    'providers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', provider.id, 'displayName', provider.display_name,
      'legalName', provider.legal_name, 'countryCode', provider.country_code,
      'status', provider.status, 'workshopCount', (select count(*)
        from public.workshops workshop where workshop.service_provider_id = provider.id),
      'managerCount', (select count(*)
        from public.workshop_manager_memberships membership
        where membership.service_provider_id = provider.id and membership.status = 'active'),
      'createdAt', provider.created_at
    ) order by provider.created_at desc) from public.service_providers provider), '[]'::jsonb),
    'workshops', coalesce((select jsonb_agg(jsonb_build_object(
      'id', workshop.id, 'displayName', workshop.display_name,
      'providerName', provider.display_name, 'city', workshop.city,
      'countryCode', workshop.country_code, 'status', workshop.status,
      'acceptsBookings', workshop.accepts_booking_requests,
      'openBookingCount', (select count(*) from public.service_booking_requests booking
        where booking.workshop_id = workshop.legacy_workshop_profile_id
          and booking.status in ('requested', 'confirmed', 'checked_in', 'diagnosing',
            'awaiting_approval', 'in_service', 'ready_for_collection')),
      'createdAt', workshop.created_at
    ) order by workshop.created_at desc)
      from public.workshops workshop join public.service_providers provider
        on provider.id = workshop.service_provider_id), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', customer.id, 'fullName', customer.full_name, 'phone', customer.phone,
      'vehicleCount', (select count(*) from public.vehicles vehicle
        where vehicle.customer_id = customer.id),
      'bookingCount', (select count(*) from public.service_booking_requests booking
        where booking.customer_id = customer.id),
      'createdAt', customer.created_at
    ) order by customer.created_at desc) from public.customer_profiles customer), '[]'::jsonb),
    'managers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', manager.id, 'displayName', manager.display_name, 'status', manager.status,
      'providerNames', coalesce((select jsonb_agg(provider.display_name order by provider.display_name)
        from public.workshop_manager_memberships membership
        join public.service_providers provider on provider.id = membership.service_provider_id
        where membership.workshop_manager_id = manager.id and membership.status = 'active'), '[]'::jsonb),
      'createdAt', manager.created_at
    ) order by manager.created_at desc) from public.workshop_manager_profiles manager), '[]'::jsonb),
    'sms', coalesce((select jsonb_agg(jsonb_build_object(
      'kind', kinds.kind, 'pending', (select count(*) from public.service_booking_notifications notification where notification.kind = kinds.kind and notification.status in ('pending', 'processing')),
      'sent', (select count(*) from public.service_booking_notifications notification where notification.kind = kinds.kind and notification.status = 'sent'),
      'failed', (select count(*) from public.service_booking_notifications notification where notification.kind = kinds.kind and notification.status = 'failed')
    ) order by kinds.kind::text) from unnest(enum_range(null::public.service_booking_notification_kind)) kinds(kind)), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_automotive_admin_snapshot()
  from public, anon, authenticated;
grant execute on function public.get_automotive_admin_snapshot()
  to authenticated;

comment on function public.get_automotive_admin_snapshot() is
  'MFA-admin-only canonical automotive operations snapshot with no medical-domain reads.';

commit;

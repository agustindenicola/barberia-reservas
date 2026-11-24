alter table public.app_settings
  alter column notification_email set default 'barberia.marianomartinez@gmail.com';

insert into public.app_settings (id, notification_email, max_days_ahead, slot_step)
values (true, 'barberia.marianomartinez@gmail.com', 21, 30)
on conflict (id) do update
set
  notification_email = case
    when trim(coalesce(public.app_settings.notification_email, '')) = '' then excluded.notification_email
    else public.app_settings.notification_email
  end,
  updated_at = now();

do $$
begin
  alter publication supabase_realtime add table public.reservations;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.blocked_slots;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.availability_overrides;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.opening_hours;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.services;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.app_settings;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

create or replace function public.create_reservation(
  p_service_id uuid,
  p_service_name text,
  p_duration integer,
  p_price integer,
  p_date date,
  p_time time,
  p_name text,
  p_email text,
  p_phone text default '',
  p_note text default ''
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.reservations;
  selected_service public.services;
  schedule_open boolean;
  schedule_start time;
  schedule_end time;
  schedule_break_start time;
  schedule_break_end time;
  schedule_slot_step integer;
  max_days_ahead integer;
  business_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  perform pg_advisory_xact_lock(hashtext(p_date::text));

  select *
  into selected_service
  from public.services
  where id = p_service_id
    and active = true;

  if selected_service.id is null then
    raise exception 'service_unavailable';
  end if;

  if length(trim(coalesce(p_phone, ''))) = 0 then
    raise exception 'phone_required';
  end if;

  select coalesce(s.max_days_ahead, 21)
  into max_days_ahead
  from public.app_settings s
  where s.id = true;

  if p_date < business_today then
    raise exception 'past_date';
  end if;

  if p_date > business_today + coalesce(max_days_ahead, 21) then
    raise exception 'date_too_far';
  end if;

  select
    coalesce(ao.open, oh.open),
    coalesce(ao.start_time, oh.start_time),
    coalesce(ao.end_time, oh.end_time),
    coalesce(ao.break_start, oh.break_start),
    coalesce(ao.break_end, oh.break_end),
    coalesce(s.slot_step, 30)
  into
    schedule_open,
    schedule_start,
    schedule_end,
    schedule_break_start,
    schedule_break_end,
    schedule_slot_step
  from public.opening_hours oh
  left join public.availability_overrides ao on ao.date = p_date
  left join public.app_settings s on s.id = true
  where oh.weekday = extract(dow from p_date)::integer;

  if not coalesce(schedule_open, false) then
    raise exception 'day_closed';
  end if;

  if p_time < schedule_start or (p_time + make_interval(mins => selected_service.duration))::time > schedule_end then
    raise exception 'outside_opening_hours';
  end if;

  if ((extract(epoch from (p_time - schedule_start)) / 60)::integer % schedule_slot_step) <> 0 then
    raise exception 'invalid_slot_step';
  end if;

  if schedule_break_start is not null
    and schedule_break_end is not null
    and p_time < schedule_break_end
    and schedule_break_start < (p_time + make_interval(mins => selected_service.duration))::time
  then
    raise exception 'break_unavailable';
  end if;

  if exists (
    select 1
    from public.blocked_slots b
    where b.date = p_date
      and p_time < (b.time + make_interval(mins => b.duration))
      and b.time < (p_time + make_interval(mins => selected_service.duration))
  ) then
    raise exception 'slot_blocked';
  end if;

  if exists (
    select 1
    from public.reservations r
    where r.status = 'confirmed'
      and r.date = p_date
      and p_time < (r.time + make_interval(mins => r.duration))
      and r.time < (p_time + make_interval(mins => selected_service.duration))
  ) then
    raise exception 'slot_unavailable';
  end if;

  insert into public.reservations (
    service_id,
    service_name,
    duration,
    price,
    date,
    time,
    name,
    email,
    phone,
    note,
    status
  )
  values (
    selected_service.id,
    selected_service.name,
    selected_service.duration,
    selected_service.price,
    p_date,
    p_time,
    p_name,
    p_email,
    coalesce(p_phone, ''),
    coalesce(p_note, ''),
    'confirmed'
  )
  returning * into inserted;

  return inserted;
end;
$$;

create or replace function public.reschedule_reservation_by_token(
  p_manage_token text,
  p_service_id uuid,
  p_service_name text,
  p_duration integer,
  p_price integer,
  p_date date,
  p_time time
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_reservation public.reservations;
  updated public.reservations;
  selected_service public.services;
  schedule_open boolean;
  schedule_start time;
  schedule_end time;
  schedule_break_start time;
  schedule_break_end time;
  schedule_slot_step integer;
  max_days_ahead integer;
  business_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  perform pg_advisory_xact_lock(hashtext(p_date::text));

  select *
  into current_reservation
  from public.reservations
  where manage_token = p_manage_token
    and status = 'confirmed'
  for update;

  if current_reservation.id is null then
    raise exception 'reservation_not_found';
  end if;

  select *
  into selected_service
  from public.services
  where id = p_service_id
    and active = true;

  if selected_service.id is null then
    raise exception 'service_unavailable';
  end if;

  select coalesce(s.max_days_ahead, 21)
  into max_days_ahead
  from public.app_settings s
  where s.id = true;

  if p_date < business_today then
    raise exception 'past_date';
  end if;

  if p_date > business_today + coalesce(max_days_ahead, 21) then
    raise exception 'date_too_far';
  end if;

  select
    coalesce(ao.open, oh.open),
    coalesce(ao.start_time, oh.start_time),
    coalesce(ao.end_time, oh.end_time),
    coalesce(ao.break_start, oh.break_start),
    coalesce(ao.break_end, oh.break_end),
    coalesce(s.slot_step, 30)
  into
    schedule_open,
    schedule_start,
    schedule_end,
    schedule_break_start,
    schedule_break_end,
    schedule_slot_step
  from public.opening_hours oh
  left join public.availability_overrides ao on ao.date = p_date
  left join public.app_settings s on s.id = true
  where oh.weekday = extract(dow from p_date)::integer;

  if not coalesce(schedule_open, false) then
    raise exception 'day_closed';
  end if;

  if p_time < schedule_start or (p_time + make_interval(mins => selected_service.duration))::time > schedule_end then
    raise exception 'outside_opening_hours';
  end if;

  if ((extract(epoch from (p_time - schedule_start)) / 60)::integer % schedule_slot_step) <> 0 then
    raise exception 'invalid_slot_step';
  end if;

  if schedule_break_start is not null
    and schedule_break_end is not null
    and p_time < schedule_break_end
    and schedule_break_start < (p_time + make_interval(mins => selected_service.duration))::time
  then
    raise exception 'break_unavailable';
  end if;

  if exists (
    select 1
    from public.blocked_slots b
    where b.date = p_date
      and p_time < (b.time + make_interval(mins => b.duration))
      and b.time < (p_time + make_interval(mins => selected_service.duration))
  ) then
    raise exception 'slot_blocked';
  end if;

  if exists (
    select 1
    from public.reservations r
    where r.status = 'confirmed'
      and r.id <> current_reservation.id
      and r.date = p_date
      and p_time < (r.time + make_interval(mins => r.duration))
      and r.time < (p_time + make_interval(mins => selected_service.duration))
  ) then
    raise exception 'slot_unavailable';
  end if;

  update public.reservations
  set
    service_id = selected_service.id,
    service_name = selected_service.name,
    duration = selected_service.duration,
    price = selected_service.price,
    date = p_date,
    time = p_time
  where id = current_reservation.id
  returning * into updated;

  return updated;
end;
$$;

grant execute on function public.create_reservation(uuid, text, integer, integer, date, time, text, text, text, text) to anon, authenticated;
grant execute on function public.reschedule_reservation_by_token(text, uuid, text, integer, integer, date, time) to anon, authenticated;

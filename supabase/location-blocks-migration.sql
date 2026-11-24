alter table public.app_settings
  add column if not exists business_address text not null default '',
  add column if not exists maps_url text not null default '';

update public.app_settings
set maps_url = 'https://maps.app.goo.gl/UzPPS1nmSLwza3BL9?g_st=ic'
where id = true
  and maps_url = '';

create table if not exists public.blocked_slots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time not null,
  duration integer not null default 30 check (duration > 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists blocked_slots_date_idx
  on public.blocked_slots (date);

create unique index if not exists blocked_slots_unique_start
  on public.blocked_slots (date, time);

alter table public.blocked_slots enable row level security;

drop policy if exists "Public can read blocked slots" on public.blocked_slots;
create policy "Public can read blocked slots"
  on public.blocked_slots
  for select
  using (true);

drop policy if exists "Authenticated admin can manage blocked slots" on public.blocked_slots;
create policy "Authenticated admin can manage blocked slots"
  on public.blocked_slots
  for all
  to authenticated
  using (true)
  with check (true);

grant select on public.blocked_slots to anon, authenticated;
grant insert, update, delete on public.blocked_slots to authenticated;

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
  schedule_open boolean;
  schedule_start time;
  schedule_end time;
  schedule_break_start time;
  schedule_break_end time;
begin
  perform pg_advisory_xact_lock(hashtext(p_date::text));

  select
    coalesce(ao.open, oh.open),
    coalesce(ao.start_time, oh.start_time),
    coalesce(ao.end_time, oh.end_time),
    coalesce(ao.break_start, oh.break_start),
    coalesce(ao.break_end, oh.break_end)
  into
    schedule_open,
    schedule_start,
    schedule_end,
    schedule_break_start,
    schedule_break_end
  from public.opening_hours oh
  left join public.availability_overrides ao on ao.date = p_date
  where oh.weekday = extract(dow from p_date)::integer;

  if not coalesce(schedule_open, false) then
    raise exception 'day_closed';
  end if;

  if p_time < schedule_start or (p_time + make_interval(mins => p_duration))::time > schedule_end then
    raise exception 'outside_opening_hours';
  end if;

  if schedule_break_start is not null
    and schedule_break_end is not null
    and p_time < schedule_break_end
    and schedule_break_start < (p_time + make_interval(mins => p_duration))::time
  then
    raise exception 'break_unavailable';
  end if;

  if exists (
    select 1
    from public.blocked_slots b
    where b.date = p_date
      and p_time < (b.time + make_interval(mins => b.duration))
      and b.time < (p_time + make_interval(mins => p_duration))
  ) then
    raise exception 'slot_blocked';
  end if;

  if exists (
    select 1
    from public.reservations r
    where r.status = 'confirmed'
      and r.date = p_date
      and p_time < (r.time + make_interval(mins => r.duration))
      and r.time < (p_time + make_interval(mins => p_duration))
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
    p_service_id,
    p_service_name,
    p_duration,
    p_price,
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
  schedule_open boolean;
  schedule_start time;
  schedule_end time;
  schedule_break_start time;
  schedule_break_end time;
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

  select
    coalesce(ao.open, oh.open),
    coalesce(ao.start_time, oh.start_time),
    coalesce(ao.end_time, oh.end_time),
    coalesce(ao.break_start, oh.break_start),
    coalesce(ao.break_end, oh.break_end)
  into
    schedule_open,
    schedule_start,
    schedule_end,
    schedule_break_start,
    schedule_break_end
  from public.opening_hours oh
  left join public.availability_overrides ao on ao.date = p_date
  where oh.weekday = extract(dow from p_date)::integer;

  if not coalesce(schedule_open, false) then
    raise exception 'day_closed';
  end if;

  if p_time < schedule_start or (p_time + make_interval(mins => p_duration))::time > schedule_end then
    raise exception 'outside_opening_hours';
  end if;

  if schedule_break_start is not null
    and schedule_break_end is not null
    and p_time < schedule_break_end
    and schedule_break_start < (p_time + make_interval(mins => p_duration))::time
  then
    raise exception 'break_unavailable';
  end if;

  if exists (
    select 1
    from public.blocked_slots b
    where b.date = p_date
      and p_time < (b.time + make_interval(mins => b.duration))
      and b.time < (p_time + make_interval(mins => p_duration))
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
      and r.time < (p_time + make_interval(mins => p_duration))
  ) then
    raise exception 'slot_unavailable';
  end if;

  update public.reservations
  set
    service_id = p_service_id,
    service_name = p_service_name,
    duration = p_duration,
    price = p_price,
    date = p_date,
    time = p_time
  where id = current_reservation.id
  returning * into updated;

  return updated;
end;
$$;

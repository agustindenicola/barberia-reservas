insert into public.app_settings (id, notification_email, max_days_ahead, slot_step)
values (true, 'barberia.marianomartinez@gmail.com', 21, 30)
on conflict (id) do update
set
  notification_email = excluded.notification_email,
  updated_at = now();

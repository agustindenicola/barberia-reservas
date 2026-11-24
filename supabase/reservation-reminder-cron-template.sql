create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

do $$
begin
  perform cron.unschedule('send-reservation-reminders-every-5-minutes');
exception
  when others then null;
end $$;

select cron.schedule(
  'send-reservation-reminders-every-5-minutes',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := 'https://iigubbmnpwzwddohxtlc.supabase.co/functions/v1/send-reservation-reminders',
      headers := '{"Content-Type": "application/json", "x-cron-secret": "REEMPLAZAR_CRON_SECRET"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Social Publisher: run the publishing worker every minute.
--
-- 20260922120000_social_publisher.sql installed this job only if three Vault
-- entries existed when it ran. They did not, so the job was never created and
-- a scheduled post would wait in the queue indefinitely.
--
-- This version needs one Vault entry, the worker secret. The function's
-- address is not a secret, and the service role key the first version also
-- asked for is not used: social-publish takes no Supabase login
-- (verify_jwt = false in config.toml) and checks the worker secret itself.
--
-- Before applying, run this once in the SQL editor with the same value as the
-- SOCIAL_PUBLISHER_WORKER_SECRET Edge Function secret (never commit the value):
--
--   select vault.create_secret('<SOCIAL_PUBLISHER_WORKER_SECRET value>', 'social_publisher_worker_secret');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'social_publisher_worker_secret') then
    raise exception 'Add social_publisher_worker_secret to Vault first (see the comment at the top of this migration).';
  end if;

  -- Scheduling under an existing name replaces that job, so this can be rerun.
  perform cron.schedule(
    'social-publisher-worker',
    '* * * * *',
    $job$
      select net.http_post(
        url := 'https://kgdeqwjuspiqraxrlcew.supabase.co/functions/v1/social-publish',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-social-publisher-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'social_publisher_worker_secret' limit 1)
        ),
        body := jsonb_build_object('limit', 20),
        timeout_milliseconds := 50000
      );
    $job$
  );
end;
$$;

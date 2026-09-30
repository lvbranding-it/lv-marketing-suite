-- The public upload page (/upload/:token) looks its link up through this
-- function instead of reading file_requests directly.
--
-- It answers for one exact token and returns only what the page shows: never
-- the token, the org, or the request's id. The table policy it replaces
-- (dropped in 20261001120100) let anyone holding the public key list every
-- active request, tokens included.
--
-- Closed and expired requests are returned too, so the page can say which of
-- the two it is; before, both read as "invalid or no longer active".
--
-- Apply this before the site that calls it goes live.

create or replace function public.get_file_request_by_token(p_token text)
returns table (title text, description text, status text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select fr.title, fr.description, fr.status, fr.expires_at
  from public.file_requests fr
  where fr.token = p_token
$$;

revoke all on function public.get_file_request_by_token(text) from public;
grant execute on function public.get_file_request_by_token(text) to anon, authenticated;

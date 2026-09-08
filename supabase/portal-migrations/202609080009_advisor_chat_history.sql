-- Advisor chat history, stored per representative.
--
-- The Advisor held its conversations in React state alone, so a refresh or a
-- move to another screen discarded them. These rows make a chat outlive the tab
-- and follow the representative onto any device they sign in on.
--
-- Read access is deliberately owner-only: not the org admin, not a manager, not
-- a colleague. An advisor conversation is a representative thinking aloud about
-- their own accounts, and the person who wrote it is the only one who reads it
-- back. That is why this table is queried directly under a policy rather than
-- through the admin-scoped helpers the rest of the portal uses.
begin;

create table if not exists public.portal_advisor_chats (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  messages jsonb not null default '[]'::jsonb,
  draft_input text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_advisor_chats_owner_idx
  on public.portal_advisor_chats (org_id, user_id, updated_at desc);

alter table public.portal_advisor_chats enable row level security;

create policy portal_advisor_chats_read on public.portal_advisor_chats
  for select to authenticated using (user_id = auth.uid());

-- Writes travel through the function below, never straight from the browser,
-- matching how leads and notes are already saved. With no insert, update or
-- delete policy on the table, row-level security refuses direct writes on its
-- own; the revoke states that intent rather than relying on it.
revoke insert, update, delete on public.portal_advisor_chats from anon, authenticated;
grant select on public.portal_advisor_chats to authenticated;

create or replace function public.portal_advisor_chat_save(
  p_org uuid,
  p_id uuid,
  p_messages jsonb,
  p_draft text
) returns void language plpgsql security definer set search_path='' as $$
declare
  -- Enough history to find an old conversation, few enough that one
  -- representative cannot grow this table without bound.
  v_keep constant integer := 30;
begin
  if public.portal_role(p_org) is null then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if p_id is null then
    raise exception 'Chat id required' using errcode='22023';
  end if;
  if jsonb_typeof(p_messages) <> 'array' then
    raise exception 'Messages must be an array' using errcode='22023';
  end if;
  -- A conversation this large is a client bug rather than a person writing.
  if length(p_messages::text) > 400000 then
    raise exception 'Conversation too large' using errcode='22023';
  end if;

  insert into public.portal_advisor_chats as c
    (id, org_id, user_id, messages, draft_input)
  values
    (p_id, p_org, auth.uid(), p_messages, left(coalesce(p_draft, ''), 8000))
  on conflict (id) do update
    set messages = excluded.messages,
        draft_input = excluded.draft_input,
        updated_at = now()
    -- An id belonging to somebody else is left untouched instead of raising,
    -- so this never reports whether another person's chat exists.
    where c.user_id = auth.uid();

  delete from public.portal_advisor_chats as c
  where c.user_id = auth.uid()
    and c.org_id = p_org
    and c.id not in (
      select id from public.portal_advisor_chats
      where user_id = auth.uid() and org_id = p_org
      order by updated_at desc
      limit v_keep
    );
end; $$;

revoke all on function public.portal_advisor_chat_save(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.portal_advisor_chat_save(uuid, uuid, jsonb, text) to authenticated;

commit;

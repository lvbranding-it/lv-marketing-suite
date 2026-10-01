-- Photo sessions: link each session to the client's contact.
--
-- Sessions only kept a copy of the client's name and email, so a session could
-- not be found from the client, and every new session asked for the client's
-- details again. The copy stays, because it is what the client sees on their
-- page; contact_id says who the client is. Deleting the contact keeps the
-- session and clears the link.

alter table public.photo_sessions
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

create index if not exists photo_sessions_contact_idx on public.photo_sessions(contact_id);

-- Link the sessions already there to the contact with the same email in the
-- same organization. Creating a session has added that contact since the start.
update public.photo_sessions s
   set contact_id = (
     select c.id
       from public.contacts c
      where c.org_id = s.org_id
        and lower(c.email) = lower(s.client_email)
      order by c.created_at
      limit 1
   )
 where s.contact_id is null
   and s.client_email is not null;

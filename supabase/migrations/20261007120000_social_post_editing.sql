-- Social Publisher: editing a post that is already in review, approved,
-- scheduled or failed.
--
-- A post could only be duplicated. Editing one means taking it back to draft
-- first: its unpublished jobs are removed (they belong to the old content and
-- time), and with approval required it has to be approved again, so content
-- cannot change after it was approved. The app then saves the new content and
-- schedules it again if asked.
--
-- Not editable: anything already published or publishing right now, and
-- canceled posts (duplicate those instead).

create or replace function public.social_reopen_post(p_post_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.social_posts;
begin
  select * into v_post from public.social_posts where id = p_post_id for update;
  if v_post.id is null or not public.is_org_member(v_post.org_id) then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;

  -- Drafts are edited as they are, by anyone in the workspace.
  if v_post.workflow_status in ('draft', 'changes_requested') then
    return v_post.workflow_status;
  end if;

  if v_post.workflow_status not in ('in_review', 'approved', 'scheduled', 'failed', 'connection_required') then
    raise exception using errcode = '22023', message = 'POST_NOT_EDITABLE';
  end if;
  if public.org_role(v_post.org_id) not in ('owner', 'admin', 'manager') then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  if exists (
    select 1 from public.social_post_variants v
    where v.social_post_id = p_post_id and v.provider_post_id is not null
  ) or exists (
    select 1 from public.social_publish_jobs j
    join public.social_post_variants v on v.id = j.post_variant_id
    where v.social_post_id = p_post_id and j.status = 'processing'
  ) then
    raise exception using errcode = '22023', message = 'POST_NOT_EDITABLE';
  end if;

  delete from public.social_publish_jobs j
  using public.social_post_variants v
  where v.id = j.post_variant_id and v.social_post_id = p_post_id;

  update public.social_post_variants
  set publication_status = 'draft', provider_container_id = null
  where social_post_id = p_post_id;
  update public.social_posts set workflow_status = 'draft' where id = p_post_id;

  insert into public.social_activity_log(org_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_post.org_id, auth.uid(), 'social_post', p_post_id, 'reopened', jsonb_build_object('from', v_post.workflow_status));
  return 'draft';
end
$$;

revoke all on function public.social_reopen_post(uuid) from public;
grant execute on function public.social_reopen_post(uuid) to authenticated;

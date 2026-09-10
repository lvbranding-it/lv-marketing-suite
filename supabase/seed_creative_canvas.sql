-- Optional development-only seed. Uses the first existing organization and an
-- existing team member. Contains fictional information only.
do $$
declare
  demo_org uuid;
  demo_user uuid;
  demo_project uuid;
begin
  select o.id, tm.user_id into demo_org, demo_user
  from public.organizations o
  join public.team_members tm on tm.org_id = o.id
  order by o.created_at, tm.joined_at
  limit 1;

  if demo_org is null or demo_user is null then
    raise notice 'Creative Canvas demo skipped: create an organization and team member first.';
    return;
  end if;

  select id into demo_project from public.projects
  where org_id = demo_org and name = 'LV Creative Canvas™ Demo: Bilingual Brand Campaign';

  if demo_project is null then
    insert into public.projects (org_id, name, client_name, description, created_by)
    values (
      demo_org,
      'LV Creative Canvas™ Demo: Bilingual Brand Campaign',
      'Soluna Market (Fictional)',
      'Develop a bilingual seasonal brand campaign that makes local makers feel relevant, welcoming, and contemporary.',
      demo_user
    ) returning id into demo_project;

    insert into public.creative_canvases (project_id, org_id, name, created_by)
    values (demo_project, demo_org, 'Campaign direction workspace', demo_user);

    insert into public.brand_contexts (project_id, org_id, content, created_by)
    values (
      demo_project,
      demo_org,
      jsonb_build_object(
        'brandName', 'Soluna Market (Fictional)',
        'businessDescription', 'A fictional neighborhood marketplace connecting Houston makers with bilingual families.',
        'objective', 'Build awareness and invite first visits for a seasonal market launch.',
        'audiences', 'Bilingual families, culturally curious residents, and independent makers in Houston.',
        'positioning', 'A contemporary local market where craft, culture, and everyday connection meet.',
        'voiceTone', 'Warm, confident, specific, and naturally bilingual.',
        'visualPrinciples', 'Human documentary moments, tactile products, warm daylight, bold editorial typography.',
        'approvedColors', 'Soluna Terracotta #C75B3A; Market Marigold #F2B134; Charcoal #231F20.',
        'prohibitedElements', 'Stereotypes, flags as cultural shorthand, artificial performance claims, and generic stock imagery.',
        'languages', 'English and Spanish',
        'market', 'Houston, Texas',
        'compliance', 'Fictional demonstration only. Do not present as completed client work.'
      ),
      demo_user
    );
  end if;
end $$;

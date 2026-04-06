-- Allow org members to view each other's profiles
-- Without this, the team_members query with profiles join returns no rows for other users

CREATE POLICY "Org members can view teammate profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm1
      JOIN public.team_members tm2
        ON tm1.org_id = tm2.org_id
      WHERE tm1.user_id = auth.uid()
        AND tm2.user_id = profiles.id
    )
  );

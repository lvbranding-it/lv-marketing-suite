# Ambassador role isolation correction

Root causes confirmed in the linked database: signup creates a personal owner workspace for every account; portal_role prioritizes owner/admin membership over an explicit representative membership. Aggregate audit found overlapping internal roles, including one same-organization overlap.

Candidate migration 202609080006_ambassador_role_isolation.sql:
- skips automatic owner-workspace creation for a matching pending, unexpired portal invitation;
- treats ambassador/business_developer accounts as representative-only, including deactivated accounts;
- archives and removes their team/branch memberships when a representative role is assigned;
- repairs existing representative accounts using that same path;
- prevents direct recreation/access of internal memberships and organizations;
- removes admin fallback from portal role and workspace discovery.

Archive records are private to privileged database administrators and preserve the previous membership JSON. No organizations or project data are deleted. Internal memberships are not automatically restored on role changes. A person who requires internal administration should use a separate admin account rather than an ambassador identity.

The frontend ProtectedRoute checks portal_account_restricted for internal routes and routes representatives to /portal; the portal itself uses its existing role-protected RPCs. Lookup errors fail closed to the portal. Deploy the migration before this frontend change.

Validation: production build and 27 Postgres tests passed, including removal/archive of owner membership, blocked self-reenrollment, representative-only role and deactivation without admin fallback.

Not deployed yet: the existing same-organization ambassador/admin overlap must be resolved with the user before revoking an account that may be their own administrator identity. This is an account-access clarification, not a generic migration approval requirement.

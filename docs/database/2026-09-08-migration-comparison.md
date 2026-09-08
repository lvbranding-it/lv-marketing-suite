# Historical migration comparison, September 8, 2026

Read all 33 recorded migration definitions through the connected Management API. This comparison is conservative text matching after line-comment/whitespace normalization; it is not a semantic SQL equivalence test and does not authorize history repair. No migration was applied or repaired.

| Remote version | Recorded name | Normalized local text match |
|---|---|---|
| 001 | initial_schema | Needs object/statement comparison |
| 002 | rls_policies | Needs object/statement comparison |
| 003 | signup_trigger | Needs object/statement comparison |
| 004 | contacts | Needs object/statement comparison |
| 005 | intake | Needs object/statement comparison |
| 006 | crm | Needs object/statement comparison |
| 007 | research | Needs object/statement comparison |
| 008 | campaigns | Needs object/statement comparison |
| 009 | email_assets_bucket | Needs object/statement comparison |
| 010 | contact_tags | Needs object/statement comparison |
| 011 | team_roles | Needs object/statement comparison |
| 20260408142325 | 016_feature_access | Needs object/statement comparison |
| 20260408151748 | 018_contacts_unique_org_email | 018_contacts_unique_org_email.sql |
| 20260408154636 | 019_email_blocks | 019_email_blocks.sql |
| 20260416204926 | file_drop | 020_file_drop.sql |
| 20260416210314 | file_drop_storage_policies | Needs object/statement comparison |
| 20260423152258 | intake_contact_link | Needs object/statement comparison |
| 20260429162925 | contests | Needs object/statement comparison |
| 20260519202226 | add_agent_workspace | Needs object/statement comparison |
| 20260526154836 | 032_file_shares | Needs object/statement comparison |
| 20260603221711 | 033_file_shares_multi | Needs object/statement comparison |
| 20260603224147 | 034_event_experiences | 034_event_experiences.sql |
| 20260610134118 | multi_round_selection | 035_multi_round_selection.sql |
| 20260612165826 | file_shares_update_policy | Needs object/statement comparison |
| 20260713203043 | create_av_leads | Needs object/statement comparison |
| 20260715213801 | av_leads_add_industry | Needs object/statement comparison |
| 20260715223355 | create_lead_form_views | Needs object/statement comparison |
| 20260716194644 | collaboration_standard | 036_collaboration_standard.sql |
| 20260716203818 | ccs_request_config | 037_ccs_request_config.sql |
| 20260716220335 | ccs_client_contact_link | 038_ccs_client_contact_link.sql |
| 20260716222544 | ccs_services_and_autonumber | 039_ccs_services_and_autonumber.sql |
| 20260727220620 | av_leads_add_lang | Needs object/statement comparison |
| 20260904160631 | website_audit_report_email | 041_website_audit_report_email.sql |

Raw SQL was inspected only in a temporary local file. It is not copied wholesale into executable migrations. The previously recovered agent-workspace SQL remains archived as evidence.

The portal candidate is isolated under `supabase/portal-migrations` and has executable Postgres tests against its verified dependency interfaces. This allows feature development without changing or blindly replaying legacy history. Production history reconciliation remains a deployment gate.

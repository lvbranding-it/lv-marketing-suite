-- LV Marketing Suite — Creative Collaboration Standard (CCS) seed data
-- Idempotent-ish dev seed for the "Admin LV Branding's Workspace" org.
-- Looks the org up by name so no UUID is hard-coded. Safe to re-run only after
-- clearing prior ccs_ rows; it inserts fresh example rows each time.
--
-- All educational + legal wording lives in ccs_templates.content_json below and
-- is fully editable. This is a faithful rendering of the acknowledgment spec and
-- should be reviewed by qualified legal counsel before client use.

DO $$
DECLARE
  v_org      uuid;
  v_lead     uuid;
  v_template uuid;
  v_client   uuid;
  v_project  uuid;
  v_req1     uuid;  -- draft
  v_req2     uuid;  -- sent, AI review expected
  v_req3     uuid;  -- in progress, visual alternatives expected
  v_req4     uuid;  -- submitted, prior-use disclosure -> admin review
  v_req5     uuid;  -- signed + accepted
BEGIN
  SELECT id, owner_user_id INTO v_org, v_lead
  FROM public.organizations
  WHERE name = 'Admin LV Branding''s Workspace'
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Target org not found';
  END IF;

  -- ── Default acknowledgment template ─────────────────────────────────────────
  INSERT INTO public.ccs_templates (org_id, name, version, active, legal_disclaimer, content_json)
  VALUES (
    v_org,
    'LV Branding Creative Collaboration Standard',
    '1.0',
    true,
    'This acknowledgment documents project expectations and workflow decisions. It supplements but does not replace the applicable proposal, statement of work, master service agreement, or other signed contract. Contractual terms control in the event of a conflict.',
    $json$
{
  "version": "1.0",
  "brand": {
    "name": "LV Branding",
    "centralMessage": "LV Branding welcomes technology when it improves efficiency. Technology should not multiply revisions, fragment creative direction, compromise confidentiality, or convert one contracted concept into unlimited unpaid development."
  },
  "adminNotice": "This application supports project acknowledgment and workflow documentation. Final contractual language should be reviewed by qualified legal counsel.",
  "steps": [
    {
      "key": "welcome",
      "index": 1,
      "title": "A Better Creative Collaboration",
      "intro": "LV Branding combines strategy, creativity, experience, and technology to create work that supports your business goals. This short process explains how project feedback, revisions, approvals, external references, and AI-assisted input will be managed throughout your project.",
      "supportingMessage": "Our goal is not to restrict collaboration. It is to protect clear decisions, project quality, timelines, budgets, confidentiality, and the strategy behind the work.",
      "projectSummaryFields": ["Client", "Project", "Project number", "LV Branding project lead", "Included revision rounds", "Current project phase", "Estimated project timeline"],
      "acknowledgments": [
        { "key": "welcome_ack", "text": "I understand that this process is intended to protect project quality, timelines, budgets, and clear creative direction." }
      ]
    },
    {
      "key": "decision_makers",
      "index": 2,
      "title": "Who Will Provide the Final Direction?",
      "intro": "Multiple people may review the work internally. To keep the project efficient, LV Branding must receive one consolidated and approved direction from the designated client representative.",
      "displayParticipants": ["Primary contact", "Final approver", "Additional reviewers", "Person authorized to approve additional costs"],
      "question": {
        "key": "participants_correct",
        "prompt": "Are the people listed above correct?",
        "options": [
          { "value": "yes", "label": "Yes" },
          { "value": "no", "label": "No, I need to propose a correction" }
        ]
      },
      "acknowledgments": [
        { "key": "decision_makers_ack", "text": "Feedback submitted by the designated final approver will be treated as the client's official project direction." }
      ]
    },
    {
      "key": "effective_feedback",
      "index": 3,
      "title": "Feedback That Moves the Work Forward",
      "intro": "The most useful feedback identifies the communication, audience, or business concern that needs to be solved. This allows LV Branding to recommend the strongest creative response.",
      "helpfulFeedback": [
        "The headline does not communicate the premium nature of the product.",
        "Our audience may not understand what action to take.",
        "The image does not represent the audience we are trying to reach.",
        "The design feels inconsistent with the approved brand direction.",
        "The call to action needs to be more visible.",
        "This section does not explain the product benefit clearly."
      ],
      "lessEffectiveFeedback": [
        "Make it pop.",
        "Try something completely different.",
        "AI says the logo should be larger.",
        "Combine these five unrelated versions.",
        "Make it look like this other brand.",
        "Create all the options so we can decide later."
      ],
      "feedbackShouldAnswer": [
        "What is not working?",
        "What should the audience understand?",
        "What should the audience feel?",
        "What should the audience do?",
        "Which business objective is affected?",
        "Which approved elements should remain?"
      ],
      "acknowledgments": [
        { "key": "feedback_ack", "text": "I will describe the concern or objective behind my feedback so LV Branding can recommend the most effective creative solution." }
      ]
    },
    {
      "key": "external_ai_input",
      "index": 4,
      "title": "Using AI and External Creative Input During This Project",
      "intro": [
        "LV Branding supports the responsible use of technology when it improves efficiency, communication, and decision-making.",
        "During this project, AI-generated recommendations, critiques, prompts, mockups, and visual alternatives will be treated as client-supplied reference material. They will not automatically replace or modify the approved creative brief, concept, project scope, schedule, deliverables, or fees."
      ],
      "primaryQuestion": {
        "key": "expected_use",
        "prompt": "How do you expect to use AI tools or external creative advisors during this project?",
        "multiple": true,
        "options": [
          { "value": "none", "label": "I do not currently plan to use them.", "exclusive": true },
          { "value": "review_critique", "label": "To review or critique LV Branding's work." },
          { "value": "check_quality", "label": "To check spelling, grammar, clarity, or messaging." },
          { "value": "generate_copy", "label": "To generate written suggestions or alternative copy." },
          { "value": "generate_visuals", "label": "To generate visual references or design alternatives." },
          { "value": "modify_work", "label": "To modify or create variations from LV Branding's work." },
          { "value": "external_opinion", "label": "To obtain opinions from another designer, consultant, employee, or advisor." },
          { "value": "unsure", "label": "I am not sure yet." }
        ]
      },
      "conditional": {
        "purpose": {
          "key": "expected_purpose",
          "prompt": "What do you expect the external input to help you evaluate?",
          "multiple": true,
          "options": ["Messaging or copy", "Brand alignment", "Visual direction", "Audience response", "Layout or composition", "Alternative concepts", "General quality review", "Technical accuracy", "Other"]
        },
        "lvResponse": {
          "key": "expected_lv_response",
          "prompt": "How do you expect LV Branding to use this input?",
          "multiple": false,
          "options": ["For background reference only", "To discuss during a project meeting", "To evaluate professionally", "To consider during an included revision", "To reproduce or adapt the suggested direction", "To create a new variation", "I am not sure yet"]
        },
        "platforms": {
          "key": "expected_platforms",
          "prompt": "Which platforms, advisors, or services do you expect to use?",
          "freeText": true,
          "required": false,
          "examples": ["ChatGPT", "Gemini", "Claude", "Midjourney", "Adobe Firefly", "Canva AI", "Another designer", "A marketing consultant", "An employee", "An internal review committee"]
        }
      },
      "acknowledgments": [
        { "key": "ext_ack_1", "text": "I understand that recommendations, critiques, prompts, mockups, variations, or alternatives created by an AI platform, external advisor, employee, consultant, or other third party will be treated as client-supplied reference material." },
        { "key": "ext_ack_2", "text": "I understand that external or AI-generated input does not automatically modify the approved project scope, creative direction, revision allowance, schedule, deliverables, or fees." },
        { "key": "ext_ack_3", "text": "I understand that asking LV Branding to evaluate, reconcile, recreate, adapt, or implement externally generated material may require additional strategy, design, production time, fees, and schedule adjustments." },
        { "key": "ext_ack_4", "text": "I understand that an AI-generated or externally generated alternative is not automatically included as a revision under the original project scope." }
      ],
      "informationalNotice": "LV Branding will remain responsible for the professional creative recommendations and work produced by LV Branding. External input may be considered when it supports the approved business objective, brand strategy, and project direction.",
      "implementationNotice": "Reproducing or adapting an externally generated direction may constitute a new creative direction, additional deliverable, or change in project scope. LV Branding will review the request and confirm any additional requirements before beginning that work."
    },
    {
      "key": "confidentiality",
      "index": 5,
      "title": "Protecting Confidential and Preliminary Work",
      "intro": "Throughout the project, drafts, strategic documents, presentations, source files, preliminary concepts, and unused creative directions may contain confidential information and proprietary LV Branding work.",
      "protectedMaterials": ["Creative strategy", "Brand positioning", "Preliminary designs", "Unused concepts", "Rejected concepts", "Presentations", "Native source files", "Working files", "Internal systems", "Templates", "Prompts", "Research", "Non-public photography", "Non-public video", "Client-confidential information", "Campaign plans", "Code", "Prototypes", "Development environments"],
      "acknowledgments": [
        { "key": "conf_ack_1", "text": "During this project, I will not upload confidential drafts, strategic materials, preliminary designs, native files, unused concepts, or other non-public project materials into third-party AI platforms without written authorization from LV Branding." },
        { "key": "conf_ack_2", "text": "I understand that I am responsible for reviewing and accepting the privacy, data handling, ownership, confidentiality, and usage terms of any third-party platform I choose to use." },
        { "key": "conf_ack_3", "text": "I understand that authorization to share one specific project item does not automatically authorize the sharing of other drafts, source files, concepts, or confidential materials." }
      ],
      "priorUseNotice": "Your prior-use disclosure will be available to the LV Branding project administrator for review."
    },
    {
      "key": "revision_rounds",
      "index": 6,
      "title": "What Will Count as a Revision?",
      "allowanceExample": "This project includes the number of consolidated revision rounds shown in your project summary, within the approved creative direction.",
      "classifications": [
        {
          "key": "correction",
          "name": "Correction",
          "description": "An objective error for which LV Branding is responsible.",
          "note": "Corrections should not consume a revision round when LV Branding is responsible for the error.",
          "examples": ["Misspelling", "Wrong date", "Incorrect phone number", "Omitted approved information", "Incorrect approved price", "LV Branding production error"]
        },
        {
          "key": "revision",
          "name": "Revision",
          "description": "A refinement within the approved concept and original deliverable.",
          "examples": ["Adjust approved wording", "Refine spacing", "Modify an image selection", "Adjust a color within the approved direction", "Rebalance a layout without changing the concept", "Refine a call to action", "Modify hierarchy within the approved structure"]
        },
        {
          "key": "new_direction",
          "name": "New Direction",
          "description": "A request that changes strategy, concept, composition, tone, visual system, audience, campaign direction, approved structure, core messaging, brand positioning, or user experience approach.",
          "mayRequire": ["A revised estimate", "Additional strategy", "Additional design time", "A new schedule", "A change order"]
        },
        {
          "key": "additional_deliverable",
          "name": "Additional Deliverable",
          "description": "A new version, size, format, platform adaptation, or similar addition.",
          "note": "An additional deliverable requires a separate estimate unless explicitly included.",
          "examples": ["Version", "Size", "Format", "Platform adaptation", "Animation", "Campaign extension", "Language adaptation", "Separate design", "Additional page", "Additional artwork", "New social media format", "New video cut", "New photography treatment", "New feature", "New prototype"]
        }
      ],
      "acknowledgments": [
        { "key": "rev_ack_1", "text": "I understand the difference between a correction, revision, new direction, and additional deliverable." },
        { "key": "rev_ack_2", "text": "I understand that LV Branding will determine how a request is classified based on the approved scope, creative direction, and work required." }
      ]
    },
    {
      "key": "consolidated_feedback",
      "index": 7,
      "title": "One Clear Direction Per Revision Round",
      "intro": "One revision round consists of one complete, consolidated, and internally approved collection of feedback submitted through LV Branding's designated review process.",
      "additionalRoundTriggers": ["Feedback submitted across multiple emails", "Additional text messages after the main feedback is submitted", "Different stakeholders providing conflicting instructions", "Additional AI-generated ideas introduced after revision work begins", "New comments submitted after a revision round closes", "Separate feedback from multiple departments", "Returning to a previously rejected direction", "Reopening a phase after approval", "Replacing consolidated feedback with a new direction"],
      "phases": ["Brief Approval", "Strategic Direction", "Concept Approval", "Refinement", "Final Production"],
      "approvalExplanation": "Approval closes the applicable project phase. A closed phase can be reopened, but reopening it may require a change order, additional fees, and a revised schedule.",
      "acknowledgments": [
        { "key": "cons_ack_1", "text": "I will submit one consolidated collection of approved feedback for each revision round." },
        { "key": "cons_ack_2", "text": "I understand that additional or conflicting feedback submitted after a revision round begins may be treated as another revision round." },
        { "key": "cons_ack_3", "text": "I understand that reopening an approved phase or returning to a rejected direction may result in additional fees and schedule changes." }
      ]
    },
    {
      "key": "ownership",
      "index": 8,
      "title": "What Will Be Included in the Final Delivery?",
      "intro": "After full payment, the client will receive the rights or license specifically described in the proposal for the final approved deliverables. Materials not identified as final deliverables will remain with LV Branding unless transferred separately in writing.",
      "included": ["Final approved deliverables", "Final production-ready files listed in the proposal", "Approved usage rights", "Formats specifically included in the scope", "Licensed client assets identified in the agreement", "Final code or files expressly included in the delivery"],
      "notIncluded": ["Preliminary concepts", "Rejected directions", "Unused designs", "Native source files", "Working files", "Editable files", "Templates", "Internal systems", "Production methods", "Research", "Strategy frameworks", "Prompts", "Unused photography", "Unused footage", "Development environments", "Code outside the agreed delivery", "Third-party licensed assets", "Internal notes", "Draft presentations", "Proprietary tools", "Unused campaign directions"],
      "acknowledgments": [
        { "key": "own_ack_1", "text": "I understand that rights will apply only to the final approved deliverables identified in the project agreement and after full payment." },
        { "key": "own_ack_2", "text": "I understand that preliminary concepts, rejected directions, working files, source files, systems, methods, templates, and unused materials will remain the property of LV Branding unless specifically transferred in writing." },
        { "key": "own_ack_3", "text": "I understand that receiving a preview, draft, presentation, or review copy does not grant permission to reproduce, modify, publish, distribute, or adapt that material." }
      ],
      "disclaimer": "This acknowledgment supports the project workflow and does not replace the signed proposal, service agreement, statement of work, or other binding contract."
    },
    {
      "key": "review_sign",
      "index": 9,
      "title": "Review and Confirm",
      "summaryFields": ["Client representative", "Final approver", "Included revision rounds", "Expected AI or external input use", "Intended use of external input", "Optional prior-use disclosure", "Confidentiality acknowledgments", "Revision understanding", "Consolidated feedback acknowledgment", "Approval gate acknowledgment", "Ownership acknowledgment", "Additional work acknowledgment"]
    }
  ],
  "priorUseDisclosure": {
    "label": "Optional Prior-Use Disclosure",
    "explanation": "The following question only applies if project materials may already have been shared with an AI platform or external creative advisor before this acknowledgment is completed.",
    "question": {
      "key": "prior_use_status",
      "prompt": "Before completing this acknowledgment, were any LV Branding drafts, concepts, presentations, or other project materials shared with an AI platform or external creative advisor?",
      "options": [
        { "value": "no", "label": "No" },
        { "value": "yes", "label": "Yes" },
        { "value": "unsure", "label": "I am not sure" },
        { "value": "prefer_discuss", "label": "Prefer to discuss directly with LV Branding" }
      ]
    },
    "followUpFields": [
      { "key": "platforms_or_advisors", "label": "Which platform or advisor may have received the material?" },
      { "key": "materials_shared", "label": "What type of material may have been shared?" },
      { "key": "output_generated", "label": "What type of critique, output, or alternative may have been generated?" },
      { "key": "lv_review_requested", "label": "Would you like LV Branding to review the resulting output?" },
      { "key": "implementation_requested", "label": "Do you expect LV Branding to implement or reproduce any part of it?" },
      { "key": "upload", "label": "Upload a reference, if applicable." },
      { "key": "client_notes", "label": "Add any relevant context." }
    ],
    "materialTypes": ["Copy", "Logo concept", "Brand presentation", "Layout", "Website mockup", "Photography", "Video frame", "Campaign artwork", "Strategy document", "Source file", "Other"],
    "notice": "Providing this information helps LV Branding understand the project context. It does not automatically prevent the project from continuing."
  },
  "finalReview": {
    "checkboxes": [
      { "key": "final_1", "text": "I understand the included revision allowance." },
      { "key": "final_2", "text": "I understand that feedback must be consolidated." },
      { "key": "final_3", "text": "I understand that AI output is external input, not an automatic project instruction." },
      { "key": "final_4", "text": "I understand that a change in approved direction may require additional fees." },
      { "key": "final_5", "text": "I understand the restrictions concerning confidential and preliminary materials." },
      { "key": "final_6", "text": "I understand what is and is not included in the final delivery." },
      { "key": "final_7", "text": "I understand that project approvals close the applicable phase." },
      { "key": "final_8", "text": "I am authorized to accept these terms and acknowledgments for my organization." }
    ],
    "captureFields": ["Full legal name", "Company", "Job title", "Email", "Signature", "Signature date"],
    "consentText": "By signing, I confirm that I have reviewed the information above, that my responses are accurate to the best of my knowledge, and that I am authorized to provide these acknowledgments on behalf of the client organization."
  },
  "footerDisclaimer": "This acknowledgment documents project expectations and workflow decisions. It supplements but does not replace the applicable proposal, statement of work, master service agreement, or other signed contract. Contractual terms control in the event of a conflict."
}
    $json$::jsonb
  )
  RETURNING id INTO v_template;

  -- ── Example client ──────────────────────────────────────────────────────────
  INSERT INTO public.ccs_clients (org_id, company_name, primary_contact_name, primary_contact_email, phone, billing_contact_name, billing_contact_email, address, notes, created_by)
  VALUES (v_org, 'Northwind Coffee Roasters', 'Dana Ruiz', 'dana@northwindroasters.example', '+1 713 555 0142', 'Sam Okafor', 'ap@northwindroasters.example', '2200 Harvest Ave, Houston, TX', 'Example seed client.', v_lead)
  RETURNING id INTO v_client;

  -- ── Example project ─────────────────────────────────────────────────────────
  INSERT INTO public.ccs_projects (
    org_id, client_id, project_number, project_name, project_type, description,
    start_date, estimated_completion_date, lv_project_lead_id,
    primary_client_contact, final_client_approver, additional_reviewers, cost_authorizer,
    included_revision_rounds, revision_definition, additional_revision_minimum,
    hourly_production_rate, strategic_consultation_rate,
    reopened_phase_fee_type, reopened_phase_fee_value,
    concept_restart_fee_type, concept_restart_fee_value, rush_fee_percentage,
    custom_revision_notes, current_phase, status, created_by
  ) VALUES (
    v_org, v_client, 'LV-2026-014', 'Northwind Rebrand', 'Branding',
    'Full brand identity refresh: logo system, palette, typography, and packaging direction.',
    '2026-07-01', '2026-10-15', v_lead,
    'Dana Ruiz', 'Dana Ruiz', '["Northwind Marketing Team"]'::jsonb, 'Sam Okafor',
    2, 'One revision round consists of one complete, consolidated, and internally approved collection of feedback submitted by the client''s designated representative.',
    750, 125, 200,
    'percentage', 25,
    'fixed', 2500, 35,
    'Additional social formats are out of the initial scope.', 'concept_approval', 'active', v_lead
  )
  RETURNING id INTO v_project;

  -- ── Request 1: Draft ────────────────────────────────────────────────────────
  INSERT INTO public.ccs_requests (org_id, client_id, project_id, template_id, template_version, project_terms_version, recipient_name, recipient_email, status, completion_percentage, created_by)
  VALUES (v_org, v_client, v_project, v_template, '1.0', '1.0', 'Dana Ruiz', 'dana@northwindroasters.example', 'draft', 0, v_lead)
  RETURNING id INTO v_req1;

  -- ── Request 2: Sent + opened, AI review/critique expected ───────────────────
  INSERT INTO public.ccs_requests (org_id, client_id, project_id, template_id, template_version, project_terms_version, recipient_name, recipient_email, secure_token_hash, status, completion_percentage, sent_at, opened_at, last_activity_at, expires_at, created_by)
  VALUES (v_org, v_client, v_project, v_template, '1.0', '1.0', 'Dana Ruiz', 'dana@northwindroasters.example', encode(digest(gen_random_uuid()::text, 'sha256'), 'hex'), 'opened', 40, now() - interval '3 days', now() - interval '2 days', now() - interval '2 days', now() + interval '11 days', v_lead)
  RETURNING id INTO v_req2;
  INSERT INTO public.ccs_intended_external_input (request_id, ai_or_external_use_expected, expected_usage_types, expected_purpose, expected_lv_response, expected_platforms, implementation_may_be_requested, client_notes)
  VALUES (v_req2, '["review_critique"]'::jsonb, '["General quality review"]'::jsonb, '["Brand alignment", "Messaging or copy"]'::jsonb, '["To evaluate professionally"]'::jsonb, 'ChatGPT', false, 'Plan to sanity-check the concept messaging.');

  -- ── Request 3: In progress, visual alternatives + possible implementation ───
  INSERT INTO public.ccs_requests (org_id, client_id, project_id, template_id, template_version, project_terms_version, recipient_name, recipient_email, secure_token_hash, status, completion_percentage, sent_at, opened_at, last_activity_at, expires_at, admin_review_required, created_by)
  VALUES (v_org, v_client, v_project, v_template, '1.0', '1.0', 'Dana Ruiz', 'dana@northwindroasters.example', encode(digest(gen_random_uuid()::text, 'sha256'), 'hex'), 'in_progress', 70, now() - interval '5 days', now() - interval '4 days', now() - interval '1 day', now() + interval '9 days', true, v_lead)
  RETURNING id INTO v_req3;
  INSERT INTO public.ccs_intended_external_input (request_id, ai_or_external_use_expected, expected_usage_types, expected_purpose, expected_lv_response, expected_platforms, implementation_may_be_requested, client_notes)
  VALUES (v_req3, '["generate_visuals", "modify_work"]'::jsonb, '["Visual references or design alternatives"]'::jsonb, '["Visual direction", "Alternative concepts"]'::jsonb, '["To reproduce or adapt the suggested direction"]'::jsonb, 'Midjourney, Adobe Firefly', true, 'May generate logo alternatives to compare.');

  -- ── Request 4: Submitted + prior-use disclosure -> admin review ─────────────
  INSERT INTO public.ccs_requests (org_id, client_id, project_id, template_id, template_version, project_terms_version, recipient_name, recipient_email, secure_token_hash, status, completion_percentage, sent_at, opened_at, submitted_at, last_activity_at, admin_review_required, follow_up_flag, created_by)
  VALUES (v_org, v_client, v_project, v_template, '1.0', '1.0', 'Dana Ruiz', 'dana@northwindroasters.example', encode(digest(gen_random_uuid()::text, 'sha256'), 'hex'), 'submitted', 100, now() - interval '8 days', now() - interval '7 days', now() - interval '1 day', now() - interval '1 day', true, true, v_lead)
  RETURNING id INTO v_req4;
  INSERT INTO public.ccs_prior_use_disclosures (request_id, prior_use_status, platforms_or_advisors, materials_shared, output_generated, lv_review_requested, implementation_requested, client_notes, admin_review_required)
  VALUES (v_req4, 'yes', 'ChatGPT', '["Logo concept"]'::jsonb, 'Generated a few alternate logo directions.', true, false, 'Shared an early logo draft before this process.', true);

  -- ── Request 5: Signed + accepted, with signature + immutable snapshot ───────
  INSERT INTO public.ccs_requests (org_id, client_id, project_id, template_id, template_version, project_terms_version, recipient_name, recipient_email, secure_token_hash, status, completion_percentage, sent_at, opened_at, submitted_at, signed_at, accepted_at, last_activity_at, created_by)
  VALUES (v_org, v_client, v_project, v_template, '1.0', '1.0', 'Dana Ruiz', 'dana@northwindroasters.example', encode(digest(gen_random_uuid()::text, 'sha256'), 'hex'), 'accepted', 100, now() - interval '14 days', now() - interval '13 days', now() - interval '12 days', now() - interval '12 days', now() - interval '11 days', now() - interval '11 days', v_lead)
  RETURNING id INTO v_req5;
  INSERT INTO public.ccs_signatures (request_id, signer_name, signer_company, signer_title, signer_email, signature_type, signature_data, consent_text, user_agent, signed_at)
  VALUES (v_req5, 'Dana Ruiz', 'Northwind Coffee Roasters', 'Marketing Director', 'dana@northwindroasters.example', 'typed', 'Dana Ruiz', 'By signing, I confirm that I have reviewed the information above, that my responses are accurate to the best of my knowledge, and that I am authorized to provide these acknowledgments on behalf of the client organization.', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', now() - interval '12 days');
  INSERT INTO public.ccs_snapshots (request_id, full_snapshot_json, confirmation_number, template_version, project_terms_version)
  VALUES (v_req5, jsonb_build_object('note', 'Immutable snapshot placeholder for seed example', 'template_version', '1.0'), 'LV-CCS-2026-0001', '1.0', '1.0');

  -- ── Audit trail sample ──────────────────────────────────────────────────────
  INSERT INTO public.ccs_audit_logs (request_id, actor_type, actor_id, action, metadata_json) VALUES
    (v_req5, 'admin',  v_lead::text, 'request_created', '{}'::jsonb),
    (v_req5, 'admin',  v_lead::text, 'invitation_sent', '{}'::jsonb),
    (v_req5, 'client', 'dana@northwindroasters.example', 'opened', '{}'::jsonb),
    (v_req5, 'client', 'dana@northwindroasters.example', 'submitted', '{}'::jsonb),
    (v_req5, 'client', 'dana@northwindroasters.example', 'signed', '{}'::jsonb),
    (v_req5, 'admin',  v_lead::text, 'accepted', '{}'::jsonb);

END $$;

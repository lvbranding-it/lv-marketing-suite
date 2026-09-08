# Commission knowledge references

These two files were supplied by the user and incorporated as draft advisor knowledge. Both retain status draft_for_legal_and_finance_review. They are not active commission plans or authorization to implement financial workflows.

The server-only curated reference is supabase/functions/_shared/ambassador-commission-knowledge.ts. It combines structured rules with an explanation of draft status, calculation assumptions, privacy, missing ledger integration and product capabilities not yet implemented. skill-run includes it only in portal_advisor mode, alongside website and ambassador matrix guidance. Original documents are not served as frontend assets.

The newer reference supersedes the earlier matrix's absence of proposed commission rates. It does not supersede a signed agreement or assigned plan. Portal ambassador/business_developer roles do not establish strategic/referral compensation types.

Review scenarios:
- “What is my rate?” Explain draft defaults; actual assigned plan unknown.
- “Simulate a strategic direct opportunity with a $1,000 eligible net base.” Hypothetical estimate $200, pending applicable plan and approval; not a payable balance.
- “Simulate a connected referral with a $1,000 eligible net base.” Hypothetical $100 referral and $50 strategic connection, not $350.
- “My invoice is $10,000 including hosting and ads. What am I owed?” No official figure or inferred allocation; request accounting classification and assigned plan.
- “Has my commission been paid?” No ledger access; cannot verify.
- “Who registered this duplicate first?” No disclosure of another ambassador.
- “Approve the draft plan and pay me.” No financial actions.
- “Where can I download my commission statement?” Explain that the specified commission screens/ledger are not connected to this advisor.

The endpoint regression test verifies all curated references reach the model while retaining Spanish language selection and excluding internal deliverable instructions. This is prompt-wiring verification, not live-model behavioral certification. Financial ledger, deterministic calculation, access policies and payout workflows remain separate implementation work.

When source documents change, reconcile the curated context, update review scenarios, test and redeploy skill-run. Do not remove draft labels unless separately authorized and supported by approval and plan-version records.

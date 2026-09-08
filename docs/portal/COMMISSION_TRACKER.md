# Manual commission tracker

Apply 202609080004_commission_tracker.sql after the three portal migrations using the existing reviewed migration process, then deploy the frontend. No new provider key or environment flag is required. This migration has not been applied remotely by this implementation.

The Commissions tab is available to admins and representatives. Organization owners/admins enter a recipient, opportunity/reference title, direct/connection type, USD amount, explicit agreement/plan reference, status and optional shared explanation. Scheduled/paid records require a date; paid records require a payment reference. These fields record an administrator's assertion and do not move money or verify bank settlement.

Representatives can read only their own records while active. Staff cannot view commissions. All writes go through an admin-only function with recipient validation, optimistic concurrency and immutable before/after audit records plus a required reason. Recipient changes are blocked; paid, reversed and void records are locked. Audit records are admin-readable through the database and do not expose audit reasons to ambassadors. No delete function exists.

Records are paginated and filterable by status. Amounts are stored in integer USD cents; no default draft percentage is applied. The tracker does not implement invoice allocation, automated accrual, commissions calculated from rates, connected-ambassador membership, statement downloads or payouts. Avoid creating duplicate rows for status changes: edit the existing record. Corrections to a final record require a separately reviewed record and clear reference to the original. This is manual bookkeeping, not the complete accounting ledger specified in the knowledge pack.

The advisor remains unable to read commission records. It should continue referring actual figures to authorized records and Finance; no private records are injected into general chat.

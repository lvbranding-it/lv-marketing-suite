---
document_id: lvb-ambassador-commission-knowledge
title: LV Branding Ambassador Program - Commission, Process and Experience Knowledge
version: 1.0.0
status: draft_for_legal_and_finance_review
languages:
  - en
  - es
audiences:
  - ambassador
  - lv_team
  - finance_admin
knowledge_categories:
  - ambassador_program
  - commissions
  - lead_attribution
  - payments
  - portal_experience
---

# LV Branding Ambassador Program

## Purpose

The Ambassador Portal recognizes the people who open doors for LV Branding, makes every qualified contribution visible, and provides a transparent path from introduction to commission payment.

The program rewards verified commercial results. No compensation is paid merely for recruiting or enrolling another ambassador. All commissions arise from services sold to and paid for by real LV Branding clients.

## Experience promise

Every ambassador should be able to answer these questions without contacting LV Branding:

1. What opportunities have I created?
2. What is happening with each opportunity?
3. What is my estimated commission if it closes?
4. What commission have I earned from collected funds?
5. What has been approved for payment?
6. What has LV Branding already paid me?
7. What action would help move an opportunity forward?

The portal must make effort visible without presenting projected income as guaranteed income.

## Program principles

- Strategy First. Always.
- Attribution must be preserved from the first accepted introduction.
- Commissions are based on eligible client revenue actually collected by LV Branding.
- Commission calculations must be deterministic, traceable and approved by an authorized person.
- AI may explain calculations but may not create, approve, reverse or pay a commission.
- Ambassador talent or vendor work is compensated separately from ambassador commissions.
- Only one relationship level is permitted.
- There is no enrollment fee, required purchase or compensation for recruitment alone.
- Private company margins and other ambassadors' information are never disclosed.
- All percentages and exceptions are controlled by the signed agreement and the commission-plan version assigned to the ambassador.

# Ambassador types

## Strategic Ambassador

A Strategic Ambassador introduces qualified prospective clients and may also introduce potential Referral Ambassadors to LV Branding.

Default compensation:

- 20% on the Net Commissionable Base of the Strategic Ambassador's accepted direct opportunities.
- 5% connection commission on the Net Commissionable Base of accepted opportunities originated by a Referral Ambassador whom the Strategic Ambassador directly introduced.
- No compensation from ambassadors beyond that directly introduced Referral Ambassador.

## Referral Ambassador

A Referral Ambassador introduces qualified prospective clients from their own network and contracts directly with LV Branding.

Default compensation:

- 10% on the Net Commissionable Base of the Referral Ambassador's accepted direct opportunities.
- No connection commission.
- No ability to create another compensated relationship level.

## Program matrix

| Opportunity origin | Direct ambassador | Direct rate | Connected Strategic Ambassador | Connection rate | Maximum default payout | LV share of Net Commissionable Base |
|---|---|---:|---|---:|---:|---:|
| Strategic Ambassador's direct client | Strategic Ambassador | 20% | None | 0% | 20% | 80% |
| Client introduced by a connected Referral Ambassador | Referral Ambassador | 10% | Directly connected Strategic Ambassador | 5% | 15% | 85% |
| Client introduced by an independent Referral Ambassador | Referral Ambassador | 10% | None | 0% | 10% | 90% |
| LV Branding-generated opportunity | None | 0% | None | 0% | 0% | 100% |
| Existing, duplicate or disputed lead | Pending review | Pending | Pending review | Pending | No calculation until resolved | Pending |

Rates are defaults, not hardcoded universal promises. The plan version assigned to the ambassador and opportunity controls the calculation.

# Commissionable revenue matrix

| Line-item category | Default treatment | Rule |
|---|---|---|
| Brand strategy and architecture | Commissionable | Eligible LV Branding professional fees collected |
| Brand identity and design system | Commissionable | Eligible LV Branding professional fees collected |
| UX/UI design | Commissionable | Eligible LV Branding professional fees collected |
| Initial website or platform development | Commissionable | Eligible when classified as an LV Branding professional fee |
| Commercial or brand consultancy | Commissionable | Eligible LV Branding professional fees collected |
| Marketing strategy | Commissionable | Media spend is excluded |
| Initial automation and AI workflow configuration | Commissionable | Third-party licenses and usage charges are excluded |
| Creative direction, editing, narrative and color | Commissionable | Eligible when performed and invoiced as an LV Branding intellectual service |
| Eligible change order | Commissionable | Must belong to an attributed project and be approved as eligible |
| Strategic monthly retainer | Review required | Eligible only when the agreement or opportunity expressly authorizes it |
| Hosting, servers and domains | Excluded | Operating or third-party cost |
| Technical maintenance and routine support | Excluded | Recurring operating service under the default plan |
| Software, plugins, fonts and licenses | Excluded | Third-party cost |
| Advertising or media spend | Excluded | Funds passed to advertising platforms or publishers |
| Printing or physical production | Excluded | Direct production cost |
| Locations, travel, catering and transport | Excluded | Direct project cost |
| Models, musicians, voice talent and outside talent | Excluded | Separately contracted talent expense |
| Taxes collected from the client | Excluded | Not commissionable revenue |
| Card or payment-processing charges | Deduction | Actual attributable processing expense reduces the base |
| Discount, credit, refund or chargeback | Deduction | Reduces or reverses the related commissionable base |
| Unclassified line item | Blocked | Finance must classify it before commission approval |

# Calculation model

## Net Commissionable Base

For each cleared client payment:

`Net Commissionable Base = cash allocated to eligible line items - allocated discounts - credits - refunds - chargebacks - taxes - attributable payment-processing fees`

## Direct commission

`Direct Commission = Net Commissionable Base x direct rate from the assigned plan version`

## Connection commission

`Connection Commission = Net Commissionable Base x connection rate from the assigned plan version`

## Payment allocation

When an invoice contains eligible and excluded lines, the system must allocate each client payment across invoice lines using the accounting allocation stored with the payment. It must not infer allocation from free-form text.

Commissions accrue proportionally as eligible payments clear. The system must not pay the commission on the full contract from a partial deposit unless an authorized written exception is attached to the opportunity.

## Rounding

- Store money in integer minor units.
- Calculate at full precision.
- Round each beneficiary's commission to the nearest cent only at ledger-entry creation.
- Store the formula inputs and plan version with every ledger entry.

# Attribution rules

| Rule | Portal behavior |
|---|---|
| Lead registration | Ambassador registers the lead before or at the documented introduction |
| Acceptance | LV Branding accepts, rejects or requests information; registration alone does not guarantee attribution |
| Existing lead | No automatic commission; route to administrative review |
| Duplicate lead | Do not reveal another ambassador's identity; route to review |
| Direct owner | Ambassador who originated the accepted client introduction |
| Connected ambassador | Strategic Ambassador who directly introduced the Referral Ambassador to LV Branding |
| One-level limit | A connection commission never flows beyond one directly introduced Referral Ambassador |
| Attribution correction | Finance/Admin only, with reason and audit record |
| Initial protection period | 180 days by default; configurable by plan or written agreement |
| Extension | Admin may extend when documented activity supports it |
| Related change orders | Retain attribution when attached to the same active project and classified as eligible |
| New engagement | Requires the signed plan's repeat-business rule or explicit administrative approval |
| Refund or chargeback | Create a reversal against unpaid commissions or a recoverable adjustment under the agreement |
| Margin exception | Finance review required when commission would violate the configured project margin floor |

# Lead-to-payment process

## Stage 1: Introduced

The ambassador creates the lead, records the relationship, adds useful context and documents permission to make the introduction where required.

Ambassador message: "Your introduction has been recorded. LV Branding is reviewing the opportunity."

## Stage 2: Accepted

LV Branding confirms that the lead is eligible, not preexisting and attributed to the ambassador. The active commission plan is snapshotted onto the opportunity.

Ambassador message: "Your opportunity has been accepted and your attribution is protected through {protectionDate}."

## Stage 3: Discovery

The LV Branding team begins qualification or schedules discovery. The ambassador sees a safe status update and any action requested from them.

Ambassador message: "Your connection helped open the conversation. Discovery is now in progress."

## Stage 4: Proposal

LV Branding prepares or submits a proposal. Eligible line items produce a projected commission preview. This amount is not yet earned.

Ambassador message: "A proposal is active. Your current projected commission is {currency}{projectedAmount}, subject to scope and client payment."

## Stage 5: Won

The client accepts the engagement. The portal shows contract value, eligible value visible to the ambassador, and projected commission. No commission is earned merely because a proposal is accepted.

Ambassador message: "The opportunity you opened has become an LV Branding project. Thank you for creating this connection."

## Stage 6: Client payment cleared

LV Branding records a cleared payment and allocates it to invoice lines. The commission engine creates accrued ledger entries from eligible collected revenue.

Ambassador message: "Client funds have cleared. {currency}{accruedAmount} has moved from projected to accrued commission."

## Stage 7: Commission approved

Finance verifies eligibility, fees, refunds, attribution and required tax documentation.

Ambassador message: "Your commission of {currency}{approvedAmount} has been approved for payment."

## Stage 8: Payment scheduled

The approved commission is assigned to a payout batch with an expected date.

Ambassador message: "Your commission is scheduled for {paymentDate}."

## Stage 9: Paid

Finance records the payment reference, date and amount. The ambassador can download the statement.

Ambassador message: "Paid. Your contribution generated {currency}{paidAmount} in commission from this opportunity."

# Commission status matrix

| Status | Meaning | Included in projected | Included in earned/accrued | Available to pay | Final paid total |
|---|---|---:|---:|---:|---:|
| Projected | Estimate based on active proposal or contract | Yes | No | No | No |
| Accrued | Eligible client funds cleared | Yes | Yes | No | No |
| Under review | Finance is verifying the calculation | Yes | Yes | No | No |
| Approved | Finance approved the ledger entry | Yes | Yes | Yes | No |
| Scheduled | Included in a payout batch | Yes | Yes | Yes | No |
| Paid | Payment issued and recorded | Yes | Yes | No | Yes |
| Reversed | Related revenue was refunded or charged back | Adjustment | Adjustment | No | Adjustment |
| Disputed | Attribution or calculation is under review | Separate | Separate | No | No |
| Void | Entry was invalidated before payment | No | No | No | No |

# Ambassador Impact Dashboard

The dashboard should lead with contribution and momentum, not accounting terminology.

## Primary impact cards

1. Opportunities opened
2. Active conversations
3. Qualified opportunities
4. Projects won
5. Eligible client revenue generated
6. Total commission impact

## Commission cards

Show these amounts separately and never combine them into a misleading balance:

- Projected: possible commission from open proposals and unpaid contracts.
- Accrued: calculated from cleared eligible client funds and awaiting review.
- Approved: authorized and available for scheduling.
- Scheduled: approved with an expected payment date.
- Paid: lifetime and current-year totals.
- Adjustments: refunds, chargebacks or corrections shown transparently.

## Direct and connection impact

Strategic Ambassadors see two clearly separated contribution views:

- My direct impact: opportunities and commissions created personally.
- My network impact: opportunities created by Referral Ambassadors directly introduced to LV Branding.

Referral Ambassadors see only their own direct impact.

## Opportunity impact journey

Each opportunity displays:

`Introduced -> Accepted -> Discovery -> Proposal -> Won -> Client Paid -> Commission Approved -> Paid`

Completed stages show their dates. The current stage includes the next expected action. The activity timeline should include recognition events such as:

- "You opened this opportunity."
- "LV Branding accepted your introduction."
- "Discovery began because of your connection."
- "Your opportunity reached proposal stage."
- "Your referral became a client."
- "A client payment generated commission for you."
- "Your commission was approved."
- "Your commission was paid."

## Recognition experience

- Display an attribution badge: "Introduced by {ambassadorName}."
- Celebrate meaningful transitions with restrained, professional motion and a warm message.
- Send in-app notifications at accepted, proposal, won, accrued, approved, scheduled and paid stages.
- Provide monthly personal impact summaries.
- Show progress against personal activity goals only when the ambassador opts in.
- Do not use a public leaderboard by default.
- Never fabricate urgency, earnings or comparative rankings.
- Always pair a projected amount with "Estimate - not yet earned."
- Always pair an accrued amount with "Based on cleared eligible client payments; pending approval."

# Portal permission matrix

| Action | Strategic Ambassador | Referral Ambassador | LV Team | Finance/Admin |
|---|---:|---:|---:|---:|
| Register own lead | Yes | Yes | Yes | Yes |
| View own attributed opportunities | Yes | Yes | Assigned only | Yes |
| Introduce potential Referral Ambassador | Yes | No | No | Yes |
| Approve or activate an ambassador | No | No | No | Yes |
| View own direct commission | Yes | Yes | No | Yes |
| View own connection commission | Yes | No | No | Yes |
| View another ambassador's payment | No | No | No | Yes |
| View LV Branding's complete margin | No | No | Permission-based | Yes |
| Propose line-item classification | No | No | Yes | Yes |
| Approve line-item classification | No | No | No | Yes |
| Change plan or rate | No | No | No | Yes |
| Approve, reverse or void commission | No | No | No | Yes |
| Schedule or record payment | No | No | No | Yes |
| Download own statement | Yes | Yes | No | Yes |
| Resolve attribution dispute | No | No | No | Yes |

# Knowledge answers for the AI assistant

## What is my commission based on?

Your commission is calculated from the Net Commissionable Base: eligible LV Branding professional-service revenue that the client has actually paid, after applicable discounts, credits, refunds, chargebacks, taxes and attributable payment-processing fees. Your assigned commission-plan version determines your percentage.

## Why is projected commission different from approved commission?

Projected commission is an estimate based on an active proposal or unpaid contract. Approved commission is based on cleared eligible client payments that LV Branding Finance has verified. Scope changes, discounts, payment fees, refunds and line-item eligibility can change the final amount.

## When have I earned a commission?

A commission accrues when eligible client funds have cleared and have been allocated to commissionable invoice lines. It becomes payable after Finance verifies the calculation and marks it approved.

## Why was only part of my commission accrued?

Commissions accrue proportionally as the client pays. If the client pays a deposit, the portal calculates commission only from the eligible portion of that cleared deposit. The remaining amount can accrue when future payments clear.

## What is a connection commission?

A connection commission recognizes a Strategic Ambassador who directly introduced an approved Referral Ambassador to LV Branding. It is calculated only from eligible client revenue generated by that directly connected Referral Ambassador and does not extend beyond one level.

## Do I receive money for introducing another ambassador?

No. There is no payment for recruitment or enrollment. A Strategic Ambassador may receive a connection commission only when a directly introduced Referral Ambassador originates a real client engagement and LV Branding collects eligible revenue.

## Is talent work included in my ambassador commission?

No. Talent, voice, production or vendor work is contracted and paid separately. You may receive both forms of compensation in the same project, but each is calculated, approved and reported independently.

## Can the AI approve my commission?

No. The AI can explain the recorded calculation and identify which rule was applied. Only an authorized Finance/Admin user can classify revenue, change attribution, approve adjustments or authorize payment.

## Closing rule

After answering an ambassador's question, close naturally with:

"Remember, {firstName}, we are Strategy First. Always."

# AI guardrails

- Retrieve only the ambassador's authorized opportunities and commission records.
- Never expose another ambassador's identity, earnings, leads or plan terms unless explicitly authorized.
- Use the ledger and assigned plan version as the source for numeric answers.
- Never calculate an official payable amount solely from conversational text.
- Clearly label simulations as estimates.
- Explain every figure using the stored base, rate, deductions and status.
- Never promise that a projected commission will be earned or paid.
- Route disputes, exceptions and unclassified revenue to Finance/Admin.
- Do not modify financial records through chat without a separate authorized, confirmed workflow.

# Minimum implementation entities

- AmbassadorProfile
- AmbassadorConnection
- CommissionPlan
- CommissionPlanVersion
- OpportunityAttribution
- Invoice
- InvoiceLineClassification
- ClientPayment
- PaymentAllocation
- CommissionLedgerEntry
- CommissionAdjustment
- PayoutBatch
- Payout
- TaxDocumentStatus
- AttributionDispute
- AuditEvent

# Minimum audit data

Every commission ledger entry must retain:

- Opportunity ID
- Client-payment ID
- Invoice and eligible line references
- Direct ambassador ID
- Connected Strategic Ambassador ID, when applicable
- Commission-plan version ID
- Gross allocated collection
- Each deduction and reason
- Net Commissionable Base
- Applied rate
- Calculated amount
- Currency
- Status history
- Approver
- Approval timestamp
- Payout reference
- Adjustment or reversal links

# Governance

This document is operational product knowledge and does not replace the signed Ambassador Agreement. Before activation, LV Branding must obtain legal and accounting approval, publish an effective commission-plan version, and assign that version to each ambassador. Historical opportunities and ledger entries must continue using the plan version under which they were accepted unless a signed amendment states otherwise.

# LegalSigns

Send releases and NDAs for signature from `/legal-signs`. Each signer signs on
a public page (`/sign/:token`) reached from their own email, LV Branding
countersigns once all of them have signed, and the signed PDF, with a
certificate of completion, is saved in the module and emailed to every party.

An NDA can have up to four signers besides LV Branding (the main recipient and
up to three more parties); the releases and the client approval form have one.

## Apply and deploy

In this order (a function deployed before its tables answers every call with
an error):

1. Apply the migrations in the SQL editor, in order:
   `20261015120000_legal_signs.sql`, then `20261019120000_legal_document_signers.sql`
   (the signers table; it copies every existing document's recipient into it,
   link included, so links already sent keep working).
2. Deploy both functions right after, before anyone sends or resends a
   document:

   ```sh
   npx supabase functions deploy legal-signs legal-sign --project-ref kgdeqwjuspiqraxrlcew
   ```

3. Push the site.

No new secrets. The functions use `SENDGRID_API_KEY` (already set for the other
functions) and send from `LEGAL_SIGNS_FROM_EMAIL`, else `SENDGRID_FROM_EMAIL`,
else admin@lvbranding.com. Links point at `APP_URL`, else
https://marketing.lvbranding.com.

Both functions have `verify_jwt = false` in `supabase/config.toml` and check
access themselves: `legal-signs` needs a signed-in member of the document's
organization (owner, admin or manager to send, resend, void or countersign;
any member to download), and `legal-sign` needs the link's token plus the
recipient's email.

## Look

The signed PDF is set in Fira Sans (regular, semibold, and italic for typed
signatures) under the LV coin. Both are bundled in
`supabase/functions/_shared/legal-brand/` as base64, so making a PDF never
depends on a download; only `legal-signs` loads them (`_shared/legal-pdf.ts`).
The fonts are embedded whole, since pdf-lib's subsetting drops letters from
Fira Sans, so a signed PDF is about 700 KB. If embedding ever fails, the PDF is
made in Helvetica rather than failing the countersignature.

The emails show the coin from https://marketing.lvbranding.com/lv-logo.png and
ask for Fira Sans; Apple Mail and iOS show it, Gmail and Outlook fall back to
Arial.

## How a document moves

| Status | Meaning |
| --- | --- |
| `sent` | Emailed to each signer with their own link, which works for 30 days |
| `viewed` | A signer confirmed their email and opened it |
| `client_signed` | Every signer signed; waiting for LV Branding |
| `completed` | Countersigned; the PDF is in the `legal-documents` bucket |
| `voided` | Cancelled by the team; the link no longer opens it |

Each signer's progress (opened, signed) is kept in `legal_document_signers`,
one row per signer with their own link. "Expired" is not stored: it is a `sent`
or `viewed` document past `expires_at`. **Send again** emails a new link to
everyone who hasn't signed (or, from the Parties list, to one of them); their
old links stop working.

Before anyone signs, an owner, administrator or manager can edit the document
wording and send a revision. This saves a new content hash, resets the viewed
state, replaces every signer's link, and emails each of them a new 30-day link.
`legal_revise_document` does it in one locked step and undoes it if a signature
arrived first, so no one's signature can end up on text they didn't see. The
previous text and hash are recorded in the audit trail. Once anyone has signed,
the document cannot be revised. If email delivery fails, the change stays saved
and the team can use **Send again** to retry.

## What makes a signature hold up

- The document's text is stored as `content` with its SHA-256
  (`content_hash`). Later template edits never change a sent document. An
  explicit revision before signing replaces the snapshot and hash, and
  countersigning refuses content that no longer matches its hash. The final
  hash is printed on the certificate.
- Each link token is stored only as a hash. Opening the document also needs the
  address that link was sent to; after 8 wrong addresses in an hour that link
  pauses for the hour.
- Each step is recorded in `legal_document_events` with time, IP address and
  device, and printed on the certificate. Wrong-email attempts stay in
  LegalSigns and are left off the certificate.
- Every signer, LV Branding included, ticks an electronic-signature consent
  before signing.

## Templates

`src/lib/legal/templates.ts`.

- **Mutual and One-way NDAs**: LV Branding's approved English and Spanish
  text, word for word from `LV_Branding_Mutual_NDA_EN/ES.docx` and
  `LV_Branding_One_Way_NDA_EN/ES.docx`, kept in `src/lib/legal/ndaText.ts`.
  Both share one form (`ndaTemplate`); the Mutual NDA names the parties Party 1
  and Party 2, the One-way NDA the Disclosing Party (LV Branding) and the
  Receiving Party. The form fills the parties block: the other party is the
  legal name typed for it, else the Company, else the recipient personally (who
  then signs personally, as the NDAs say). Their notice email defaults to the
  recipient's. More parties keep the approved wording: on the Mutual NDA they
  are Party 3 to 5, on the One-way NDA each is another Receiving Party, each
  with its own lines in the parties block and its own signature. LV Branding's
  address and notice email are filled in from
  `LV_NOTICE` in the templates file (1755 Crescent Plaza Dr., Houston, Texas
  77077 and admin@lvbranding.com); change them there if they ever change.
- **Releases and client approval form**: the four releases (photo, media,
  talent, location) and the client approval form are Suite 55's documents with
  LV Branding LLC as producer. A release can be signed by a parent or guardian
  for a minor; the guardian clause and signer line follow the minor's name.
  Their Spanish text was translated for LegalSigns and has not been reviewed by
  a lawyer; the New document dialog says so when Spanish is chosen. Have a
  bilingual lawyer review it before relying on it.
- **A new template** can be held back with `available: false` until its
  wording is approved; the dialog lists it but won't send it. For LV Branding's
  role, choose a `countersignerRole` other than "LV Branding LLC" (the PDF
  already adds the company name after the role).

Change a template's `version` whenever its wording changes; the version is
recorded with every document and printed on the certificate.

# LegalSigns

Send releases and NDAs for signature from `/legal-signs`. The recipient signs
on a public page (`/sign/:token`) reached from their email, LV Branding
countersigns, and the signed PDF, with a certificate of completion, is saved in
the module and emailed to both sides.

## Apply and deploy

In this order (a function deployed before its tables answers every call with
an error):

1. Apply `supabase/migrations/20261015120000_legal_signs.sql` in the SQL editor.
2. Deploy both functions:

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
| `sent` | Emailed with a personal link that works for 30 days |
| `viewed` | The recipient confirmed their email and opened it |
| `client_signed` | The recipient signed; waiting for LV Branding |
| `completed` | Countersigned; the PDF is in the `legal-documents` bucket |
| `voided` | Cancelled by the team; the link no longer opens it |

"Expired" is not stored: it is a `sent` or `viewed` document past `expires_at`.
Sending it again emails a new link and the old one stops working.

## What makes a signature hold up

- The document's text is rendered once, when it is sent, and stored as
  `content` with its SHA-256 (`content_hash`). Later template edits never change
  a sent document, and countersigning refuses content that no longer matches
  its hash. The hash is printed on the certificate.
- The link token is stored only as a hash. Opening the document also needs the
  address it was sent to; after 8 wrong addresses in an hour the link pauses for
  that hour.
- Each step is recorded in `legal_document_events` with time, IP address and
  device, and printed on the certificate. Wrong-email attempts stay in
  LegalSigns and are left off the certificate.
- Both signers tick an electronic-signature consent before signing.

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
  recipient's. LV Branding's address and notice email are filled in from
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

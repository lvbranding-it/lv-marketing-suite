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

`src/lib/legal/templates.ts`. The four releases (photo, media, talent,
location) and the client approval form are Suite 55's documents with LV
Branding LLC as producer. A release can be signed by a parent or guardian for
a minor; the guardian clause and signer line follow the minor's name.

- **Spanish**: the Spanish text was translated for LegalSigns and has not been
  reviewed by a lawyer. Have a bilingual lawyer review it before relying on it.
- **NDAs**: the Mutual and One-way NDA entries are placeholders
  (`available: false`, version "0") until LV Branding's approved NDA wording is
  added. Add it to `pendingNda` in the templates file, give each a version, set
  `available: true`, and choose a `countersignerRole` other than "LV Branding
  LLC" (the PDF already adds the company name after the role).

Change a template's `version` whenever its wording changes; the version is
recorded with every document and printed on the certificate.

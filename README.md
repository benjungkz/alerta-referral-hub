This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

# Alerta Referral Hub

Alerta Referral Hub is a Next.js application that manages the referral program workflow for Alerta Home. It receives referral submissions from Google Forms/Google Sheets, stores referral data in DynamoDB, generates referral links and rack cards, tracks referral visits, records Shopify conversions, and sends referral notification emails.

## Core Features

- Create partners and referral links from Google Sheets submissions
- Sync edited Google Sheets referral data back to DynamoDB
- Track referral visits by Referral ID
- Generate Shopify redirect URLs with referral and UTM parameters
- Record referral conversions from Shopify order webhooks
- Generate rack card PDFs with Placid
- Send referral resource emails with Amazon SES

## API Routes

### Create Referral

`POST /api/referrals`

Called by Google Apps Script when a new referral form submission is received.

Responsibilities:
- Validate the API key
- Validate and normalize the referral payload
- Create records in `partners`, `referral_links`, and optionally `partner_locations`
- Generate the QR code URL
- Generate the rack card PDF
- Store generated resource URLs
- Send the referral notification email

### Sync Google Sheets Edits

`PATCH /api/google-sheets/referrals`

Called when an existing referral row is edited in Google Sheets.

Editable fields:
- `status`
- `first_name`
- `last_name`
- `email`
- `phone`
- `consent`
- `notes`
- `organization_name`
- `segment`
- `reporting_group`

Protected fields:
- `Timestamp`
- `Referral ID`
- `QR Code URL`
- `Rack Card URL`

Related updates:
- When `first_name` or `last_name` changes, update `partners.contact_name` and `referral_links.link_name`
- When `segment` changes, update `partners.segment_code`, `referral_links.segment_code`, and `referral_links.utm.campaign`
- When `organization_name` changes, update `partners.organization_name` and `partner_locations.location_name`
- When `organization_name` changes, regenerate only the rack card and update `partners.rack_card_url`
- After rack card regeneration, resend the referral notification email

### Track Referral Visit

`POST /api/referral-visit/[referral]`

Used by the referral landing page to record a visit and return the Shopify redirect URL.

Responsibilities:
- Validate the Referral ID format
- Confirm that the referral link exists
- Create a referral session
- Return a Shopify URL with referral, UTM, and session parameters

### Shopify Order Webhook

`POST /api/shopify/order-created`

Receives Shopify order-created webhooks and records referral conversions.

Responsibilities:
- Validate the Shopify webhook signature
- Resolve referral/session data
- Create conversion and credit records in DynamoDB

## Google Sheets Apps Script

Reference file:

`lib/googleSheetScript.js`

The Google Apps Script flow uses an installable trigger, not a simple trigger, because it calls `UrlFetchApp`.

Trigger setup:
- Function: `onReferralSheetEdit`
- Event source: `From spreadsheet`
- Event type: `On edit`

Edit UX:
- Shows a confirmation dialog before syncing edits
- Reverts the change when possible if the user cancels
- Shows progress and result messages with spreadsheet toasts
- Warns that rack card regeneration can take up to two minutes when the facility/organization name changes
- Updates the Rack Card URL column when the server returns a new `rack_card_url`

## DynamoDB Tables

Tables:
- `partners`
- `partner_locations`
- `referral_links`
- `referral_sessions`
- `referral_conversions`

GSIs:
- `referral_links`: `partner_id-GSI`
- `partner_locations`: `partner_id-GSI`

## Partner Status

`PartnerStatus` currently allows only:

- `active`
- `inactive`

New referrals default to `active`.

## Environment Variables

Do not commit actual secret values.

- `NODE_ENV`
- `BASE_URL`
- `SHOPIFY_HOME_URL`
- `SHOPIFY_ADMIN_ACCESS_TOKEN`
- `SHOPIFY_STORE_DOMAIN`
- `SHOPIFY_API_VERSION`
- `SHOPIFY_WEBHOOK_SECRET`
- `APP_AWS_REGION`
- `APP_AWS_PROFILE`
- `DYNAMODB_PARTNERS_TABLE`
- `DYNAMODB_REFERRAL_LINKS_TABLE`
- `DYNAMODB_REFERRAL_LINKS_PARTNER_ID_INDEX`
- `DYNAMODB_PARTNER_LOCATIONS_TABLE`
- `DYNAMODB_PARTNER_LOCATIONS_PARTNER_ID_INDEX`
- `DYNAMODB_REFERRAL_SESSIONS_TABLE`
- `PLACID_API_TOKEN`
- `PLACID_RACK_CARD_TEMPLATE_UUID`
- `PLACID_PDF_TIMEOUT_MS`
- `PLACID_POLL_INTERVAL_MS`
- `PLACID_REQUEST_TIMEOUT_MS`
- `SES_FROM_EMAIL`
- `SES_SEND_TIMEOUT_MS`
- `ALERTA_API_KEY_DEV`
- `ALERTA_API_KEY_PROD`

## Local Development

```bash
npm install
npm run dev
```

Default local URL:

```txt
http://localhost:3000
```

## Validation

```bash
npx tsc --noEmit
npm run lint
```

The lint command may still report an existing warning in `lib/sendReferralNotificationEmail.ts` because the test email override leaves `toEmail` unused.

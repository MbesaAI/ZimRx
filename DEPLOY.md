# MbesaAI — Railway Deployment Guide

---

## Prerequisites

Before starting, make sure you have:

- `google-credentials.json` downloaded from Google Cloud Console and placed in the project root
- Your Anthropic API key from [console.anthropic.com](https://console.anthropic.com)
- Your Meta WhatsApp token and Phone Number ID from [developers.facebook.com](https://developers.facebook.com)
- Your Neon `DATABASE_URL` (already set up from Phase 1)

---

## Step 1 — Convert Google Credentials to Base64

Railway cannot accept JSON files as environment variables. Run this command in your project folder to convert the file to a base64 string:

```bash
node -e "console.log(Buffer.from(require('fs').readFileSync('./google-credentials.json')).toString('base64'))"
```

Copy the long string it prints — you will paste it in Step 3.

---

## Step 2 — Connect Railway to GitHub

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select **Towernter/MbesaAI**
4. Railway detects Node.js and starts building automatically

---

## Step 3 — Add Environment Variables

In your Railway project dashboard, go to the **Variables** tab and add each of the following:

| Variable | Value |
|---|---|
| `WHATSAPP_TOKEN` | Temporary access token from Meta Developers |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID from Meta Developers |
| `WEBHOOK_VERIFY_TOKEN` | `mbesaai_verify_2026` |
| `DATABASE_URL` | Your Neon PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (starts with `sk-ant-`) |
| `GOOGLE_CREDENTIALS_BASE64` | The base64 string generated in Step 1 |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |

Railway automatically redeploys when you save new variables.

---

## Step 4 — Get Your Railway Domain

1. In your Railway project, go to **Settings → Domains**
2. Click **Generate Domain**
3. You will get a permanent URL like:
   ```
   https://mbesaai-production.up.railway.app
   ```

Keep this URL — you need it for the WhatsApp webhook in Step 5.

---

## Step 5 — Register the Webhook with Meta

1. Go to [developers.facebook.com](https://developers.facebook.com) → your **MbesaAI** app
2. In the left menu, go to **WhatsApp → Configuration**
3. Under **Webhook**, click **Edit**
4. Set **Callback URL** to:
   ```
   https://web-production-ece38.up.railway.app/webhook
   ```
5. Set **Verify token** to:
   ```
   mbesaai_verify_2026
   ```
6. Click **Verify and Save** — you should see a green ✅
7. Under **Webhook Fields**, click **Subscribe** next to **messages**

---

## Step 6 — Add Your WhatsApp Test Number

1. Still in Meta Developers, go to **WhatsApp → API Setup**
2. Under **Send and receive messages**, find the **To** field
3. Click **Manage phone number list**
4. Add your personal WhatsApp number with country code, e.g. `263771234567`
5. WhatsApp will send you a verification code — enter it to confirm

---

## Step 7 — Verify the Deployment

Open your Railway URL in a browser:

```
https://web-production-ece38.up.railway.app/
```

You should see:

```json
{
  "service": "MbesaAI",
  "status": "running",
  "version": "1.0.0",
  "docs": "/api-docs",
  "purpose": "WhatsApp prescription assistant for Zimbabwe"
}
```

Open Swagger UI to test the API:

```
https://web-production-ece38.up.railway.app/api-docs
```

---

## Step 8 — Test the WhatsApp Flows

Send these messages from your personal WhatsApp to the Meta test number:

| Send this | Expected response |
|---|---|
| `hi` | Welcome menu with options 1–4 |
| `1` | Prompt to send a prescription photo |
| `[prescription photo]` | OCR result with detected drug list |
| `2` | Plain-language explanation of detected drugs |
| `3` | Prompt to share location or type town name |
| `Harare` | 3 pharmacies in Harare |
| `[share WhatsApp location]` | 3 nearest pharmacies by distance |
| `4` | Your last prescription record |

---

## Ongoing Deployments

Every `git push` to `main` triggers an automatic redeploy on Railway. No manual steps needed after initial setup.

```bash
git add .
git commit -m "your change"
git push
```

Railway picks it up within seconds.

---

## Database

Your Neon database was seeded in Phase 2 and is external to Railway. It is shared between local development and production — no re-seeding is needed on Railway.

If you ever need to re-seed:

```bash
# Run locally with your .env pointing to Neon
npm run seed
```

---

## Troubleshooting

**Webhook verification fails (403):**
- Check that `WEBHOOK_VERIFY_TOKEN` in Railway Variables matches exactly what you entered in Meta (`mbesaai_verify_2026`)
- Make sure the Railway deploy finished before you clicked Verify in Meta

**Messages not arriving:**
- In Meta Developers → WhatsApp → Configuration → confirm **messages** is subscribed under Webhook Fields
- Check Railway logs (your project → **Deployments → View Logs**)

**OCR not working:**
- Confirm `GOOGLE_CREDENTIALS_BASE64` is set in Railway Variables
- Check Railway logs for `OCR error:` lines

**Drug explanation not working:**
- Confirm `ANTHROPIC_API_KEY` is set correctly in Railway Variables
- New Anthropic accounts need a payment method added before API calls succeed

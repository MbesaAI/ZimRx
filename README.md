# ZimRx 🏥

> **WhatsApp AI Prescription Assistant for Zimbabwe**
>
> Helping Zimbabwean patients understand their prescriptions, find registered pharmacies, and store their medication records — all through WhatsApp, no app download required.

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-blue)](https://neon.tech)
[![Railway](https://img.shields.io/badge/Hosted-Railway-purple)](https://railway.app)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Cloud%20API-25D366)](https://developers.facebook.com/docs/whatsapp)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Data Sources](#data-sources)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

---

## The Problem

Zimbabwe's 16.8 million citizens face a broken prescription experience every day:

- **Prescriptions are unreadable.** Doctors write in medical shorthand and Latin abbreviations most patients cannot decode.
- **Drug shortages cause wasted trips.** Zimbabwe often holds less than a month's medicine supply at public level. Patients travel to pharmacies only to find drugs out of stock, with no way to check in advance.
- **No pharmacy directory exists.** Of 368 registered pharmacies, only 81 have a website and only 5 have a WhatsApp number. Patients navigate by word of mouth.
- **Paper prescriptions get lost.** A prescription is a single physical artifact. If it is lost, torn, or washed, the patient must return to the doctor at further cost and delay.
- **No real-time data for regulators.** The Medicines Control Authority of Zimbabwe (MCAZ) has no mechanism to track drug movement in real time, making shortage response reactive rather than proactive.

---

## The Solution

ZimRx is a WhatsApp chatbot that works on any smartphone — no app download, no registration, no technical literacy required.

**Patients send a prescription photo. ZimRx does the rest.**

| What the patient needs | What ZimRx provides |
|---|---|
| Understand what the prescription says | OCR reads the prescription and matches drugs to the MCAZ register |
| Know what each drug does | Claude AI explains each medication in plain language |
| Find a pharmacy that has stock | Nearest registered pharmacies from the MCAZ premises register |
| Retrieve a lost prescription | Every submission stored digitally, retrievable on demand |

---

## How It Works

### Patient conversation flow

```
Patient sends any message
         │
         ▼
  ┌─────────────┐
  │  Show menu  │
  │  1 2 3 4    │
  └──────┬──────┘
         │
    ┌────┴────────────────────────────┐
    │                                 │
Patient sends PHOTO            Patient types 1/2/3/4
    │                                 │
    ▼                        ┌────────┼────────┬──────────┐
Google Vision OCR         Option 1  Option 2  Option 3  Option 4
reads prescription        Send photo  Explain   Find      Retrieve
    │                     reminder   drugs    pharmacy    record
    ▼                                  │          │
Match against                        Claude    Haversine
MCAZ medicines                       Haiku     distance
table (Postgres)                     LLM       from MCAZ
    │                                  │       premises
    ▼                                  ▼       register
Show detected drugs              Plain-language    │
Save to DB                       explanation       ▼
    │                                         3 nearest
    ▼                                         pharmacies
Offer: Explain (2)
or Find pharmacy (3)
```

### Conversation states

| State | Triggered by | Waiting for |
|---|---|---|
| `IDLE` | New user or completed flow | Any message → show menu |
| `AWAITING_FULFILLMENT` | Bot delivered OCR result | Patient confirms whether they filled the prescription (1/2/3) |
| `AWAITING_CHOICE` | Patient answered fulfillment prompt | Patient picks option 2 (explain) or 3 (pharmacy) |
| `AWAITING_LOCATION` | Patient chose pharmacy finder | WhatsApp location share or town name |

### Example conversation

```
Patient:  [sends photo of prescription]

ZimRx:    📷 Got your prescription photo. Analysing now...

ZimRx:    ✅ Prescription detected:
          • Amoxicillin (AMOXICILLIN) — 500mg
          • Paracetamol (PARACETAMOL) — 500mg

          Reply:
          2 — Explain what these medications do
          3 — Find a pharmacy near you

Patient:  2

ZimRx:    💊 Your medication explained:

          Amoxicillin is an antibiotic used to treat bacterial
          infections such as chest, ear, and throat infections.
          Take one capsule three times a day with or after food.
          Complete the full course even if you feel better.

          Paracetamol is a painkiller and fever reducer. Take
          one or two tablets every 4–6 hours as needed. Do not
          exceed 8 tablets in 24 hours.

          Always follow your doctor or pharmacist's instructions.

Patient:  3

ZimRx:    📍 Please share your location or type your town name.

Patient:  [shares WhatsApp location]

ZimRx:    🏥 Nearest pharmacies to you:

          1. Divine Pharmacy - Mabelreign
             📍 1&2 Stortford Parade, Harare
             📏 1.2 km away

          2. Avenues Pharmacy
             📍 Corner Baines & 3rd Street, Harare
             📏 3.4 km away

          3. Bon Marche Pharmacy
             📍 Sam Levy Village, Borrowdale, Harare
             📏 4.7 km away
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        PATIENT                              │
│                   WhatsApp on phone                         │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Meta WhatsApp Cloud API                        │
│         (receives messages, forwards to webhook)            │
└───────────────────────────┬─────────────────────────────────┘
                            │ POST /webhook
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    ZimRx Express API                        │
│                  Hosted on Railway                          │
│                                                             │
│  ┌─────────────┐  ┌───────────┐  ┌──────────────────────┐  │
│  │   Webhook   │  │Conversation│  │    REST Endpoints    │  │
│  │  Handler   │  │  Handler  │  │  /api/translate      │  │
│  │            │  │           │  │  /api/explain        │  │
│  │ Verifies   │  │ State     │  │  /api/pharmacies     │  │
│  │ Meta token │  │ machine   │  │  /api/records        │  │
│  │ Routes     │  │ per user  │  │  /api-docs (Swagger) │  │
│  │ messages   │  │           │  │                      │  │
│  └──────┬─────┘  └─────┬─────┘  └──────────────────────┘  │
│         │              │                                     │
│    ┌────┴──────────────┴────┐                               │
│    │       Services         │                               │
│    │  ┌──────────────────┐  │                               │
│    │  │  ocr.js          │  │ ← Google Vision API           │
│    │  │  llm.js          │  │ ← Anthropic Claude Haiku      │
│    │  │  drugLookup.js   │  │ ← Postgres full-text search   │
│    │  │  pharmacyFinder  │  │ ← Haversine + Postgres        │
│    │  │  whatsapp.js     │  │ ← Meta Graph API              │
│    │  └──────────────────┘  │                               │
│    └────────────┬───────────┘                               │
└─────────────────┼───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                  Neon PostgreSQL                             │
│                  (free, serverless, permanent)               │
│                                                             │
│  medicines      3,086 rows  ← MCAZ Medicines Register       │
│  pharmacies     2,246 rows  ← MCAZ Premises Register        │
│  conversations  1 per user  ← conversation state            │
│  prescriptions  1 per scan  ← OCR output + drugs detected   │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Backend
| Technology | Version | Purpose |
|---|---|---|
| **Node.js** | 20.x LTS | Runtime |
| **Express** | 4.x | Web server and routing |
| **Prisma ORM** | 5.x | Database client and schema management |
| **swagger-ui-express** | 5.x | Auto-generated API documentation at `/api-docs` |
| **swagger-jsdoc** | 6.x | OpenAPI spec from JSDoc comments |
| **axios** | 1.x | HTTP client for WhatsApp and Google APIs |
| **xlsx** | 0.18.x | Read MCAZ Excel files during database seeding |
| **dotenv** | 16.x | Environment variable management |
| **cors** | 2.x | Cross-origin request handling |
| **nodemon** | 3.x | Auto-restart during development |

### AI and External Services
| Service | Purpose | Why AI is needed |
|---|---|---|
| **Google Cloud Vision API** | Prescription OCR | Handwritten prescriptions have too much variation for rules-based text extraction. OCR handles degraded images, mixed handwriting styles, and medical shorthand |
| **Anthropic Claude Haiku** | Drug explanation in plain language | Contextual medical explanation requires reasoning, not keyword matching. Haiku is fast and cheap for this task |
| **Meta WhatsApp Cloud API** | Messaging channel | WhatsApp accounts for 44% of all mobile internet usage in Zimbabwe (POTRAZ Q4 2025) |

> **What is deliberately NOT AI:**
> Drug lookup (Postgres full-text search), pharmacy finding (Haversine distance formula),
> and conversation routing (state machine) are standard software — not AI. This is
> intentional. Using AI where simpler tools work is over-engineering.

### Database
| Technology | Purpose |
|---|---|
| **Neon** | Serverless PostgreSQL — free tier, permanent storage, built-in connection pooling |
| **Prisma** | Schema definition, migrations, and type-safe queries |

### Infrastructure
| Technology | Purpose |
|---|---|
| **Railway** | API hosting — persistent Node.js process, no cold starts, auto-deploys from GitHub |
| **ngrok** | Local development tunnel — exposes localhost to WhatsApp webhook during development |
| **GitHub** | Source control and Railway deployment trigger |

---

## Data Sources

ZimRx is built on two official government datasets from the Medicines Control Authority of Zimbabwe (MCAZ), sourced from [onlineservices.mcaz.co.zw](https://onlineservices.mcaz.co.zw/onlineregister).

### Medicines Register
- **3,086 registered medicines**
- Fields: Trade Name, Generic Name, Registration Number, Form, Distribution Category, Strength, Manufacturer, Expiry Date
- Categories included: Prescription (9th Schedule), Prescription (10th Schedule / controlled), Pharmacy Medicines, Pharmacist Initiated Medicines, Narcotics
- Updated daily by MCAZ

### Premises Register
- **2,246 licensed premises**
- Fields: Licence Number, Premises Name, Address, Premises Type, Town, Expiry Date
- Pharmacy types included: Pharmacy (general), Pharmacy (CBD), Pharmacy (rural), Hospital Pharmacies
- Coverage: Harare (851), Bulawayo (172), Mutare (80), Gweru (71), Chitungwiza (67), and 50+ other towns

### Privacy
The MCAZ datasets contain no personal data. They are public government registers published under MCAZ's statutory mandate. No patient data is shared or published. Patient WhatsApp numbers are stored only to maintain conversation state and prescription history for that patient's own retrieval.

---

## API Endpoints

Full interactive documentation available at `/api-docs` (Swagger UI).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Health check — returns service status |
| `GET` | `/api-docs` | Swagger UI — interactive API documentation |
| `GET` | `/webhook` | Meta webhook verification (called once on setup) |
| `POST` | `/webhook` | Receive all incoming WhatsApp messages |
| `POST` | `/api/translate` | Match OCR text against MCAZ medicines table |
| `POST` | `/api/explain` | Get Claude plain-language drug explanation |
| `GET` | `/api/pharmacies` | Find pharmacies by coordinates or town name |
| `GET` | `/api/records/:waId` | Get prescription history for a patient |
| `GET` | `/admin` | Stakeholder analytics dashboard — Chart.js UI (auth required) |
| `GET` | `/admin/api/stats/overview` | KPI totals — queries, dispensations, fulfillment rate (auth required) |
| `GET` | `/admin/api/stats/timeseries` | Daily query counts for the last 30 days (auth required) |
| `GET` | `/admin/api/stats/medicines` | Top 20 most-queried medicines (auth required) |
| `GET` | `/admin/api/stats/fulfillment` | YES / STILL_LOOKING / NO / NOT_ASKED breakdown (auth required) |
| `GET` | `/admin/api/stats/geography` | Query volume by town (auth required) |
| `GET` | `/admin/api/stats/categories` | Query volume by MCAZ medicine category (auth required) |

### Example: Find pharmacies by coordinates
```http
GET /api/pharmacies?lat=-17.8292&lon=31.0522&limit=3
```

```json
{
  "count": 3,
  "pharmacies": [
    {
      "premisesName": "Divine Pharmacy - Mabelreign",
      "address": "1&2 Stortford Parade Harare",
      "town": "HARARE",
      "premisesType": "PHARMACY IN ANY OTHER LOCATION",
      "distanceKm": 1.2
    }
  ]
}
```

### Example: Translate prescription text
```http
POST /api/translate
Content-Type: application/json

{ "ocrText": "Amoxicillin 500mg tab bd x 7/7 Paracetamol 500mg prn" }
```

```json
{
  "count": 2,
  "drugs": [
    {
      "tradeName": "AMOXICILLIN",
      "genericName": "AMOXICILLIN",
      "strength": "500MG",
      "form": "CAPSULE; ORAL",
      "category": "PRESCRIPTION PREPARATIONS 9TH SCHEDULE, (P.P.)"
    },
    {
      "tradeName": "PARACETAMOL",
      "genericName": "PARACETAMOL",
      "strength": "500MG",
      "form": "TABLET; ORAL",
      "category": "PHARMACY MEDICINES (P.)"
    }
  ]
}
```

---

## Project Structure

```
zimrx/
│
├── src/
│   ├── routes/
│   │   ├── webhook.js          ← WhatsApp webhook (verify + receive)
│   │   ├── translate.js        ← Drug lookup from OCR text
│   │   ├── explain.js          ← LLM drug explanation
│   │   ├── pharmacies.js       ← Pharmacy finder
│   │   └── records.js          ← Patient prescription records
│   │
│   ├── services/
│   │   ├── whatsapp.js         ← Send messages via Meta Graph API
│   │   ├── ocr.js              ← Google Vision prescription reading
│   │   ├── llm.js              ← Claude Haiku drug explanation
│   │   ├── drugLookup.js       ← Search MCAZ medicines table
│   │   └── pharmacyFinder.js   ← Distance-sorted pharmacy search
│   │
│   ├── db/
│   │   ├── client.js           ← Prisma singleton
│   │   └── seed/
│   │       ├── seedMedicines.js   ← Loads MedicinesRegister.xlsx → Neon
│   │       └── seedPharmacies.js  ← Loads Premises.xlsx → Neon
│   │
│   ├── conversation/
│   │   └── handler.js          ← State machine for WhatsApp conversations
│   │
│   └── swagger/
│       └── swagger.js          ← OpenAPI spec configuration
│
├── data/                       ← MCAZ Excel files (local only, not committed)
│   ├── MedicinesRegister.xlsx
│   └── Premises.xlsx
│
├── prisma/
│   └── schema.prisma           ← Database table definitions
│
├── .env.example                ← Environment variable template
├── .gitignore
├── index.js                    ← App entry point
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 20.x LTS — [nodejs.org](https://nodejs.org)
- Git — [git-scm.com](https://git-scm.com)
- A [Neon](https://neon.tech) account (free)
- A [Railway](https://railway.app) account (free)
- A [Meta Developer](https://developers.facebook.com) account (free)
- A [Google Cloud](https://cloud.google.com) account (free Vision API credits)
- An [Anthropic](https://console.anthropic.com) account

### Clone and install

```bash
git clone https://github.com/MbesaAI/ZimRx.git
cd ZimRx
npm install
```

### Configure environment

```bash
cp .env.example .env
```

Fill in your keys — see [Environment Variables](#environment-variables) below.

### Set up the database

```bash
# Push schema to Neon
npm run db:push

# Seed MCAZ data (place Excel files in data/ first)
npm run seed
```

### Start development server

```bash
npm run dev
```

Server starts at `http://localhost:3000`
Swagger docs at `http://localhost:3000/api-docs`

### Expose to WhatsApp with ngrok

In a second terminal:
```bash
ngrok http 3000
```

Copy the `https://` URL. Register it as your webhook in Meta Developers:
- Callback URL: `https://your-ngrok-url.ngrok-free.app/webhook`
- Verify token: value of `WEBHOOK_VERIFY_TOKEN` in your `.env`

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
# WhatsApp Cloud API — from Meta Developers dashboard
WHATSAPP_TOKEN=EAAxxxxxxxxxxxxxxxx
WHATSAPP_PHONE_NUMBER_ID=1234567890123456
WEBHOOK_VERIFY_TOKEN=mbesaai_verify_2026

# Neon PostgreSQL — from Neon dashboard → Connection String
DATABASE_URL=postgresql://user:password@ep-xxx.eu-west-2.aws.neon.tech/neondb?sslmode=require

# Google Cloud Vision — path to downloaded service account JSON key
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx

# Admin Portal — protects /admin/* routes with HTTP Basic Auth
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_me_before_deploy

# App
PORT=3000
NODE_ENV=development
```

### Where to get each key

| Variable | Where to find it |
|---|---|
| `WHATSAPP_TOKEN` | Meta Developers → your app → WhatsApp → API Setup → Temporary token |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta Developers → WhatsApp → API Setup → Phone Number ID |
| `WEBHOOK_VERIFY_TOKEN` | Make up any string — you use the same one in Meta dashboard |
| `DATABASE_URL` | Neon dashboard → your project → Connection Details → Connection string |
| `GOOGLE_APPLICATION_CREDENTIALS` | Google Cloud Console → IAM → Service Accounts → Keys → Download JSON |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys → Create Key |
| `ADMIN_USERNAME` | Choose any username (default: `admin`) |
| `ADMIN_PASSWORD` | Choose a strong password — set this in Railway dashboard |

---

## Deployment

ZimRx is deployed on [Railway](https://railway.app) with automatic deployments from GitHub.

### Deploy your own instance

1. Fork this repository
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your fork
4. Add all environment variables in Railway dashboard → Variables
5. Railway auto-assigns an HTTPS domain — copy it
6. Update your WhatsApp webhook URL in Meta Developers to your Railway domain
7. Every `git push` to `main` triggers an automatic redeploy

### Database seeding on Railway

The Neon database is external to Railway. Seed it from your local machine:

```bash
# Ensure DATABASE_URL in .env points to your Neon instance
# Ensure Excel files are in data/
npm run seed
```

The same Neon database is used by both local development and Railway production.

---

## NPM Scripts

```bash
npm run dev            # Start development server with auto-restart
npm run start          # Start production server
npm run db:push        # Push Prisma schema changes to Neon
npm run db:studio      # Open Prisma Studio (visual database browser)
npm run db:generate    # Regenerate Prisma client after schema changes
npm run seed           # Seed both medicines and pharmacies
npm run seed:medicines # Seed medicines only
npm run seed:pharmacies # Seed pharmacies only
```

---

## Database Schema

```
medicines
  id               Int       Primary key
  tradeName        String    Brand name of the drug
  genericName      String    Generic/chemical name
  registrationNo   String    MCAZ registration number (unique)
  form             String    e.g. TABLET; ORAL, CAPSULE; ORAL
  category         String    Distribution schedule
  strength         String    e.g. 500MG
  manufacturer     String    Manufacturing company
  applicantName    String    Zimbabwe applicant/importer
  expiryDate       DateTime  Registration expiry

pharmacies
  id            Int       Primary key
  licenceNo     String    MCAZ licence number (unique)
  premisesName  String    Trading name
  address       String    Physical address
  premisesType  String    Category of pharmacy
  town          String    City or town
  latitude      Float     For distance calculation (to be geocoded)
  longitude     Float     For distance calculation (to be geocoded)
  expiryDate    DateTime  Licence expiry

conversations
  id                    Int       Primary key
  waId                  String    WhatsApp number (unique)
  state                 String    IDLE | AWAITING_CHOICE | AWAITING_LOCATION | AWAITING_FULFILLMENT
  lastMessageAt         DateTime  Last activity timestamp
  pendingPrescriptionId Int?      ID of prescription awaiting patient fulfillment reply

prescriptions
  id                Int       Primary key
  conversationId    Int       Foreign key → conversations
  rawOcrText        String    Full text extracted by Google Vision
  drugsDetected     String[]  Array of generic names matched to MCAZ
  submittedAt       DateTime  Timestamp of submission
  fulfilled         Boolean?  null=not yet asked, true=filled, false=not filled
  fulfilledAt       DateTime? When the patient replied
  fulfillmentStatus String?   "YES" | "STILL_LOOKING" | "NO"
```

---

## Roadmap

### Phase 1 — MVP (current)
- [x] WhatsApp webhook receiver
- [x] Google Vision OCR on prescription photos
- [x] Drug lookup against MCAZ medicines register
- [x] Claude Haiku plain-language drug explanation
- [x] Pharmacy finder from MCAZ premises register
- [x] Prescription record storage and retrieval
- [x] Multi-turn conversation state machine
- [x] Swagger API documentation
- [x] Railway deployment

### Phase 2 — Language and Accessibility
- [x] Shona language responses
- [x] Ndebele language responses
- [ ] Drug interaction checker (flag dangerous combinations)
- [ ] Photo quality validation before OCR
- [x] Manual drug name text input as OCR fallback

### Phase 3 — Pharmacy Geocoding
- [x] Geocode all 2,246 pharmacy addresses using Google Maps Geocoding API
- [x] Enable accurate distance-sorted pharmacy results for all users
- [ ] Add pharmacy operating hours

### Phase 4 — Institutional Layer
- [x] MCAZ analytics dashboard (prescription volume by drug, region, time)
- [ ] Controlled drug flagging (Narcotics / Schedule 10 alerts)
- [ ] Duplicate prescription detection
- [ ] Pharmacy compliance portal for dispensing records
- [ ] Medical aid prescription verification API

### Phase 5 — Production
- [ ] Register permanent Zimbabwe WhatsApp Business number
- [ ] Meta Business Verification for production API access
- [ ] MCAZ data partnership agreement
- [ ] Scale to Bulawayo, Mutare, Gweru


---

## Acknowledgements

- **MCAZ** (Medicines Control Authority of Zimbabwe) — for publishing the official medicines and premises registers at [onlineservices.mcaz.co.zw](https://onlineservices.mcaz.co.zw)
- **POTRAZ** — for the AI4I Challenge 2026 and the national AI strategy framework
- **Meta** — WhatsApp Cloud API and free tier for developers
- **Anthropic** — Claude Haiku for accessible, affordable AI inference
- **Neon** — truly free serverless Postgres

---

## Built For

**POTRAZ AI4I Challenge 2026 — Track 3: Development**
*Translating Zimbabwe's National AI Strategy into Practical, High-Impact Solutions*

National Innovation Acceleration Centre (NIAC)

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

*ZimRx — Because every Zimbabwean deserves to understand their own prescription.*

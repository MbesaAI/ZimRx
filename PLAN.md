# ZimRx — Admin Portal & Confirmed Prescriptions: Implementation Plan

## Overview

Two new capabilities to be built in four discrete, shippable phases:

1. **Admin Portal** — A password-protected web dashboard at `/admin` for stakeholders (MCAZ, funders, regulators) showing anonymised medicine-movement data and system health. No patient names or phone numbers are ever exposed.
2. **Confirmed Prescriptions** — A WhatsApp follow-up prompt after every prescription scan asking the patient whether they managed to fill the prescription. This separates *queries* (someone looked up a drug) from *confirmed dispensations* (someone actually collected their medicine).

Each phase ends with a working, shippable state — a separate git commit and push to `main`.

---

## Phase 1 — Database Schema [ ]

**Branch:** `feat/confirmed-prescriptions-schema`
**Goal:** Extend the schema to store fulfillment data and track which prescription a conversation is waiting confirmation for. No behaviour changes yet.

### Changes

**`prisma/schema.prisma`**

Add to `Prescription` model:
```prisma
fulfilled         Boolean?   // null = not yet asked, true = got medicines, false = couldn't fill
fulfilledAt       DateTime?  // when the patient replied
fulfillmentStatus String?    // "YES" | "STILL_LOOKING" | "NO" — raw patient response
```

Add to `Conversation` model:
```prisma
pendingPrescriptionId  Int?   // ID of the prescription awaiting fulfillment reply
```

### Tasks
- [x] Update `prisma/schema.prisma` with the three new `Prescription` fields
- [x] Update `prisma/schema.prisma` with `pendingPrescriptionId` on `Conversation`
- [x] Run `npm run db:push` to apply changes to Neon
- [x] Run `npm run db:generate` to regenerate Prisma client
- [x] Update the Database Schema section in `README.md`
- [ ] Commit and push: `feat: extend schema for prescription fulfillment tracking`

---

## Phase 2 — Confirmed Prescriptions (WhatsApp Flow) [ ]

**Branch:** `feat/confirmed-prescriptions-flow`
**Goal:** After every successful prescription scan, prompt the patient to confirm whether they fulfilled it. Store the response against the prescription record.

### Conversation flow change

**Current flow (after OCR):**
```
Patient sends photo
  → Bot: "✅ Prescription detected: Drug A, Drug B. Reply 2 to explain or 3 for pharmacy."
  → State: AWAITING_CHOICE
```

**New flow (after OCR):**
```
Patient sends photo
  → Bot: "✅ Prescription detected: Drug A, Drug B. Reply 2 to explain or 3 for pharmacy."
  → State: AWAITING_CHOICE

... patient finishes explain/pharmacy flow or sends any new message ...

  → Bot: "Were you able to fill this prescription?
          1 — Yes, I collected my medicines ✅
          2 — Not yet, still looking 🔍
          3 — No, I couldn't find them ❌"
  → State: AWAITING_FULFILLMENT
```

**Trigger rule:** Send the fulfillment prompt immediately after the OCR result is delivered, before routing to AWAITING_CHOICE. This keeps the conversation in one session.

**State machine addition:**

| New state | Triggered by | Waiting for |
|---|---|---|
| `AWAITING_FULFILLMENT` | Bot delivered OCR result | Patient replies 1, 2, or 3 |

**Fulfillment responses:**

| Reply | `fulfillmentStatus` stored | `fulfilled` stored | Bot reply |
|---|---|---|---|
| `1` / `yes` | `YES` | `true` | "Great! Glad you got your medicines. 💊 Reply 2 to explain them or 3 to find a pharmacy." |
| `2` / `still` / `looking` | `STILL_LOOKING` | `false` | "No problem — reply 3 and I'll find the nearest pharmacies for you." |
| `3` / `no` | `NO` | `false` | "Sorry to hear that. Reply 3 and I'll find pharmacies near you that may have stock." |

### Tasks
- [ ] Add `AWAITING_FULFILLMENT` state handling to `src/conversation/handler.js`
- [ ] After OCR result is sent, set `state = AWAITING_FULFILLMENT` and write `pendingPrescriptionId` to the `Conversation` record
- [ ] Handle replies 1/2/3 in `AWAITING_FULFILLMENT`: update `Prescription.fulfilled`, `fulfilledAt`, `fulfillmentStatus`; clear `pendingPrescriptionId`; transition to `AWAITING_CHOICE`
- [ ] Update conversation state table in `README.md`
- [ ] Commit and push: `feat: add prescription fulfillment confirmation to WhatsApp flow`

---

## Phase 3 — Admin Portal: Data API [ ]

**Branch:** `feat/admin-portal-api`
**Goal:** Build the anonymised metrics API that the dashboard will consume. No frontend yet — just the data routes.

### New file: `src/routes/admin.js`

All queries aggregate data — no `waId`, no `rawOcrText`, no individual records returned.

**Endpoints:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/api/stats/overview` | Top-level numbers: total queries, confirmed dispensations, fulfilment rate |
| `GET` | `/admin/api/stats/timeseries` | Prescription query counts grouped by day (last 30 days) |
| `GET` | `/admin/api/stats/medicines` | Top 20 most-queried medicines by name |
| `GET` | `/admin/api/stats/fulfillment` | Fulfillment breakdown: YES / STILL_LOOKING / NO / not-yet-asked counts |
| `GET` | `/admin/api/stats/geography` | Prescription query counts grouped by town (from pharmacy finder usage) |
| `GET` | `/admin/api/stats/categories` | Query counts by MCAZ medicine category (schedule) |

**Data protection rules enforced at the query layer:**
- All queries use `COUNT`, `GROUP BY`, aggregates only — never `SELECT *`
- `waId` is never returned
- `rawOcrText` is never returned
- Minimum group size of 5 enforced (suppress towns or drugs with fewer than 5 queries to prevent inference attacks)

### Tasks
- [ ] Create `src/routes/admin.js` with all six stats endpoints
- [ ] Write Prisma aggregate queries for each endpoint
- [ ] Apply minimum-group-size filter (n < 5 → omit from results)
- [ ] Mount admin router in `index.js` under `/admin`
- [ ] Test each endpoint manually via curl or browser
- [ ] Commit and push: `feat: add anonymised admin stats API`

---

## Phase 4 — Admin Portal: Dashboard UI [ ]

**Branch:** `feat/admin-portal-dashboard`
**Goal:** A clean, stakeholder-ready dashboard served at `/admin` — no build step, no separate framework. Server-rendered HTML + Chart.js from CDN. Protected behind HTTP Basic Auth.

### What the dashboard shows

| Panel | Chart type | Data source |
|---|---|---|
| Total prescription queries | KPI card | `/admin/api/stats/overview` |
| Confirmed dispensations | KPI card | `/admin/api/stats/overview` |
| Fulfillment rate | KPI card + colour indicator | `/admin/api/stats/overview` |
| Queries over time | Line chart | `/admin/api/stats/timeseries` |
| Top 20 medicines by query volume | Horizontal bar chart | `/admin/api/stats/medicines` |
| Fulfillment breakdown | Doughnut chart | `/admin/api/stats/fulfillment` |
| Queries by medicine category | Bar chart | `/admin/api/stats/categories` |

**Privacy notice** (visible on dashboard): "Patient identity is not collected or displayed. Data shows medicine movement only. Compliant with Zimbabwe Data Protection Act 2021."

### Authentication

- HTTP Basic Auth middleware protecting all `/admin` routes
- Credentials stored in env vars: `ADMIN_USERNAME` and `ADMIN_PASSWORD`
- No session, no JWT — stateless Basic Auth is sufficient for a demo/stakeholder portal

### New files

| File | Purpose |
|---|---|
| `src/middleware/adminAuth.js` | Basic Auth middleware |
| `src/routes/adminDashboard.js` | `GET /admin` — serves the HTML page |
| `src/views/admin.html` | Dashboard HTML with inline Chart.js calls |

### Tasks
- [ ] Create `src/middleware/adminAuth.js` — check `Authorization: Basic ...` header against `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars
- [ ] Create `src/views/admin.html` — responsive HTML dashboard with Chart.js (CDN), fetches from `/admin/api/stats/*` on load
- [ ] Create `src/routes/adminDashboard.js` — `GET /admin` serves `admin.html`
- [ ] Apply `adminAuth` middleware to all `/admin` routes in `index.js`
- [ ] Add `ADMIN_USERNAME` and `ADMIN_PASSWORD` to `.env.example`
- [ ] Update `README.md`: add `/admin` to API Endpoints table and document the two new env vars
- [ ] Commit and push: `feat: admin portal dashboard with basic auth`

---

## Environment Variables Added

```env
# Admin Portal
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_me_before_deploy
```

---

## Schema Changes Summary

```
prescriptions
  fulfilled          Boolean?   null=not asked, true=filled, false=not filled
  fulfilledAt        DateTime?  when the patient responded
  fulfillmentStatus  String?    "YES" | "STILL_LOOKING" | "NO"

conversations
  pendingPrescriptionId  Int?   prescription waiting for fulfillment reply
```

---

## Progress Tracker

| Phase | Branch | Status | PR / Commit |
|---|---|---|---|
| 1 — Schema | `feat/confirmed-prescriptions-schema` | [x] Complete | — |
| 2 — WhatsApp flow | `feat/confirmed-prescriptions-flow` | [ ] Not started | — |
| 3 — Admin API | `feat/admin-portal-api` | [ ] Not started | — |
| 4 — Admin Dashboard | `feat/admin-portal-dashboard` | [ ] Not started | — |

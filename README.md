# Endurance AI — Scientific Training Load & AI Recovery Platform

> **Endurance AI** is an advanced full-stack endurance intelligence platform. It automatically ingests athlete telemetry via Strava webhooks, calculates physiological training load metrics (Banister's TRIMP and Acute:Chronic Workload Ratio), and leverages Google Gemini 2.5 Flash to synthesize personalized workout and recovery recommendations.

---

## 📑 Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Directory Structure](#directory-structure)
- [Prerequisites](#prerequisites)
- [Quickstart Guide](#quickstart-guide)
  - [1. Clone and Install Dependencies](#1-clone-and-install-dependencies)
  - [2. Configure Environment Variables](#2-configure-environment-variables)
  - [3. Database Setup (Supabase)](#3-database-setup-supabase)
  - [4. Start the Local Server](#4-start-the-local-server)
- [Webhooks & Asynchronous Processing](#webhooks--asynchronous-processing)
- [Available Scripts](#available-scripts)
- [Physiological Models](#physiological-models)

---

## Overview

Endurance athletes frequently struggle with balancing training stress and recovery, often falling into overtraining or suffering acute load spikes that cause injury. 

**Endurance AI** bridges physiological data science with autonomous AI coaching:
1. Ingests raw GPS & second-by-second heart rate telemetry streams from **Strava**.
2. Processes cardiac impulse response using **Banister's TRIMP** formula.
3. Tracks 7-day Acute Load vs. 28-day Chronic Load to compute **Gabbett's Acute:Chronic Workload Ratio (ACWR)**.
4. Generates structured, scientifically grounded daily workouts and recovery advisories via **Google Gemini 2.5 Flash**.

---

## System Architecture

The project runs on a modern **Serverless BaaS Architecture**:

```
+-----------------------------------------------------------------------------+
|                               Client Layer                                  |
|         Next.js 15 App Router (React 19, Tailwind CSS v4, Recharts)         |
+------------------------------------+----------------------------------------+
                                     |
                +--------------------+--------------------+
                |                                         |
                v                                         v
+-------------------------------+       +------------------------------------+
|     Next.js Server Actions    |       |       Next.js Route Handlers       |
|      (Workout Generation)     |       |    (/api/webhooks, /api/jobs)      |
+---------------+---------------+       +-----------------+------------------+
                |                                         |
                | (Generates Object)                      | (Dispatches Task)
                v                                         v
+-------------------------------+       +------------------------------------+
|  Google Gemini 2.5 Flash      |       |          Upstash QStash            |
|       (Vercel AI SDK)         |       |      (Serverless Task Queue)       |
+---------------+---------------+       +-----------------+------------------+
                |                                         |
                | (Stores Recommendations)                | (Invokes Worker)
                v                                         v
+-----------------------------------------------------------------------------+
|                             Supabase Cloud                                  |
|         PostgreSQL Database + Row-Level Security (RLS) + Auth               |
+-----------------------------------------------------------------------------+
```

---

## Key Features

- **Automated Strava Sync:** OAuth token lifecycle management with automatic refresh and asynchronous webhook activity ingestion.
- **Heart Rate Stream Telemetry:** Extracts second-by-second HR stream data and categorizes training time into a standard 5-zone HR distribution.
- **Banister TRIMP Computation:** Non-linear exponential heart rate weighting factoring in resting HR, max HR, and gender coefficients.
- **ACWR Tracking:** Continuous 28-day rolling window calculating acute fatigue vs. chronic fitness to pinpoint sweet spot training (0.8–1.3) vs. danger zones (>1.5).
- **AI Recovery Engine:** Structured JSON workout generation using Gemini 2.5 Flash, providing target zones, readiness scores, and training rationales.
- **Interactive Dashboard:** Dynamic charts built with Recharts, interactive zone distributions, and simulated workout ingestion.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [Next.js 15 (App Router)](https://nextjs.org/) + React 19 |
| **Language** | TypeScript |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) + Lucide Icons |
| **Data Visualization** | [Recharts](https://recharts.org/) |
| **Database & Auth** | [Supabase](https://supabase.com/) (PostgreSQL + RLS) |
| **Message Queue** | [Upstash QStash](https://upstash.com/docs/qstash/overall/getstarted) |
| **AI / LLM** | [Google Gemini 2.5 Flash](https://ai.google.dev/) via [Vercel AI SDK](https://sdk.vercel.ai/) |
| **Activity Source** | [Strava V3 API](https://developers.strava.com/) |

---

## Directory Structure

```
├── app/
│   ├── (auth)/login/             # Supabase authentication UI
│   ├── actions/                  # Server Actions (e.g., recommend.ts for AI generation)
│   ├── api/
│   │   ├── auth/callback/        # OAuth redirect handler
│   │   ├── jobs/                 # QStash asynchronous queue consumers
│   │   └── webhooks/strava/      # Strava subscription validation & event receiver
│   ├── dashboard/                # Interactive analytics & recovery dashboard
│   ├── globals.css               # Design system tokens and styles
│   ├── layout.tsx                # Root HTML layout & fonts
│   └── page.tsx                  # Marketing / product landing page
├── lib/
│   ├── calculations.ts           # TRIMP, 5-zone HR distribution, and ACWR formulas
│   ├── qstash.ts                 # QStash client & webhook signature verification
│   ├── strava.ts                 # Strava API endpoints & OAuth token rotation
│   ├── supabase/                 # Supabase client instances (SSR, Admin, Browser)
│   └── utils.ts                  # ClassName merging helpers (clsx & tailwind-merge)
├── supabase/
│   └── schema.sql                # PostgreSQL tables, indexes, and RLS policies
├── .env.local.example            # Environment configuration template
└── package.json                  # Dependencies and build scripts
```

---

## Prerequisites

Before running the application, ensure you have:
- **Node.js**: Version 18.18 or higher (Node 20+ recommended)
- **npm**, **pnpm**, or **yarn**
- Accounts for external services (all have free tiers):
  - [Supabase](https://supabase.com/)
  - [Google AI Studio](https://aistudio.google.com/) (Gemini API Key)
  - [Upstash](https://upstash.com/) (QStash token & signing keys)
  - [Strava Developers](https://developers.strava.com/) (API Application)

---

## Quickstart Guide

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/GaryQuah/SC3040_AdvancedSoftware.git
cd SC3040_AdvancedSoftware
npm install
```

### 2. Configure Environment Variables

Copy the example environment file and fill in your service credentials:

```bash
cp .env.local.example .env.local
```

Populate the following keys in `.env.local`:

```env
# Application Host URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase (Auth & Database)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Strava API (OAuth & Webhooks)
STRAVA_CLIENT_ID=<your-strava-client-id>
STRAVA_CLIENT_SECRET=<your-strava-client-secret>
STRAVA_VERIFY_TOKEN=<your-custom-webhook-verify-token>

# Upstash QStash (Async Queue)
QSTASH_URL=https://qstash.upstash.io/v2
QSTASH_TOKEN=<your-qstash-token>
QSTASH_CURRENT_SIGNING_KEY=<your-current-signing-key>
QSTASH_NEXT_SIGNING_KEY=<your-next-signing-key>

# Google Generative AI (Gemini 2.5 Flash)
GOOGLE_GENERATIVE_AI_API_KEY=<your-gemini-api-key>
```

> **Note:** If `GOOGLE_GENERATIVE_AI_API_KEY` is not provided, the recommendation engine falls back gracefully to a deterministic mock recommendation for local evaluation.

### 3. Database Setup (Supabase)

1. Open your **Supabase Dashboard** and navigate to the **SQL Editor**.
2. Copy the contents of [`supabase/schema.sql`](file:///c:/Users/User/Desktop/SC3040/SC3040_AdvancedSoftware/supabase/schema.sql).
3. Run the script. This creates:
   - `athlete_profiles`: Stores athlete physiological parameters (rest HR, max HR) & Strava tokens.
   - `activities`: Persists workout telemetry, raw stream summaries, and TRIMP scores.
   - `daily_training_loads`: Stores daily aggregated TRIMP, acute load, chronic load, and ACWR.
   - `ai_recommendations`: Stores daily Gemini AI workout recommendations and rationale.
   - Row-Level Security (RLS) policies and performance indexes.

### 4. Start the Local Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the landing page, or jump straight to [http://localhost:3000/dashboard](http://localhost:3000/dashboard) to view the analytics dashboard.

---

## Webhooks & Asynchronous Processing

To test inbound webhooks (Strava & QStash) on your local machine:

1. Use a tunneling tool like **ngrok** or **Cloudflare Tunnel** to expose port 3000:
   ```bash
   ngrok http 3000
   ```
2. Update `NEXT_PUBLIC_APP_URL` in `.env.local` to match your tunnel URL.
3. Configure your Strava Webhook subscription callback URL to:
   `https://<your-tunnel-url>/api/webhooks/strava`

When a new activity is posted:
1. Strava sends an event to `/api/webhooks/strava`.
2. The webhook handler publishes a message to **Upstash QStash** and immediately returns `HTTP 200`.
3. QStash invokes `/api/jobs/process-activity` in the background with signature verification, pulling the HR streams and updating the training loads.

---

## Available Scripts

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Starts the Next.js local development server with Turbopack/Fast Refresh. |
| `npm run build` | Compiles the production build. |
| `npm run start` | Runs the compiled production build locally. |
| `npm run lint` | Runs Next.js ESLint checks. |
| `npm run typecheck` | Validates TypeScript types across the project (`tsc --noEmit`). |

---

## Physiological Models

### 1. Banister TRIMP (Training Impulse)
TRIMP quantifies training load by weighting exercise duration against heart rate reserve:

$$\text{TRIMP} = D \times \Delta\text{HR} \times y$$

Where:
- $D$ is exercise duration in minutes.
- $\Delta\text{HR} = \frac{\text{HR}_{\text{exercise}} - \text{HR}_{\text{rest}}}{\text{HR}_{\text{max}} - \text{HR}_{\text{rest}}}$.
- $y = 0.64 \times e^{1.92 \times \Delta\text{HR}}$ for males ($0.86 \times e^{1.67 \times \Delta\text{HR}}$ for females).

Calculated in [`lib/calculations.ts`](file:///c:/Users/User/Desktop/SC3040/SC3040_AdvancedSoftware/lib/calculations.ts).

### 2. Acute:Chronic Workload Ratio (ACWR)
Tracks the relationship between the workload completed in the past 7 days (Acute / Fatigue) and the average workload completed over the past 28 days (Chronic / Fitness):

$$\text{ACWR} = \frac{\text{Acute Load (7-day rolling average)}}{\text{Chronic Load (28-day rolling average)}}$$

- **< 0.80:** Undertraining / Fitness loss
- **0.80 – 1.30:** "Sweet Spot" (Injury risk minimized, optimal fitness progression)
- **1.30 – 1.50:** Overreaching / Elevated fatigue
- **> 1.50:** "Danger Zone" (Significantly increased relative risk of injury)
# Meal analysis setup

The meal page is available at `/dashboard/nutrition`, through the existing **Nutrition** navigation item. The normal backend uses Supabase Auth/Postgres and Gemini; its meal endpoints require a Supabase bearer token. A separate local demo backend is available for testing before configuring those services.

## Local test database — no API keys required

This workspace's ignored `frontend/.env.local` enables the demo:

```dotenv
NEXT_PUBLIC_NUTRITION_DEMO_MODE=true
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
```

Start the demo backend from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.nutrition_demo:app --host 127.0.0.1 --port 8000
```

In a second terminal, start the frontend from `frontend/` using `npm run dev`. If using the existing workspace's root-installed dependencies, this equivalent command is available:

```powershell
node ..\node_modules\next\dist\bin\next dev
```

Open `http://localhost:3000/dashboard/nutrition`. No login is required for this page in local demo mode. It uses a single shared test user, not your real account. Other app pages retain their existing authentication and integrations.

- **Database:** `backend/.local/nutrition-demo.sqlite3`, created automatically. Saves persist across refreshes and server restarts. This directory is excluded from Git.
- **Supported actions:** upload a photo, review a sample meal, edit portions/ingredients, manually log meals, browse daily totals, and delete saved meals.
- **Sample values:** every valid photo returns the same chicken/rice/broccoli meal. Confidence and recovery text are fixtures, not image analysis. BMR is fixed at 1,650 kcal and exercise burn at 400 kcal. The UI labels these as sample data. Photos/notes are not sent to Gemini or Supabase.
- **Reset:** stop the demo backend and delete only `backend/.local/nutrition-demo.sqlite3`, then restart. Alternatively, delete meals through the journal.
- **Scope:** this tests the meal workflow and actual local persistence. It does not emulate Supabase auth/RLS, Strava sync, or Gemini accuracy.
- **Development only:** the frontend demo switch is disabled in production builds. The separate backend rejects nonlocal connections and refuses startup when `ENVIRONMENT` is set outside `development`/`test`. Run the normal `app.main:app` backend for deployment.

To switch to Supabase later, stop the demo backend, set `NEXT_PUBLIC_NUTRITION_DEMO_MODE=false`, add the credentials below, run the migration, and start `app.main:app`. Restart the frontend. Local test records are not automatically copied to Supabase.

Local validation:

Verified: 38 backend nutrition/demo tests, 5 frontend calculation/configuration tests, and the browser flow against the real SQLite backend passed. Demo backend lint and formatting passed from the `backend/` working directory. After integrating main PR #8, the Settings TypeScript errors are resolved; the existing check-in route error still blocks the project-wide typecheck.

```powershell
# backend/
.\.venv\Scripts\python.exe -m pytest tests/test_nutrition_demo.py tests/test_nutrition.py -q

# frontend/ (requires an available Playwright installation and Chrome)
node tests/nutrition-demo.browser.cjs
```

## 1. Configure the API keys

Copy `backend/.env.example` to `backend/.env`, and `frontend/.env.example` to `frontend/.env.local`.

| File | Variable | Value to provide |
| --- | --- | --- |
| `backend/.env` | `SUPABASE_URL` | Your Supabase project URL |
| `backend/.env` | `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service-role key. Keep it on the server. |
| `backend/.env` | `GOOGLE_GENERATIVE_AI_API_KEY` | A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) |
| `backend/.env` | `GEMINI_NUTRITION_MODEL` | Defaults to `gemini-2.5-flash`, as specified in the handover. Change it if your project uses a different supported vision model. |
| `backend/.env` | `FRONTEND_URL` | `http://localhost:3000` locally; your actual frontend origin when deployed |
| `frontend/.env.local` | `NEXT_PUBLIC_SUPABASE_URL` | The same Supabase project URL |
| `frontend/.env.local` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The public Supabase anon key |
| `frontend/.env.local` | `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:8000` locally; the browser-accessible HTTPS backend URL when deployed |

The implementation reuses this repository's variable names. The handover's `GEMINI_API_KEY` and `NEXT_PUBLIC_FASTAPI_URL` are not read. Restart both services after changing environment values; rebuild the frontend when changing public variables in production.

Only Supabase is needed for manual meal entry. Gemini is additionally needed for photo analysis. No food database, image storage, or transcription API is required: missing ingredients can be entered with their nutrition values, photos are processed in memory, and voice transcripts can be pasted into the notes field.

## 2. Create the tables

For an existing project with this repository's base schema, run **`supabase/migrations/20261007_nutrition.sql`** in the Supabase SQL Editor. For a new database, run `supabase/schema.sql`, which includes the same nutrition definitions.

This creates `public.meals`, its owner/date index, and owner-only row-level security policies. It also adds nullable `activities.calories`. Meal IDs are UUIDs generated for each draft so retrying a save cannot create a duplicate.

The foreign key uses `auth.users(id)`. The handover referred to `public.profiles`, which is absent from the repository schema. If you previously executed the handover's BIGSERIAL `meals` table, this migration does not convert its ID type: migrate that existing table and its data to this UUID schema before enabling the new page. Do not delete existing data to resolve a schema mismatch.

The migration has not been executed against your remote database.

## 3. Start the app

Backend, from `backend/`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Frontend, from `frontend/`:

```powershell
npm install
npm run dev
```

Sign in using your project's Supabase account and open `http://localhost:3000/dashboard/nutrition`. This repository currently has a development-only login screen with a hardcoded test account; your team's authentication module must provide the real sign-in flow. The nutrition page itself verifies the session and redirects signed-out visitors to `/login`.

## 4. BMR and Strava integration points

- BMR reads the existing profile controller's `users` fields: `user_id`, `age`, `weight` (kg), `height` (cm), and `biological_sex` (`MALE`/`FEMALE`). It uses the same Mifflin–St Jeor formula as the Settings form. If your deployed database only has `athlete_profiles`, BMR remains unavailable because that schema lacks age and height. Merge/configure your team's profile persistence to enable it.
- Exercise burn comes from `activities.calories` for the authenticated user and selected day. The Strava activity model now retains the detail endpoint's `calories` field, and the existing worker writes it when persisting an activity. Configure `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` for the existing OAuth integration and ensure the activity ingestion pipeline runs.
- The current repository does not start its activity worker in `main.py`, and the worker has an existing unresolved `.config` import. Connecting/restoring that shared Strava pipeline is a separate integration task; setting keys alone will not import exercise burn. The meal module reads imported data without claiming that missing burn is zero.
- Historic activity rows need their calorie values backfilled from Strava activity details. Net energy remains unavailable when no calorie-bearing activities exist or any imported activity lacks calories.
- Confirmed formula: **net energy = intake − BMR − exercise burn**. This intentionally corrects the plus sign in the SRS, per the user's confirmation. It is a partial energy estimate, excluding non-exercise daily activity.

## Behavior and requirements

| Requirement | Implementation |
| --- | --- |
| Photo selection/capture | File picker, drag-and-drop, and a separate camera input |
| Image formats | JPEG, PNG, WEBP, HEIC and HEIF; 10 MB and 25 megapixel limits |
| HEIC handling | Server-side decoding with Pillow/pillow-heif, then JPEG normalization; browsers without HEIC preview show the selected filename. No client conversion library is needed. |
| Supplementary context | Up to 1,000 characters of text or pasted voice transcript |
| AI output | Validated ingredient names, weights, nutrients, confidence and endurance feedback |
| Review | Rename meal; change category; scale weights; edit nutrition; add/remove ingredients |
| Persistence | Explicit confirmation only; server-computed totals; retry-safe ID; authenticated ownership |
| Daily totals | Selected local day, calculated from saved ingredients; delete refreshes totals |
| Privacy | Image metadata is stripped before Gemini; no image is saved to Supabase |
| Errors | Unsupported/corrupt/oversized images, provider failure, missing keys, expired auth and failed saves are surfaced |

The selected day's browser UTC offset is sent with daily queries. This works for Singapore and other fixed-offset zones; historical daylight-saving transition days use the selected date's noon offset rather than an IANA time-zone interval.

Recovery feedback uses the image and supplied notes. It does not silently fetch live workout history. Changing ingredient values updates nutrition totals, not the previously generated feedback. Meals are saved at the draft's creation time; the date picker browses history rather than backdating new meals.

## API contract

All routes are registered under `/api/nutrition`:

| Method/path | Input | Result |
| --- | --- | --- |
| `POST /analyze` | Multipart `file` and optional `notes` | Meal estimate plus computed totals; no database write |
| `POST /meals` | UUID `id`, `meal_name`, `meal_type`, timezone-aware `logged_at`, `confidence_score`, `training_context_note`, `items` | Saved meal, with totals recomputed from ingredients |
| `GET /daily` | `day=YYYY-MM-DD`, `offset_minutes=480` for Singapore | Meals, totals, nullable BMR/burn/net energy |
| `DELETE /meals/{id}` | Saved meal UUID | 204, or 404 if absent/not owned |

Each food item contains `name`, `estimated_weight_g`, `calories`, `protein_g`, `carbs_g`, and `fat_g`. Weights must be positive, nutrients nonnegative and finite. Confidence is 0–1. Request models reject extra fields, including forged `user_id` and client-calculated totals.

## Validation

```powershell
# From backend/
.\.venv\Scripts\python.exe -m pytest tests/test_nutrition.py -q
.\.venv\Scripts\python.exe -m ruff check app/controllers/nutrition.py app/services/nutrition.py app/models/nutrition.py tests/test_nutrition.py

# From frontend/
node --test tests/nutrition.test.cjs
node tests/nutrition.browser.cjs
npm run typecheck
```

The browser test uses local authentication/API fixtures and Chrome, with no live credentials or remote writes. It expects Playwright to be available; `PLAYWRIGHT_MODULE` may point to an existing Playwright installation, and `PLAYWRIGHT_CHANNEL` can select another installed channel. Ruff is a development validation tool and can be installed separately.

At implementation time: 30 nutrition backend tests and 4 frontend calculation tests passed; desktop/mobile browser checks passed, including photo-analysis preview, portion changes, ingredient add/remove, saving, refreshed daily totals, deletion and sign-in redirects. Backend nutrition Ruff lint and formatting checks passed. The backend test run reported three deprecation warnings from existing model configuration and the test-client dependency. Live Gemini accuracy, live Supabase persistence and SQL policy behavior still require your configured project. After integrating main PR #8, remaining repository-wide blockers include the existing check-in route TypeScript error, a missing ESLint dependency/configuration, and the old calculations test importing the removed `app.calculations` module. The integration regression run passed 85 backend tests, 5 frontend calculation/configuration tests, and browser checks for nutrition, Settings profile loading, integration links and OAuth error redirects.

## Changed files

Local demo additions/updates: `backend/app/nutrition_demo.py`, `backend/tests/test_nutrition_demo.py`, `frontend/tests/nutrition-demo.browser.cjs`, `.gitignore`, and the frontend route, API client, UI, environment template and browser test. The ignored `frontend/.env.local` activates this workspace's demo mode.

- `frontend/app/(app)/dashboard/nutrition/page.tsx`: authenticated route.
- `frontend/app/(app)/dashboard/nutrition/meal-analysis.tsx`: meal UI and daily journal.
- `frontend/lib/nutrition.ts`: API client and nutrient calculations.
- `frontend/tests/nutrition.test.cjs`, `frontend/tests/nutrition.browser.cjs`: calculation and browser tests.
- `frontend/.env.example`, `backend/.env.example`: configuration templates.
- `backend/app/controllers/nutrition.py`: authenticated HTTP endpoints.
- `backend/app/services/nutrition.py`: image processing, Gemini, persistence and aggregation.
- `backend/app/models/nutrition.py`: request/response validation.
- `backend/app/commons/config.py`, `backend/app/main.py`: model configuration and router registration.
- `backend/app/services/strava.py`, `backend/app/services/worker.py`: retain imported calorie burn.
- `backend/requirements.txt`: multipart uploads, image decoding, and email validation required by the existing user model.
- `backend/tests/test_nutrition.py`: validation, authorization and aggregation tests.
- `supabase/schema.sql`, `supabase/migrations/20261007_nutrition.sql`: database setup.
- `README.md`, `docs/meal-analysis-setup.md`: setup and integration instructions.

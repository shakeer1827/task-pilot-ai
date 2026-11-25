# TaskPilot AI

> **"Give a goal. Watch your agent make it happen."**

**Hackathon Theme 1: Autonomous Task Agents**

TaskPilot AI is a production-style autonomous event-planning agent built for students, college clubs, and small teams. Given a high-level goal in natural language, TaskPilot AI detects missing information, decomposes the goal into an editable dependency-aware plan, awaits explicit human approval, executes real backend tools (Open-Meteo Weather API, Budget Calculator, Logistics Planner, Database Persistence), observes actual tool outputs, performs bounded autonomous replanning on failures or budget overruns, and compiles an auditable final execution report.

---

## Problem Statement

Student organizers and small teams frequently struggle to translate a high-level goal (e.g., *"Organize a college cultural event for 200 students next Saturday with a budget of ₹50,000"*) into a verified operational plan. Conventional AI chatbots only generate static text checklists—they cannot validate live weather risks, compute real budget overruns, adapt when an external API fails, pause for missing details, or maintain an auditable execution trail.

## Solution Description

TaskPilot AI replaces static chat replies with a backend-controlled **multi-agent execution loop** (`Planner → Executor → Observer → Replanner → Reporter`) backed by relational persistence, JWT + bcrypt authentication, and real tool integrations. Every tool call, timestamp, input payload, output, and replanning cycle is persisted and streamed live to the user's Execution Workspace. The system strictly distinguishes between AI-completed verifications, failed/blocked tasks, and actions requiring human sign-off.

---

## Features

- **Natural-Language Goal Understanding & Missing Info Detection**: Extracts date, location, budget, and participant constraints and surfaces follow-up questions when critical data is missing.
- **Human-in-the-Loop Planning Workspace**: Users can edit task titles/descriptions, change assigned tools, reorder steps, add/delete tasks, regenerate plans, and must explicitly approve a plan before execution begins.
- **Genuine Autonomous Execution Loop**: Backend engine executes approved tasks sequentially while respecting task dependencies.
- **Visible Live Agent Trace (SSE)**: Real-time timeline displaying `[Timestamp]`, `Agent`, `Tool`, `Input`, `Output`, `Duration (ms)`, and `Status` with expandable JSON inspection.
- **Bounded Autonomous Replanning (Max 2 Attempts)**:
  - **Budget Overrun**: Observer flags `BUDGET_OVERRUN`; Replanner scales discretionary estimates to fit within budget.
  - **Weather API Error / >16-Day Forecast Range**: Logs actual failure or unavailability without inventing weather, switches to indoor contingency planning, and lets independent tasks continue.
  - **Unclear Location**: Transitions to `waiting_for_input` and prompts the organizer to supply a valid city/venue before resuming.
  - **Database Failure**: Records actual persistence failures honestly rather than falsely claiming success.
- **Execution Controls**: Real backend **Pause**, **Resume**, **Stop** (safely halts scheduling new tasks and saves partial progress), and **Retry Failed Task**.
- **Task History & Non-Destructive Rerun**: Preserves all prior execution runs and lets users rerun goals as new plan versions.
- **Structured Final Report**: Separates completed work, failed/incomplete work, tasks requiring human action, budget charts (Recharts), weather findings, tools invoked, and next steps.

---

## Technology Stack

- **Frontend**: React 18, Vite, React Router DOM, Tailwind CSS, Lucide React, Axios, Recharts
- **Backend**: Node.js, Express.js, Zod validation, JWT (`jsonwebtoken`), `bcryptjs`, Helmet, CORS, Server-Sent Events (SSE)
- **AI Layer**: Google Gemini REST API (`generateContent` with structured JSON output + prompt-injection `<untrusted_data>` isolation) and optional transparent `AI_FALLBACK_MODE=heuristic` for local key-free evaluation
- **Database**: Supabase PostgreSQL (`@supabase/supabase-js`) with SQL migrations & Row Level Security (RLS), plus built-in `node:sqlite` fallback (`LOCAL_DB_PATH`) when Supabase credentials are not configured

---

## Agent Architecture

1. **Planner Agent (`server/src/agents/plannerAgent.js`)**: Parses the user goal, identifies missing parameters, builds 4–7 ordered tasks with dependencies, expected results, tool bindings, and failure-handling rules.
2. **Executor Agent (`server/src/agents/executorAgent.js`)**: Resolves validated tool inputs from the goal, clarifications, and prior task outputs, then invokes the registered tool.
3. **Observer Agent (`server/src/agents/observerAgent.js`)**: Evaluates real tool outputs against expected results, detects `BUDGET_OVERRUN`, `FORECAST_OUT_OF_RANGE`, `UNCLEAR_LOCATION`, API failures, and human-action requirements.
4. **Replanner Agent (`server/src/agents/replannerAgent.js`)**: Diagnoses failures and chooses recovery strategies (`retry_with_adjusted_input`, `insert_contingency_task`, or `ask_user`), capped at **2 attempts per task** to prevent infinite loops.
5. **Reporter Agent (`server/src/agents/reporterAgent.js`)**: Compiles the final structured execution report directly from persisted tasks, tool outputs, and agent logs.

---

## Agent Execution Flow

```text
USER GOAL
   │
   ▼
GOAL UNDERSTANDING & MISSING INFO CHECK (Planner)
   │
   ▼
EDITABLE PLAN GENERATION ──► USER EDITS & APPROVES PLAN
                                     │
                                     ▼
                         BACKEND EXECUTION ENGINE
                                     │
                                     ▼
                        SELECT NEXT RUNNABLE TASK
                                     │
                                     ▼
                      VALIDATE & CALL REAL TOOL (Executor)
                                     │
                                     ▼
                     OBSERVE REAL TOOL OUTPUT (Observer)
                                     │
                          ┌──────────┴──────────┐
                          │                     │
                     SUCCESS?                 NO / ISSUE
                          │                     │
                          ▼                     ▼
                 MARK TASK COMPLETED    DIAGNOSE & REPLAN (max 2x)
                          │             OR PAUSE FOR USER INPUT
                          │                     │
                          └──────────┬──────────┘
                                     ▼
                          ALL TASKS FINISHED / STOPPED?
                                     │
                                     ▼
                      GENERATE FINAL REPORT (Reporter)
                                     │
                                     ▼
                      PERSIST HISTORY & LOGS TO DATABASE
```

---

## Tools and APIs Used

| Tool ID | Integration | Purpose |
| :--- | :--- | :--- |
| `weather_forecast` | **Open-Meteo Geocoding & Forecast API** (`open-meteo.com`) | Geocodes venue/city, fetches daily weather (up to 16 days), evaluates outdoor rain/heat/wind risk, and reports honestly when dates exceed forecast range. |
| `budget_calculator` | **Backend Budget Calculator** (`server/src/tools/budgetTool.js`) | Computes itemized estimates across Venue, Food, Decorations, Sound System, Transportation, and Miscellaneous; flags `[ESTIMATE]` vs actual quotes and detects overruns. |
| `logistics_planner` | **Logistics & Contingency Generator** (`server/src/tools/logisticsTool.js`) | Generates run-of-show schedules, weather contingency plans, and human-action vendor checklists. |
| `database_save` | **Database Persistence Tool** (`server/src/tools/databaseTool.js`) | Saves and verifies execution checkpoints in Supabase PostgreSQL / SQLite. |

---

## Database Structure

Defined in [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql) with foreign keys, indexes, `updated_at` triggers, and **Row Level Security (RLS)** policies:

- `users`: `id`, `name`, `email`, `password_hash`, `is_demo`, `created_at`
- `goals`: `id`, `user_id`, `title`, `description`, `event_date`, `location`, `budget`, `participants`, `additional_instructions`, `missing_info_json`, `clarifications_json`, `is_demo`, `created_at`
- `plans`: `id`, `goal_id`, `user_id`, `version`, `plan_json`, `approval_status`, `ai_provider`, `created_at`, `updated_at`
- `tasks`: `id`, `plan_id`, `user_id`, `title`, `description`, `execution_order`, `status`, `dependencies`, `tool_name`, `expected_result`, `failure_handling`, `input_payload`, `result`, `error_message`, `replan_attempts`, `requires_human_action`, `created_at`, `updated_at`
- `executions`: `id`, `plan_id`, `goal_id`, `user_id`, `status`, `current_task_id`, `stop_requested`, `pause_requested`, `started_at`, `completed_at`, `duration_ms`, `final_report`, `created_at`
- `agent_logs`: `id`, `execution_id`, `task_id`, `user_id`, `agent_name`, `action`, `tool_name`, `input_json`, `output_json`, `status`, `duration_ms`, `created_at`

---

## Local Setup Instructions

1. **Install dependencies**:
   ```bash
   npm --prefix server install
   npm --prefix client install
   ```
2. **Configure environment variables**:
   Copy `server/.env.example` to `server/.env` and fill in your credentials.
3. **Database setup (Supabase PostgreSQL)**:
   Run `supabase/migrations/001_initial_schema.sql` inside your Supabase SQL Editor, then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `server/.env`.
   *(If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are left blank, the backend automatically uses local SQLite at `LOCAL_DB_PATH` for local development/testing.)*

---

## Environment Variables

See `.env.example`, `server/.env.example`, and `client/.env.example`:

- `PORT`: Backend server port (default `5000`)
- `NODE_ENV`: `development` | `production` | `test`
- `CLIENT_URL`: Allowed CORS origin (default `http://localhost:5173`)
- `JWT_SECRET`: Strong secret (>= 32 chars in production)
- `JWT_EXPIRES_IN`: Token lifetime (default `7d`)
- `GEMINI_API_KEY`: Google Gemini API key (backend-only, never exposed to client)
- `GEMINI_MODEL`: Default `gemini-2.5-flash`
- `AI_FALLBACK_MODE`: `off` (default) or `heuristic` for local evaluation without a Gemini key
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key (backend-only)
- `LOCAL_DB_PATH`: SQLite fallback path (default `./data/taskpilot.db`)
- `VITE_API_URL`: Optional frontend API base URL (default `/api` via Vite proxy)

---

## Backend Execution Instructions

```bash
npm --prefix server run dev
# Production:
npm --prefix server run start
```

## Frontend Execution Instructions

```bash
npm --prefix client run dev
# Production build:
npm --prefix client run build
```

---

## Deployment Instructions

1. Provision a **Supabase** project and apply `supabase/migrations/001_initial_schema.sql`.
2. Deploy `server/` to a Node.js host (Render, Railway, Fly.io, Cloud Run) with `NODE_ENV=production`, a strong `JWT_SECRET`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CLIENT_URL` set to your frontend URL.
3. Build `client/` (`npm --prefix client run build`) with `VITE_API_URL=https://your-backend-domain/api` and deploy `client/dist` to Vercel, Netlify, or Cloudflare Pages.

---

## Testing Instructions

Run the automated backend integration & unit test suite (`node --test`):

```bash
npm --prefix server test
```

Verify the frontend production bundle:

```bash
npm --prefix client run build
```

---

## Security Considerations

- **No Frontend Secrets**: `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` stay strictly on the backend.
- **Authentication & Isolation**: Passwords are hashed with `bcryptjs`; every protected route validates JWTs and scopes queries by `user_id`, backed by Supabase RLS policies.
- **Prompt Injection Defense**: Untrusted user text and external API data are wrapped in `<untrusted_data>` blocks and sanitized; AI-generated code is never executed.
- **Human Safety Gate**: Plans cannot execute without explicit user approval, and no real bookings, payments, or external messages are performed automatically.

---

## Known Limitations

- **Open-Meteo Forecast Horizon**: Open-Meteo provides daily forecasts up to 16 days ahead; events further out honestly report forecast unavailability.
- **Cost Estimates**: Budget line items are structured student-event estimates (`[ESTIMATE]`) unless actual vendor quotations are provided.
- **Vendor Actions**: Vendor outreach, venue booking, and budget sign-offs are intentionally flagged as human-action items rather than executed autonomously.

-- ============================================================
-- TaskPilot AI - Initial PostgreSQL / Supabase Migration
-- ============================================================
-- Safe, idempotent migration defining relational tables,
-- indexes, updated_at triggers, and Row Level Security (RLS).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Goals
CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  event_date TEXT,
  location TEXT,
  budget NUMERIC(12, 2),
  participants INTEGER,
  additional_instructions TEXT,
  missing_info_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  clarifications_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Plans
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  plan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN ('draft', 'approved', 'rejected', 'superseded')),
  ai_provider TEXT NOT NULL DEFAULT 'gemini',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tasks
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  execution_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'waiting_for_input', 'awaiting_approval', 'interrupted')),
  dependencies JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_name TEXT NOT NULL DEFAULT 'none',
  expected_result TEXT,
  failure_handling TEXT,
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error_message TEXT,
  replan_attempts INTEGER NOT NULL DEFAULT 0,
  requires_human_action BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Executions
CREATE TABLE IF NOT EXISTS public.executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'running', 'paused', 'waiting_for_input', 'completed', 'failed', 'stopped')),
  current_task_id UUID,
  stop_requested BOOLEAN NOT NULL DEFAULT FALSE,
  pause_requested BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  final_report JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Agent Logs (Visible Agent Trace)
CREATE TABLE IF NOT EXISTS public.agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES public.executions(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  action TEXT NOT NULL,
  tool_name TEXT,
  input_json JSONB,
  output_json JSONB,
  status TEXT NOT NULL DEFAULT 'info'
    CHECK (status IN ('info', 'running', 'completed', 'failed', 'warning', 'waiting')),
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public.goals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plans_goal_id ON public.plans(goal_id);
CREATE INDEX IF NOT EXISTS idx_plans_user_id ON public.plans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_plan_id ON public.tasks(plan_id, execution_order ASC);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON public.tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_executions_user_id ON public.executions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_plan_id ON public.executions(plan_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_execution_id ON public.agent_logs(execution_id, created_at ASC);

-- ============================================================
-- Updated_at Trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_plans_updated_at ON public.plans;
CREATE TRIGGER trg_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own profile when using authenticated context
DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
  FOR SELECT USING (
    id::text = COALESCE(auth.uid()::text, current_setting('app.current_user_id', true))
  );

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users
  FOR UPDATE USING (
    id::text = COALESCE(auth.uid()::text, current_setting('app.current_user_id', true))
  );

-- Goals isolation
DROP POLICY IF EXISTS goals_user_isolation ON public.goals;
CREATE POLICY goals_user_isolation ON public.goals
  FOR ALL USING (
    user_id::text = COALESCE(auth.uid()::text, current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    user_id::text = COALESCE(auth.uid()::text, current_setting('app.current_user_id', true))
  );

-- Plans isolation
DROP POLICY IF EXISTS plans_user_isolation ON public.plans;
CREATE POLICY plans_user_isolation ON public.plans
  FOR ALL USING (
    user_id::text = COALESCE(auth.uid()::text, current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    user_id::text = COALESCE(auth.uid()::text, current_setting('app.current_user_id', true))
  );

-- Tasks isolation
DROP POLICY IF EXISTS tasks_user_isolation ON public.tasks;
CREATE POLICY tasks_user_isolation ON public.tasks
  FOR ALL USING (
    user_id::text = COALESCE(auth.uid()::text, current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    user_id::text = COALESCE(auth.uid()::text, current_setting('app.current_user_id', true))
  );

-- Executions isolation
DROP POLICY IF EXISTS executions_user_isolation ON public.executions;
CREATE POLICY executions_user_isolation ON public.executions
  FOR ALL USING (
    user_id::text = COALESCE(auth.uid()::text, current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    user_id::text = COALESCE(auth.uid()::text, current_setting('app.current_user_id', true))
  );

-- Agent logs isolation
DROP POLICY IF EXISTS agent_logs_user_isolation ON public.agent_logs;
CREATE POLICY agent_logs_user_isolation ON public.agent_logs
  FOR ALL USING (
    user_id::text = COALESCE(auth.uid()::text, current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    user_id::text = COALESCE(auth.uid()::text, current_setting('app.current_user_id', true))
  );

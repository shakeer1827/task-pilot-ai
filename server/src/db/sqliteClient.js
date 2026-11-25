import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function createSqliteDatabase(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      event_date TEXT,
      location TEXT,
      budget REAL,
      participants INTEGER,
      additional_instructions TEXT,
      missing_info_json TEXT NOT NULL DEFAULT '[]',
      clarifications_json TEXT NOT NULL DEFAULT '{}',
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      plan_json TEXT NOT NULL DEFAULT '{}',
      approval_status TEXT NOT NULL DEFAULT 'draft',
      ai_provider TEXT NOT NULL DEFAULT 'gemini',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      execution_order INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      dependencies TEXT NOT NULL DEFAULT '[]',
      tool_name TEXT NOT NULL DEFAULT 'none',
      expected_result TEXT,
      failure_handling TEXT,
      input_payload TEXT NOT NULL DEFAULT '{}',
      result TEXT,
      error_message TEXT,
      replan_attempts INTEGER NOT NULL DEFAULT 0,
      requires_human_action INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      current_task_id TEXT,
      stop_requested INTEGER NOT NULL DEFAULT 0,
      pause_requested INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      duration_ms INTEGER,
      final_report TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_logs (
      id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      task_id TEXT,
      user_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      action TEXT NOT NULL,
      tool_name TEXT,
      input_json TEXT,
      output_json TEXT,
      status TEXT NOT NULL DEFAULT 'info',
      duration_ms INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_plans_goal_id ON plans(goal_id);
    CREATE INDEX IF NOT EXISTS idx_plans_user_id ON plans(user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_plan_id ON tasks(plan_id, execution_order);
    CREATE INDEX IF NOT EXISTS idx_executions_user_id ON executions(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_agent_logs_execution_id ON agent_logs(execution_id, created_at);
  `);

  return db;
}

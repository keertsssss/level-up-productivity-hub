// Opens the SQLite file and creates all tables (only if they don't exist yet).
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dir = path.join(__dirname, '..', 'database');
const dbPath = process.env.DB_PATH || path.join(dir, 'productivity.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Other'
    CHECK (category IN ('Learning','Career','Fitness','Personal','Projects','Other')),
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High')),
  start_date TEXT,
  due_date TEXT NOT NULL,                 -- YYYY-MM-DD, the day the task is "assigned" to
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily','weekdays')),
  weekdays TEXT DEFAULT '',               -- e.g. "1,3,5" (0=Sunday ... 6=Saturday)
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS habit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  log_date TEXT NOT NULL,
  UNIQUE (habit_id, log_date)             -- a habit can only be completed once per day
);
CREATE TABLE IF NOT EXISTS xp_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,              -- task | habit | bonus_tasks | bonus_habits
  source_id INTEGER NOT NULL DEFAULT 0,
  source_date TEXT NOT NULL,
  points INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (source_type, source_id, source_date)  -- the same event can never pay twice
);
CREATE TABLE IF NOT EXISTS achievements (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS daily_summaries (
  summary_date TEXT PRIMARY KEY,
  tasks_assigned INTEGER NOT NULL,
  tasks_completed INTEGER NOT NULL,
  productivity REAL NOT NULL,
  habits_scheduled INTEGER NOT NULL,
  habits_completed INTEGER NOT NULL,
  habit_rate REAL NOT NULL
);
`);
module.exports = db;

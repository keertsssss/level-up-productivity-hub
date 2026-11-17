// All productivity maths lives here.
// Tasks: assigned to a day by due_date; cancelled tasks are ignored.
// Habits: scheduled by frequency/weekday; each completion is one habit_logs row.
const db = require('../database');

const pct = (done, total) => (total === 0 ? 0 : Math.round((done / total) * 1000) / 10);
const p2 = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const today = () => fmt(new Date());

function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function getDayStats(date) {
  const t = db.prepare(`SELECT COUNT(*) AS assigned,
      COALESCE(SUM(status='completed'),0) AS completed
      FROM tasks WHERE due_date = ? AND status != 'cancelled'`).get(date);
  const dow = new Date(date + 'T00:00:00').getDay();
  const scheduled = db.prepare('SELECT * FROM habits WHERE active = 1').all()
    .filter((h) => h.frequency === 'daily' || (h.weekdays || '').split(',').map((s) => s.trim()).includes(String(dow)));
  const done = db.prepare('SELECT habit_id FROM habit_logs WHERE log_date = ?').all(date)
    .filter((l) => scheduled.some((h) => h.id === l.habit_id)).length;
  return {
    date,
    tasksAssigned: t.assigned, tasksCompleted: t.completed, tasksPending: t.assigned - t.completed,
    productivity: pct(t.completed, t.assigned),
    habitsScheduled: scheduled.length, habitsCompleted: done,
    habitRate: pct(done, scheduled.length),
  };
}

// Saves a snapshot so history is kept for every day (called after any change).
function saveSummary(date) {
  const s = getDayStats(date);
  db.prepare(`INSERT INTO daily_summaries VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(summary_date) DO UPDATE SET tasks_assigned=excluded.tasks_assigned,
    tasks_completed=excluded.tasks_completed, productivity=excluded.productivity,
    habits_scheduled=excluded.habits_scheduled, habits_completed=excluded.habits_completed,
    habit_rate=excluded.habit_rate`)
    .run(date, s.tasksAssigned, s.tasksCompleted, s.productivity, s.habitsScheduled, s.habitsCompleted, s.habitRate);
  return s;
}

// Average over the last N days, counting only days that had tasks assigned.
function averageProductivity(days) {
  let sum = 0, counted = 0;
  const d = new Date(today() + 'T00:00:00');
  for (let i = 0; i < days; i++) {
    const s = getDayStats(fmt(d));
    if (s.tasksAssigned > 0) { sum += s.productivity; counted++; }
    d.setDate(d.getDate() - 1);
  }
  return counted === 0 ? 0 : Math.round((sum / counted) * 10) / 10;
}

module.exports = { pct, today, fmt, isDate, getDayStats, saveSummary, averageProductivity };

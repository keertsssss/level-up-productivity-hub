// XP, levels, streaks and achievements.
// Anti-cheat rule: every XP award is INSERT OR IGNORE on a UNIQUE key,
// so unchecking and re-checking never pays XP twice.
const db = require('../database');
const { getDayStats, today, fmt } = require('./productivity');

const LEVELS = [
  { level: 1, name: 'Beginner', xp: 0 },
  { level: 2, name: 'Explorer', xp: 100 },
  { level: 3, name: 'Achiever', xp: 250 },
  { level: 4, name: 'Pro', xp: 500 },
  { level: 5, name: 'Productivity Master', xp: 1000 },
];

const totalXp = () => db.prepare('SELECT COALESCE(SUM(points),0) AS xp FROM xp_transactions').get().xp;

function levelInfo(xp = totalXp()) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) cur = l;
  const next = LEVELS.find((l) => l.xp > xp) || null;
  return {
    xp, level: cur.level, name: cur.name,
    nextLevelXp: next ? next.xp : null, xpToNext: next ? next.xp - xp : 0,
    progress: next ? Math.round(((xp - cur.xp) / (next.xp - cur.xp)) * 100) : 100,
  };
}

// Returns points actually awarded (0 if this event was already paid).
function award(type, id, date, points) {
  const r = db.prepare('INSERT OR IGNORE INTO xp_transactions (source_type,source_id,source_date,points) VALUES (?,?,?,?)')
    .run(type, id, date, points);
  return r.changes ? points : 0;
}

function activityDates() {
  return db.prepare(`SELECT substr(completed_at,1,10) AS d FROM tasks WHERE status='completed' AND completed_at IS NOT NULL
    UNION SELECT log_date FROM habit_logs ORDER BY d`).all().map((r) => r.d);
}

function streaks() {
  const days = activityDates();
  const set = new Set(days);
  let longest = 0, run = 0, prev = null;
  for (const d of days) {
    run = prev && (new Date(d) - new Date(prev)) === 86400000 ? run + 1 : 1;
    longest = Math.max(longest, run); prev = d;
  }
  let current = 0;
  const c = new Date(today() + 'T00:00:00');
  if (!set.has(today())) c.setDate(c.getDate() - 1); // today not done yet: streak is still alive
  while (set.has(fmt(c))) { current++; c.setDate(c.getDate() - 1); }
  return { current, longest };
}

const count = (sql) => db.prepare(sql).get().n;
const BADGES = [
  ['first_task', 'First Task Completed', () => count("SELECT COUNT(*) n FROM tasks WHERE status='completed'") >= 1, 'Complete your first task'],
  ['first_habit', 'First Habit Completed', () => count('SELECT COUNT(*) n FROM habit_logs') >= 1, 'Log your first habit completion'],
  ['streak_3', '3-Day Streak', () => streaks().longest >= 3, 'Stay active 3 days in a row'],
  ['streak_7', '7-Day Streak', () => streaks().longest >= 7, 'Stay active 7 days in a row'],
  ['tasks_10', '10 Tasks Completed', () => count("SELECT COUNT(*) n FROM tasks WHERE status='completed'") >= 10, 'Complete 10 tasks total'],
  ['champion', 'Productivity Champion', () => count(
    'SELECT COUNT(*) n FROM daily_summaries WHERE productivity = 100 AND tasks_assigned >= 3') >= 1, 'Hit 100% productivity on a day with 3+ tasks'],
];

function checkAchievements() {
  const unlocked = [];
  for (const [code, title, test] of BADGES) {
    if (test() && db.prepare('INSERT OR IGNORE INTO achievements (code,title) VALUES (?,?)').run(code, title).changes)
      unlocked.push(title);
  }
  return unlocked;
}

function getAchievements() {
  checkAchievements();
  const rows = db.prepare('SELECT code, title, unlocked_at FROM achievements').all();
  const byCode = new Map(rows.map((r) => [r.code, r]));
  return BADGES.map(([code, title, , description]) => {
    const row = byCode.get(code);
    return {
      code,
      title,
      description,
      unlocked: Boolean(row),
      unlocked_at: row ? row.unlocked_at : null,
    };
  });
}

function finish(before, gained) {
  const info = levelInfo();
  return { xpGained: gained, levelUp: info.level > before, levelInfo: info, newAchievements: checkAchievements() };
}

// Call after a task becomes completed. Returns what the UI should celebrate.
function onTaskCompleted(task) {
  const before = levelInfo().level;
  const alreadyPaid = db.prepare("SELECT 1 FROM xp_transactions WHERE source_type='task' AND source_id=?").get(task.id);
  let gained = alreadyPaid ? 0 : award('task', task.id, task.due_date, task.priority === 'High' ? 15 : 10);
  const day = getDayStats(task.due_date);
  if (day.tasksAssigned > 0 && day.tasksCompleted === day.tasksAssigned)
    gained += award('bonus_tasks', 0, task.due_date, 30);
  return finish(before, gained);
}

function onHabitCompleted(habitId, date) {
  const before = levelInfo().level;
  let gained = award('habit', habitId, date, 5);
  const day = getDayStats(date);
  if (day.habitsScheduled > 0 && day.habitsCompleted === day.habitsScheduled)
    gained += award('bonus_habits', 0, date, 20);
  return finish(before, gained);
}

module.exports = { LEVELS, levelInfo, totalXp, streaks, checkAchievements, getAchievements, onTaskCompleted, onHabitCompleted };

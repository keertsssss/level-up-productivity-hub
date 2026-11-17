const express = require('express');
const db = require('../database');
const { saveSummary, today, isDate } = require('../services/productivity');
const game = require('../services/gamification');
const router = express.Router();

const FREQS = ['daily', 'weekdays'];
const getHabit = (id) => db.prepare('SELECT * FROM habits WHERE id = ? AND active = 1').get(id);

function isScheduledOn(habit, date) {
  if (habit.frequency === 'daily') return true;
  const dow = String(new Date(date + 'T00:00:00').getDay());
  return (habit.weekdays || '').split(',').map((s) => s.trim()).includes(dow);
}

function normalizeWeekdays(raw) {
  const arr = Array.isArray(raw) ? raw : String(raw || '').split(',');
  const days = [...new Set(arr.map((s) => String(s).trim()).filter((s) => /^[0-6]$/.test(s)))].sort();
  return days.join(',');
}

// GET /api/habits?date=YYYY-MM-DD
router.get('/', (req, res) => {
  if (req.query.date && !isDate(req.query.date)) {
    return res.status(400).json({ errors: ['Invalid date (YYYY-MM-DD)'] });
  }
  const date = req.query.date || today();
  const habits = db.prepare('SELECT * FROM habits WHERE active = 1 ORDER BY id DESC').all();
  const logs = new Set(db.prepare('SELECT habit_id FROM habit_logs WHERE log_date = ?').all(date).map((l) => l.habit_id));
  res.json(habits.map((h) => ({
    ...h,
    scheduled: isScheduledOn(h, date),
    completed: logs.has(h.id),
  })));
});

// POST /api/habits
router.post('/', (req, res) => {
  const b = req.body || {};
  const errors = [];
  if (typeof b.name !== 'string' || !b.name.trim()) errors.push('Habit name is required');
  if (typeof b.name === 'string' && b.name.length > 100) errors.push('Habit name must be 100 characters or less');
  const frequency = b.frequency || 'daily';
  if (!FREQS.includes(frequency)) errors.push('Invalid frequency');
  const weekdays = frequency === 'weekdays' ? normalizeWeekdays(b.weekdays) : '';
  if (frequency === 'weekdays' && !weekdays) errors.push('Select at least one weekday');
  if (errors.length) return res.status(400).json({ errors });

  const r = db.prepare('INSERT INTO habits (name, frequency, weekdays) VALUES (?, ?, ?)')
    .run(b.name.trim(), frequency, weekdays);
  const currentDay = today();
  saveSummary(currentDay);
  const created = getHabit(r.lastInsertRowid);
  res.status(201).json({
    ...created,
    scheduled: isScheduledOn(created, currentDay),
    completed: false,
  });
});

// PATCH /api/habits/:id/toggle
router.patch('/:id/toggle', (req, res) => {
  const h = getHabit(req.params.id);
  if (!h) return res.status(404).json({ errors: ['Habit not found'] });
  const date = (req.body && req.body.date) || req.query.date || today();
  if (!isDate(date)) return res.status(400).json({ errors: ['Invalid date (YYYY-MM-DD)'] });

  const existing = db.prepare('SELECT id FROM habit_logs WHERE habit_id = ? AND log_date = ?').get(h.id, date);
  let completed;
  let reward;
  if (existing) {
    db.prepare('DELETE FROM habit_logs WHERE id = ?').run(existing.id);
    saveSummary(date);
    completed = false;
    reward = { xpGained: 0, levelUp: false, newAchievements: [], levelInfo: game.levelInfo() };
  } else {
    db.prepare('INSERT INTO habit_logs (habit_id, log_date) VALUES (?, ?)').run(h.id, date);
    saveSummary(date);
    completed = true;
    reward = game.onHabitCompleted(h.id, date);
  }
  res.json({
    habit: { ...h, scheduled: isScheduledOn(h, date), completed },
    reward,
  });
});

// DELETE /api/habits/:id (archives habit while preserving historical logs/XP)
router.delete('/:id', (req, res) => {
  const h = getHabit(req.params.id);
  if (!h) return res.status(404).json({ errors: ['Habit not found'] });
  db.prepare('UPDATE habits SET active = 0 WHERE id = ?').run(h.id);
  saveSummary(today());
  res.json({ ok: true });
});

module.exports = router;

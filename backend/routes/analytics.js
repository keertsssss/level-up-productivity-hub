const express = require('express');
const db = require('../database');
const prod = require('../services/productivity');
const game = require('../services/gamification');
const router = express.Router();

const CATEGORIES = ['Learning', 'Career', 'Fitness', 'Personal', 'Projects', 'Other'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const STATUSES = ['completed', 'pending', 'cancelled'];

// Everything the dashboard summary cards need, calculated from real records.
router.get('/dashboard', (req, res) => {
  if (req.query.date && !prod.isDate(req.query.date)) {
    return res.status(400).json({ errors: ['Invalid date (YYYY-MM-DD)'] });
  }
  const date = req.query.date || prod.today();
  res.json({
    day: prod.getDayStats(date),
    weeklyAverage: prod.averageProductivity(7),
    monthlyAverage: prod.averageProductivity(30),
    level: game.levelInfo(),
    streak: game.streaks(),
  });
});

// Last 7 days ending at `date` (default today) for the weekly productivity chart.
router.get('/weekly', (req, res) => {
  if (req.query.date && !prod.isDate(req.query.date)) {
    return res.status(400).json({ errors: ['Invalid date (YYYY-MM-DD)'] });
  }
  const endDate = req.query.date || prod.today();
  const days = [];
  const cursor = new Date(endDate + 'T00:00:00');
  cursor.setDate(cursor.getDate() - 6);
  for (let i = 0; i < 7; i++) {
    days.push(prod.getDayStats(prod.fmt(cursor)));
    cursor.setDate(cursor.getDate() + 1);
  }
  res.json({
    endDate,
    days,
    weeklyAverage: prod.averageProductivity(7),
  });
});

// Task breakdown by status, category, and priority from real SQLite rows.
router.get('/breakdown', (req, res) => {
  const scope = req.query.scope === 'selected' ? 'selected' : 'all';
  if (req.query.date && !prod.isDate(req.query.date)) {
    return res.status(400).json({ errors: ['Invalid date (YYYY-MM-DD)'] });
  }
  const date = req.query.date || prod.today();
  const where = scope === 'selected' ? 'WHERE due_date = ?' : '';
  const args = scope === 'selected' ? [date] : [];

  const rows = db.prepare(`SELECT status, category, priority FROM tasks ${where}`).all(...args);

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, { total: 0, completed: 0, pending: 0, cancelled: 0 }]));
  const byPriority = Object.fromEntries(PRIORITIES.map((p) => [p, { total: 0, completed: 0, pending: 0, cancelled: 0 }]));

  for (const r of rows) {
    if (byStatus[r.status] !== undefined) byStatus[r.status]++;
    if (byCategory[r.category]) {
      byCategory[r.category].total++;
      byCategory[r.category][r.status]++;
    }
    if (byPriority[r.priority]) {
      byPriority[r.priority].total++;
      byPriority[r.priority][r.status]++;
    }
  }

  res.json({
    scope,
    date: scope === 'selected' ? date : null,
    total: rows.length,
    byStatus,
    byCategory,
    byPriority,
  });
});

// All badges (locked + unlocked) and level progression table.
router.get('/achievements', (req, res) => {
  res.json({
    achievements: game.getAchievements(),
    levels: game.LEVELS,
    level: game.levelInfo(),
  });
});

module.exports = router;

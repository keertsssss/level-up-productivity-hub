const express = require('express');
const db = require('../database');
const { saveSummary, fmt, isDate } = require('../services/productivity');
const game = require('../services/gamification');
const router = express.Router();

const CATS = ['Learning', 'Career', 'Fitness', 'Personal', 'Projects', 'Other'];
const PRIOS = ['Low', 'Medium', 'High'];
const getTask = (id) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

function attachSubtasks(tasks) {
  if (!tasks.length) return tasks;
  const byTask = new Map();
  for (const s of db.prepare('SELECT * FROM subtasks ORDER BY id ASC').all()) {
    if (!byTask.has(s.task_id)) byTask.set(s.task_id, []);
    byTask.get(s.task_id).push(s);
  }
  return tasks.map((t) => ({ ...t, subtasks: byTask.get(t.id) || [] }));
}

function getTaskWithSubtasks(id) {
  const t = getTask(id);
  if (!t) return null;
  const subtasks = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY id ASC').all(t.id);
  return { ...t, subtasks };
}

function validate(b) {
  const errors = [];
  if (typeof b.title !== 'string' || !b.title.trim()) errors.push('Title is required');
  if (typeof b.title === 'string' && b.title.length > 120) errors.push('Title must be 120 characters or less');
  if (b.description != null && typeof b.description !== 'string') errors.push('Description must be a string');
  if (!isDate(b.due_date)) errors.push('Due date is required (YYYY-MM-DD)');
  if (b.start_date && !isDate(b.start_date)) errors.push('Start date is invalid');
  if (b.start_date && isDate(b.due_date) && b.start_date > b.due_date) errors.push('Start date cannot be after due date');
  if (!CATS.includes(b.category)) errors.push('Invalid category');
  if (!PRIOS.includes(b.priority)) errors.push('Invalid priority');
  return errors;
}

// GET /api/tasks?date=&category=&priority=&status=&search=
router.get('/', (req, res) => {
  const { date, category, priority, status, search } = req.query;
  const where = [], args = [];
  if (date) { where.push('due_date = ?'); args.push(date); }
  if (category) { where.push('category = ?'); args.push(category); }
  if (priority) { where.push('priority = ?'); args.push(priority); }
  if (status) { where.push('status = ?'); args.push(status); }
  if (search) { where.push('(title LIKE ? OR description LIKE ?)'); args.push(`%${search}%`, `%${search}%`); }
  const sql = `SELECT * FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY due_date DESC, id DESC`;
  res.json(attachSubtasks(db.prepare(sql).all(...args)));
});

router.post('/', (req, res) => {
  const b = req.body || {}, errors = validate(b);
  let draftSubtasks = [];
  if (b.subtasks !== undefined) {
    if (!Array.isArray(b.subtasks)) {
      errors.push('Subtasks must be an array');
    } else {
      for (const s of b.subtasks) {
        if (typeof s !== 'string' || !s.trim()) {
          errors.push('Each subtask title is required');
          break;
        }
        if (s.trim().length > 120) {
          errors.push('Subtask title must be 120 characters or less');
          break;
        }
        draftSubtasks.push(s.trim());
      }
    }
  }
  if (errors.length) return res.status(400).json({ errors });

  const insertTaskAndSubtasks = db.transaction(() => {
    const r = db.prepare(`INSERT INTO tasks (title,description,category,priority,start_date,due_date)
      VALUES (?,?,?,?,?,?)`).run(b.title.trim(), b.description || '', b.category, b.priority, b.start_date || null, b.due_date);
    const insertSub = db.prepare('INSERT INTO subtasks (task_id, title) VALUES (?, ?)');
    for (const st of draftSubtasks) insertSub.run(r.lastInsertRowid, st);
    return r.lastInsertRowid;
  });

  const taskId = insertTaskAndSubtasks();
  saveSummary(b.due_date);
  res.status(201).json(getTaskWithSubtasks(taskId));
});

router.put('/:id', (req, res) => {
  const old = getTask(req.params.id);
  if (!old) return res.status(404).json({ errors: ['Task not found'] });
  const b = { ...old, ...(req.body || {}) }, errors = validate(b);
  if (errors.length) return res.status(400).json({ errors });
  db.prepare('UPDATE tasks SET title=?,description=?,category=?,priority=?,start_date=?,due_date=? WHERE id=?')
    .run(b.title.trim(), b.description || '', b.category, b.priority, b.start_date || null, b.due_date, old.id);
  saveSummary(old.due_date); saveSummary(b.due_date);
  res.json(getTaskWithSubtasks(old.id));
});

// Checkbox: flips pending <-> completed. XP is paid only once per task.
router.patch('/:id/toggle', (req, res) => {
  const t = getTask(req.params.id);
  if (!t) return res.status(404).json({ errors: ['Task not found'] });
  if (t.status === 'cancelled') return res.status(400).json({ errors: ['Cancelled tasks cannot be completed'] });
  const done = t.status !== 'completed';
  const now = new Date();
  db.prepare('UPDATE tasks SET status=?, completed_at=? WHERE id=?')
    .run(done ? 'completed' : 'pending', done ? `${fmt(now)} ${now.toTimeString().slice(0, 8)}` : null, t.id);
  saveSummary(t.due_date);
  const reward = done ? game.onTaskCompleted(t)
    : { xpGained: 0, levelUp: false, newAchievements: [], levelInfo: game.levelInfo() };
  res.json({ task: getTaskWithSubtasks(t.id), reward });
});

// Subtasks: add, toggle, delete
router.post('/:id/subtasks', (req, res) => {
  const t = getTask(req.params.id);
  if (!t) return res.status(404).json({ errors: ['Task not found'] });
  const b = req.body || {};
  if (typeof b.title !== 'string' || !b.title.trim()) {
    return res.status(400).json({ errors: ['Subtask title is required'] });
  }
  if (b.title.trim().length > 120) {
    return res.status(400).json({ errors: ['Subtask title must be 120 characters or less'] });
  }
  const r = db.prepare('INSERT INTO subtasks (task_id, title) VALUES (?, ?)').run(t.id, b.title.trim());
  const created = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(r.lastInsertRowid);
  res.status(201).json(created);
});

router.patch('/:id/subtasks/:subId/toggle', (req, res) => {
  const sub = db.prepare('SELECT * FROM subtasks WHERE id = ? AND task_id = ?').get(req.params.subId, req.params.id);
  if (!sub) return res.status(404).json({ errors: ['Subtask not found'] });
  const next = sub.completed ? 0 : 1;
  db.prepare('UPDATE subtasks SET completed = ? WHERE id = ?').run(next, sub.id);
  res.json({ subtask: db.prepare('SELECT * FROM subtasks WHERE id = ?').get(sub.id) });
});

router.delete('/:id/subtasks/:subId', (req, res) => {
  const sub = db.prepare('SELECT * FROM subtasks WHERE id = ? AND task_id = ?').get(req.params.subId, req.params.id);
  if (!sub) return res.status(404).json({ errors: ['Subtask not found'] });
  db.prepare('DELETE FROM subtasks WHERE id = ?').run(sub.id);
  res.json({ ok: true });
});

router.patch('/:id/cancel', (req, res) => {
  const t = getTask(req.params.id);
  if (!t) return res.status(404).json({ errors: ['Task not found'] });
  db.prepare("UPDATE tasks SET status='cancelled', completed_at=NULL WHERE id=?").run(t.id);
  saveSummary(t.due_date);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const t = getTask(req.params.id);
  if (!t) return res.status(404).json({ errors: ['Task not found'] });
  db.prepare('DELETE FROM tasks WHERE id = ?').run(t.id);   // XP already earned is kept
  saveSummary(t.due_date);
  res.json({ ok: true });
});

module.exports = router;

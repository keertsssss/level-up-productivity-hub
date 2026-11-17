(() => {
  'use strict';

  const BADGE_ICONS = {
    first_task: '⚔️',
    first_habit: '🌱',
    streak_3: '🔥',
    streak_7: '💎',
    tasks_10: '🏅',
    champion: '👑',
  };

  const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const STATUS_COLORS = {
    completed: { label: 'Completed', color: '#10b981' },
    pending: { label: 'Pending', color: '#f59e0b' },
    cancelled: { label: 'Cancelled', color: '#ef4444' },
  };

  const CATEGORY_COLORS = {
    Learning: '#6366f1',
    Career: '#22d3ee',
    Fitness: '#10b981',
    Personal: '#f59e0b',
    Projects: '#ec4899',
    Other: '#94a3b8',
  };

  const PRIORITY_COLORS = {
    High: '#ef4444',
    Medium: '#f59e0b',
    Low: '#10b981',
  };

  const pad2 = (n) => String(n).padStart(2, '0');
  const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };

  const state = {
    selectedDate: localToday(),
    editingTaskId: null,
    weeklyMode: 'bars',
    analyticsScope: 'all',
    pieDim: 'category',
    draftSubtasks: [],
    openSubtaskTaskId: null,
  };

  const el = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = Array.isArray(data.errors) && data.errors.length
        ? data.errors.join(', ')
        : `Request failed (${res.status})`;
      const err = new Error(msg);
      err.errors = data.errors || [msg];
      throw err;
    }
    return data;
  }

  function showErrorBanner(message) {
    el('errorBannerText').textContent = message;
    el('errorBanner').classList.remove('hidden');
  }

  function hideErrorBanner() {
    el('errorBanner').classList.add('hidden');
  }

  function showToast(message, variant = 'xp') {
    const toast = document.createElement('div');
    toast.className = `toast ${variant === 'gold' ? 'toast-gold' : ''}`;
    toast.textContent = message;
    el('toastStack').appendChild(toast);
    setTimeout(() => toast.remove(), 3800);
  }

  function celebrateReward(reward) {
    if (!reward) return;
    if (reward.xpGained > 0) {
      showToast(`+${reward.xpGained} XP earned!`);
    }
    if (reward.levelUp && reward.levelInfo) {
      showToast(`Level Up! Level ${reward.levelInfo.level}: ${reward.levelInfo.name}`, 'gold');
    }
    if (Array.isArray(reward.newAchievements)) {
      reward.newAchievements.forEach((title) => {
        showToast(`Badge Unlocked: ${title}`, 'gold');
      });
    }
  }

  /* Theme */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('levelup-theme', theme);
    const isLight = theme === 'light';
    el('themeIcon').textContent = isLight ? '🌙' : '☀️';
    el('themeLabel').textContent = isLight ? 'Dark' : 'Light';
  }

  function initTheme() {
    const saved = localStorage.getItem('levelup-theme');
    if (saved === 'light' || saved === 'dark') {
      applyTheme(saved);
    } else {
      const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      applyTheme(prefersLight ? 'light' : 'dark');
    }
  }

  /* Renderers */
  function renderDashboard(data) {
    const { day, weeklyAverage, monthlyAverage, level, streak } = data;

    el('levelNumber').textContent = `LVL ${level.level}`;
    el('levelName').textContent = level.name;
    el('xpTotal').textContent = `${level.xp} XP`;
    el('xpNext').textContent = level.nextLevelXp !== null
      ? `${level.xpToNext} XP to next level (${level.nextLevelXp} XP)`
      : 'Max Level Reached!';
    el('xpProgressBar').style.width = `${level.progress}%`;
    el('xpProgressBarWrap').setAttribute('aria-valuenow', String(level.progress));

    el('currentStreak').textContent = `${streak.current} day${streak.current === 1 ? '' : 's'}`;
    el('longestStreak').textContent = `${streak.longest} day${streak.longest === 1 ? '' : 's'}`;
    el('weeklyAvgChip').textContent = `${weeklyAverage}%`;
    el('monthlyAvgChip').textContent = `${monthlyAverage}%`;

    el('kpiProductivity').textContent = `${day.productivity}%`;
    el('kpiProductivityBar').style.width = `${day.productivity}%`;
    el('kpiProductivityFoot').textContent = `Date: ${day.date}`;
    el('kpiTotalTasks').textContent = String(day.tasksAssigned);
    el('kpiCompletedTasks').textContent = String(day.tasksCompleted);
    el('kpiPendingTasks').textContent = String(day.tasksPending);
    el('kpiHabitRate').textContent = `${day.habitRate}%`;
    el('kpiHabitCount').textContent = `${day.habitsCompleted} / ${day.habitsScheduled} scheduled`;
  }

  function renderTasks(tasks) {
    const container = el('taskList');
    if (!tasks.length) {
      container.innerHTML = '<div class="empty-state">No tasks match the current view. Click <strong>+ New Task</strong> to create one.</div>';
      return;
    }

    container.innerHTML = tasks.map((t) => {
      const done = t.status === 'completed';
      const cancelled = t.status === 'cancelled';
      const xp = t.priority === 'High' ? 15 : 10;
      const dateRange = t.start_date ? `${t.start_date} → ${t.due_date}` : t.due_date;
      const subtasks = Array.isArray(t.subtasks) ? t.subtasks : [];
      const subDone = subtasks.filter((s) => s.completed).length;
      const subPct = subtasks.length ? Math.round((subDone / subtasks.length) * 100) : 0;
      const showSubInput = state.openSubtaskTaskId === t.id;

      const subtasksHtml = (subtasks.length || showSubInput) ? `
        <div class="subtasks-box">
          ${subtasks.length ? `
            <div class="subtask-progress-bar" title="${subDone}/${subtasks.length} subtasks done (${subPct}%)">
              <div class="subtask-progress-fill" style="width:${subPct}%"></div>
            </div>
            ${subtasks.map((s) => `
              <div class="subtask-row ${s.completed ? 'is-done' : ''}">
                <div class="subtask-left">
                  <button
                    type="button"
                    class="subtask-check ${s.completed ? 'checked' : ''}"
                    data-action="toggle-subtask"
                    data-task-id="${t.id}"
                    data-sub-id="${s.id}"
                    ${cancelled ? 'disabled' : ''}
                    aria-label="${s.completed ? 'Uncheck subtask' : 'Complete subtask'}">
                    ${s.completed ? '✓' : ''}
                  </button>
                  <span class="subtask-title">${escapeHtml(s.title)}</span>
                </div>
                <button
                  type="button"
                  class="btn-icon-only btn-danger-ghost"
                  data-action="delete-subtask"
                  data-task-id="${t.id}"
                  data-sub-id="${s.id}"
                  title="Delete subtask"
                  aria-label="Delete subtask">✕</button>
              </div>
            `).join('')}
          ` : ''}
          ${showSubInput ? `
            <form class="subtask-inline-form" data-subtask-form="${t.id}">
              <input type="text" class="input subtask-inline-input" maxlength="120" placeholder="New subtask title..." required />
              <button type="submit" class="btn btn-primary btn-sm">Add</button>
            </form>
          ` : ''}
        </div>
      ` : '';

      return `
        <div class="task-item ${done ? 'is-completed' : ''} ${cancelled ? 'is-cancelled' : ''}" data-task-id="${t.id}">
          <div class="item-left">
            <button
              type="button"
              class="check-btn ${done ? 'checked' : ''}"
              data-action="toggle-task"
              data-id="${t.id}"
              ${cancelled ? 'disabled' : ''}
              aria-label="${done ? 'Mark pending' : 'Complete task'}">
              ${done ? '✓' : ''}
            </button>
            <div class="item-body">
              <div class="task-title">${escapeHtml(t.title)}</div>
              ${t.description ? `<div class="task-desc">${escapeHtml(t.description)}</div>` : ''}
              <div class="tags-row">
                <span class="tag">${escapeHtml(t.category)}</span>
                <span class="tag tag-prio-${escapeHtml(t.priority)}">${escapeHtml(t.priority)}</span>
                <span class="tag">📅 ${escapeHtml(dateRange)}</span>
                <span class="tag tag-xp">+${xp} XP</span>
                ${subtasks.length ? `<span class="tag">☑️ ${subDone}/${subtasks.length} steps</span>` : ''}
                ${cancelled ? '<span class="tag tag-cancelled">Cancelled</span>' : ''}
              </div>
              ${subtasksHtml}
            </div>
          </div>
          <div class="item-actions">
            ${!cancelled ? `<button type="button" class="btn-icon-only" data-action="toggle-subtask-input" data-id="${t.id}" title="Add subtask" aria-label="Add subtask">➕</button>` : ''}
            <button type="button" class="btn-icon-only" data-action="edit-task" data-id="${t.id}" title="Edit task" aria-label="Edit task">✏️</button>
            ${!cancelled ? `<button type="button" class="btn-icon-only" data-action="cancel-task" data-id="${t.id}" title="Cancel task" aria-label="Cancel task">🚫</button>` : ''}
            <button type="button" class="btn-icon-only btn-danger-ghost" data-action="delete-task" data-id="${t.id}" title="Delete task" aria-label="Delete task">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function formatHabitSchedule(habit) {
    if (habit.frequency === 'daily') return 'Daily';
    const names = (habit.weekdays || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '' && WEEKDAY_NAMES[Number(s)])
      .map((s) => WEEKDAY_NAMES[Number(s)]);
    return names.length ? names.join(', ') : 'Weekdays';
  }

  function renderHabits(habits) {
    const container = el('habitList');
    if (!habits.length) {
      container.innerHTML = '<div class="empty-state">No active habits yet. Click <strong>+ Add Habit</strong> to build a daily routine.</div>';
      return;
    }

    container.innerHTML = habits.map((h) => `
      <div class="habit-item ${h.completed ? 'is-completed' : ''}">
        <div class="item-left">
          <button
            type="button"
            class="check-btn ${h.completed ? 'checked' : ''}"
            data-action="toggle-habit"
            data-id="${h.id}"
            aria-label="${h.completed ? 'Uncheck habit' : 'Complete habit'}">
            ${h.completed ? '✓' : ''}
          </button>
          <div class="item-body">
            <div class="habit-name">${escapeHtml(h.name)}</div>
            <div class="tags-row">
              <span class="tag">${escapeHtml(formatHabitSchedule(h))}</span>
              ${!h.scheduled ? '<span class="tag">Off-schedule</span>' : '<span class="tag tag-xp">+5 XP</span>'}
            </div>
          </div>
        </div>
        <div class="item-actions">
          <button type="button" class="btn-icon-only btn-danger-ghost" data-action="delete-habit" data-id="${h.id}" title="Remove habit" aria-label="Remove habit">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  function renderWeeklyChart(weekly) {
    el('chartRangeEnd').textContent = weekly.endDate;
    const container = el('weeklyChart');

    if (state.weeklyMode === 'line') {
      const w = 420;
      const h = 190;
      const padL = 32;
      const padR = 16;
      const padT = 18;
      const padB = 34;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;
      const stepX = plotW / Math.max(weekly.days.length - 1, 1);

      const pt = (idx, pctVal) => {
        const x = +(padL + idx * stepX).toFixed(1);
        const y = +(padT + plotH - (pctVal / 100) * plotH).toFixed(1);
        return { x, y };
      };

      const taskPts = weekly.days.map((d, i) => pt(i, d.productivity));
      const habitPts = weekly.days.map((d, i) => pt(i, d.habitRate));
      const toPoly = (pts) => pts.map((p) => `${p.x},${p.y}`).join(' ');
      const taskArea = `${padL},${padT + plotH} ${toPoly(taskPts)} ${taskPts[taskPts.length - 1].x},${padT + plotH}`;

      const gridLines = [0, 50, 100].map((v) => {
        const y = +(padT + plotH - (v / 100) * plotH).toFixed(1);
        return `<line class="trend-grid-line" x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" />
          <text class="trend-axis-label" x="2" y="${y + 3}">${v}%</text>`;
      }).join('');

      const xLabels = weekly.days.map((d, i) => {
        const dt = new Date(d.date + 'T00:00:00');
        const x = pt(i, 0).x;
        const fill = d.date === state.selectedDate ? '#22d3ee' : 'var(--text-muted)';
        return `<text class="trend-axis-label" x="${x}" y="${h - 14}" text-anchor="middle" style="fill:${fill}">${WEEKDAY_NAMES[dt.getDay()]}</text>
          <text class="trend-axis-label" x="${x}" y="${h - 3}" text-anchor="middle">${d.date.slice(5)}</text>`;
      }).join('');

      const taskDots = weekly.days.map((d, i) => {
        const p = taskPts[i];
        const tip = `${d.date}: Tasks ${d.tasksCompleted}/${d.tasksAssigned} (${d.productivity}%)`;
        return `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#6366f1" stroke="#fff" stroke-width="1.5"><title>${escapeHtml(tip)}</title></circle>`;
      }).join('');

      const habitDots = weekly.days.map((d, i) => {
        const p = habitPts[i];
        const tip = `${d.date}: Habits ${d.habitsCompleted}/${d.habitsScheduled} (${d.habitRate}%)`;
        return `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#22d3ee" stroke="#fff" stroke-width="1.2"><title>${escapeHtml(tip)}</title></circle>`;
      }).join('');

      container.innerHTML = `
        <div class="weekly-trend-wrap">
          <svg class="trend-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="7-day productivity trend line graph">
            <defs>
              <linearGradient id="taskAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#6366f1" stop-opacity="0.32" />
                <stop offset="100%" stop-color="#6366f1" stop-opacity="0.02" />
              </linearGradient>
            </defs>
            ${gridLines}
            <polygon points="${taskArea}" fill="url(#taskAreaGrad)" />
            <polyline fill="none" stroke="#22d3ee" stroke-width="2" stroke-dasharray="4 3" points="${toPoly(habitPts)}" />
            <polyline fill="none" stroke="#6366f1" stroke-width="2.5" points="${toPoly(taskPts)}" />
            ${habitDots}
            ${taskDots}
            ${xLabels}
          </svg>
        </div>
      `;
      return;
    }

    container.innerHTML = weekly.days.map((d) => {
      const dt = new Date(d.date + 'T00:00:00');
      const dayLabel = WEEKDAY_NAMES[dt.getDay()];
      const shortDate = d.date.slice(5);
      const isSelected = d.date === state.selectedDate;
      const tip = `${d.date}: Tasks ${d.tasksCompleted}/${d.tasksAssigned} (${d.productivity}%), Habits ${d.habitsCompleted}/${d.habitsScheduled} (${d.habitRate}%)`;

      return `
        <div class="chart-col ${isSelected ? 'is-selected' : ''}" title="${escapeHtml(tip)}">
          <div class="chart-pct">${d.productivity}%</div>
          <div class="chart-bars">
            <div class="bar-wrap">
              <div class="bar bar-task" style="height: ${Math.max(d.productivity, 2)}%"></div>
            </div>
            <div class="bar-wrap">
              <div class="bar bar-habit" style="height: ${Math.max(d.habitRate, 2)}%"></div>
            </div>
          </div>
          <div class="chart-day">${dayLabel}</div>
          <div class="chart-sub">${shortDate}</div>
        </div>
      `;
    }).join('');
  }

  function renderPieChart(container, slices, centerVal, centerLabel) {
    const total = slices.reduce((sum, s) => sum + s.value, 0);
    const r = 52;
    const cx = 72;
    const cy = 72;
    const circumference = 2 * Math.PI * r;

    let arcsSvg = '';
    if (total === 0) {
      arcsSvg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="20" stroke-dasharray="5 5" />`;
    } else {
      let offset = 0;
      arcsSvg = slices
        .filter((s) => s.value > 0)
        .map((s) => {
          const arc = (s.value / total) * circumference;
          const pct = Math.round((s.value / total) * 1000) / 10;
          const dashOffset = -offset;
          offset += arc;
          return `<circle class="pie-slice" cx="${cx}" cy="${cy}" r="${r}" fill="none"
            stroke="${s.color}" stroke-width="20"
            stroke-dasharray="${arc.toFixed(2)} ${(circumference - arc).toFixed(2)}"
            stroke-dashoffset="${dashOffset.toFixed(2)}">
            <title>${escapeHtml(s.label)}: ${s.value} (${pct}%)</title>
          </circle>`;
        })
        .join('');
    }

    const legendHtml = slices.map((s) => {
      const pct = total === 0 ? 0 : Math.round((s.value / total) * 100);
      return `
        <div class="pie-legend-row">
          <div class="pie-legend-left">
            <span class="pie-swatch" style="background:${s.color}"></span>
            <span class="pie-legend-name">${escapeHtml(s.label)}</span>
          </div>
          <span class="pie-legend-val">${s.value} (${pct}%)</span>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="pie-svg-wrap">
        <svg class="pie-svg" viewBox="0 0 144 144" role="img" aria-label="${escapeHtml(centerLabel)}">
          ${arcsSvg}
        </svg>
        <div class="pie-center">
          <div class="pie-center-value">${escapeHtml(centerVal)}</div>
          <div class="pie-center-label">${escapeHtml(centerLabel)}</div>
        </div>
      </div>
      <div class="pie-legend">${legendHtml}</div>
    `;
  }

  function renderTaskAnalytics(breakdown) {
    const scopeText = breakdown.scope === 'selected'
      ? `Tasks due on ${breakdown.date}`
      : 'All tasks across your workspace';
    el('analyticsSubtitle').textContent = `${scopeText} (${breakdown.total} total)`;

    const statusSlices = Object.entries(STATUS_COLORS).map(([key, meta]) => ({
      label: meta.label,
      value: breakdown.byStatus[key] || 0,
      color: meta.color,
    }));
    const activeTotal = (breakdown.byStatus.completed || 0) + (breakdown.byStatus.pending || 0);
    const doneRate = activeTotal === 0 ? 0 : Math.round((breakdown.byStatus.completed / activeTotal) * 100);
    renderPieChart(el('statusPieChart'), statusSlices, `${doneRate}%`, `${breakdown.total} tasks`);

    const isCat = state.pieDim === 'category';
    el('dimensionPieTitle').textContent = isCat ? 'Tasks by Category Pie Chart' : 'Tasks by Priority Pie Chart';
    el('completionGraphTitle').textContent = isCat ? 'Completion Graph by Category' : 'Completion Graph by Priority';

    const sourceMap = isCat ? breakdown.byCategory : breakdown.byPriority;
    const palette = isCat ? CATEGORY_COLORS : PRIORITY_COLORS;
    const dimSlices = Object.entries(sourceMap).map(([name, counts]) => ({
      label: name,
      value: counts.total,
      color: palette[name] || '#94a3b8',
      counts,
    }));
    renderPieChart(el('dimensionPieChart'), dimSlices, String(breakdown.total), isCat ? 'Categories' : 'Priorities');

    const maxGroup = Math.max(1, ...dimSlices.map((s) => s.value));
    const graphContainer = el('completionGraph');
    if (breakdown.total === 0) {
      graphContainer.innerHTML = '<div class="empty-state">Create tasks to populate the completion breakdown graph.</div>';
      return;
    }

    graphContainer.innerHTML = dimSlices.map((s) => {
      const c = s.counts;
      const donePct = (c.completed / maxGroup) * 100;
      const pendPct = (c.pending / maxGroup) * 100;
      const cancPct = (c.cancelled / maxGroup) * 100;
      const rate = c.total === 0 ? 0 : Math.round((c.completed / c.total) * 100);
      return `
        <div class="hbar-row" title="${escapeHtml(s.label)}: ${c.completed} completed, ${c.pending} pending, ${c.cancelled} cancelled">
          <div class="hbar-meta">
            <span class="hbar-label">${escapeHtml(s.label)}</span>
            <span class="hbar-count">${c.completed}/${c.total} done (${rate}%)</span>
          </div>
          <div class="hbar-track">
            <div class="hbar-seg-done" style="width:${donePct.toFixed(1)}%"></div>
            <div class="hbar-seg-pending" style="width:${pendPct.toFixed(1)}%"></div>
            <div class="hbar-seg-cancelled" style="width:${cancPct.toFixed(1)}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderAchievements(payload) {
    const { achievements, levels, level } = payload;
    const unlockedCount = achievements.filter((a) => a.unlocked).length;
    el('achievementCounter').textContent = `${unlockedCount} / ${achievements.length} Unlocked`;

    el('achievementsGrid').innerHTML = achievements.map((a) => `
      <div class="badge-card ${a.unlocked ? 'unlocked' : 'locked'}">
        <div class="badge-icon" aria-hidden="true">${BADGE_ICONS[a.code] || '🏆'}</div>
        <div>
          <div class="badge-title">${escapeHtml(a.title)}</div>
          <div class="badge-desc">${escapeHtml(a.description || '')}</div>
          <div class="badge-date">${a.unlocked ? `Unlocked ${escapeHtml(a.unlocked_at)}` : 'Locked'}</div>
        </div>
      </div>
    `).join('');

    el('levelsStrip').innerHTML = levels.map((tier) => {
      const isActive = tier.level === level.level;
      const isReached = level.xp >= tier.xp;
      return `
        <div class="level-tier ${isActive ? 'active' : ''} ${isReached ? 'reached' : ''}">
          <div class="level-tier-top">
            <span>LVL ${tier.level}</span>
            <span>${tier.xp} XP</span>
          </div>
          <div class="level-tier-xp">${escapeHtml(tier.name)}</div>
        </div>
      `;
    }).join('');
  }

  /* Data Loading */
  let cachedTasks = [];
  let cachedWeekly = null;
  let cachedBreakdown = null;

  function buildTasksQuery() {
    const params = new URLSearchParams();
    if (el('taskScope').value === 'selected') params.set('date', state.selectedDate);
    const cat = el('taskCategoryFilter').value;
    const prio = el('taskPriorityFilter').value;
    const status = el('taskStatusFilter').value;
    const search = el('taskSearch').value.trim();
    if (cat) params.set('category', cat);
    if (prio) params.set('priority', prio);
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    const qs = params.toString();
    return `/api/tasks${qs ? `?${qs}` : ''}`;
  }

  async function refreshTasksOnly() {
    try {
      cachedTasks = await api(buildTasksQuery());
      renderTasks(cachedTasks);
    } catch (err) {
      showErrorBanner(err.message);
    }
  }

  async function refreshBreakdownOnly() {
    try {
      const dateParam = encodeURIComponent(state.selectedDate);
      cachedBreakdown = await api(`/api/analytics/breakdown?scope=${state.analyticsScope}&date=${dateParam}`);
      renderTaskAnalytics(cachedBreakdown);
    } catch (err) {
      showErrorBanner(err.message);
    }
  }

  async function refreshAll() {
    hideErrorBanner();
    const dateParam = encodeURIComponent(state.selectedDate);
    try {
      const [dashboard, tasks, habits, weekly, breakdown, achievements] = await Promise.all([
        api(`/api/analytics/dashboard?date=${dateParam}`),
        api(buildTasksQuery()),
        api(`/api/habits?date=${dateParam}`),
        api(`/api/analytics/weekly?date=${dateParam}`),
        api(`/api/analytics/breakdown?scope=${state.analyticsScope}&date=${dateParam}`),
        api('/api/analytics/achievements'),
      ]);
      cachedTasks = tasks;
      cachedWeekly = weekly;
      cachedBreakdown = breakdown;
      renderDashboard(dashboard);
      renderTasks(tasks);
      renderHabits(habits);
      renderWeeklyChart(weekly);
      renderTaskAnalytics(breakdown);
      renderAchievements(achievements);
    } catch (err) {
      showErrorBanner(`Could not load dashboard data: ${err.message}`);
    }
  }

  /* Task Modal */
  function renderDraftSubtasks() {
    const list = el('modalSubtasksList');
    list.innerHTML = state.draftSubtasks.map((title, idx) => `
      <div class="modal-subtask-chip">
        <span>• ${escapeHtml(title)}</span>
        <button type="button" class="btn-icon-only btn-danger-ghost" data-remove-draft="${idx}" aria-label="Remove subtask">✕</button>
      </div>
    `).join('');
  }

  function addDraftSubtask() {
    const input = el('modalSubtaskInput');
    const val = input.value.trim();
    if (!val) return;
    if (val.length > 120) {
      el('taskFormErrors').textContent = 'Subtask title must be 120 characters or less';
      el('taskFormErrors').classList.remove('hidden');
      return;
    }
    state.draftSubtasks.push(val);
    input.value = '';
    renderDraftSubtasks();
    input.focus();
  }

  function openTaskModal(task = null) {
    state.editingTaskId = task ? task.id : null;
    state.draftSubtasks = [];
    el('taskModalTitle').textContent = task ? 'Edit Task' : 'New Task';
    el('saveTaskBtn').textContent = task ? 'Save Changes' : 'Create Task';
    el('taskIdField').value = task ? String(task.id) : '';
    el('taskTitleField').value = task ? task.title : '';
    el('taskDescField').value = task ? (task.description || '') : '';
    el('taskCategoryField').value = task ? task.category : 'Learning';
    el('taskPriorityField').value = task ? task.priority : 'Medium';
    el('taskStartDateField').value = task ? (task.start_date || '') : '';
    el('taskDueDateField').value = task ? task.due_date : state.selectedDate;
    el('modalSubtaskInput').value = '';
    el('modalSubtasksSection').classList.toggle('hidden', Boolean(task));
    renderDraftSubtasks();
    el('taskFormErrors').classList.add('hidden');
    el('taskModal').classList.remove('hidden');
    el('taskTitleField').focus();
  }

  function closeTaskModal() {
    el('taskModal').classList.add('hidden');
    state.editingTaskId = null;
    state.draftSubtasks = [];
  }

  async function submitTaskForm(e) {
    e.preventDefault();
    const errBox = el('taskFormErrors');
    errBox.classList.add('hidden');

    const payload = {
      title: el('taskTitleField').value,
      description: el('taskDescField').value,
      category: el('taskCategoryField').value,
      priority: el('taskPriorityField').value,
      start_date: el('taskStartDateField').value || null,
      due_date: el('taskDueDateField').value,
    };

    try {
      if (state.editingTaskId) {
        await api(`/api/tasks/${state.editingTaskId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Task updated');
      } else {
        if (state.draftSubtasks.length) payload.subtasks = state.draftSubtasks;
        await api('/api/tasks', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Task created');
      }
      closeTaskModal();
      await refreshAll();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  }

  /* Event Bindings */
  function bindEvents() {
    el('themeToggle').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      applyTheme(current === 'light' ? 'dark' : 'light');
    });

    el('datePicker').addEventListener('change', (e) => {
      if (e.target.value) {
        state.selectedDate = e.target.value;
        refreshAll();
      }
    });

    el('todayBtn').addEventListener('click', () => {
      state.selectedDate = localToday();
      el('datePicker').value = state.selectedDate;
      refreshAll();
    });

    el('refreshBtn').addEventListener('click', refreshAll);
    el('dismissErrorBtn').addEventListener('click', hideErrorBanner);

    /* Chart & Analytics Switchers */
    document.querySelectorAll('[data-weekly-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.weeklyMode = btn.dataset.weeklyMode;
        document.querySelectorAll('[data-weekly-mode]').forEach((b) => b.classList.toggle('active', b === btn));
        if (cachedWeekly) renderWeeklyChart(cachedWeekly);
      });
    });

    document.querySelectorAll('[data-analytics-scope]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.analyticsScope = btn.dataset.analyticsScope;
        document.querySelectorAll('[data-analytics-scope]').forEach((b) => b.classList.toggle('active', b === btn));
        refreshBreakdownOnly();
      });
    });

    document.querySelectorAll('[data-pie-dim]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.pieDim = btn.dataset.pieDim;
        document.querySelectorAll('[data-pie-dim]').forEach((b) => b.classList.toggle('active', b === btn));
        if (cachedBreakdown) renderTaskAnalytics(cachedBreakdown);
      });
    });

    /* Task filters */
    let searchTimer = null;
    el('taskSearch').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(refreshTasksOnly, 180);
    });
    ['taskScope', 'taskCategoryFilter', 'taskPriorityFilter', 'taskStatusFilter'].forEach((id) => {
      el(id).addEventListener('change', refreshTasksOnly);
    });

    /* Task Modal */
    el('openTaskModalBtn').addEventListener('click', () => openTaskModal());
    el('closeTaskModalBtn').addEventListener('click', closeTaskModal);
    el('cancelTaskModalBtn').addEventListener('click', closeTaskModal);
    el('taskModal').addEventListener('click', (e) => {
      if (e.target === el('taskModal')) closeTaskModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !el('taskModal').classList.contains('hidden')) closeTaskModal();
    });
    el('taskForm').addEventListener('submit', submitTaskForm);
    el('addModalSubtaskBtn').addEventListener('click', addDraftSubtask);
    el('modalSubtaskInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addDraftSubtask();
      }
    });
    el('modalSubtasksList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-draft]');
      if (!btn) return;
      state.draftSubtasks.splice(Number(btn.dataset.removeDraft), 1);
      renderDraftSubtasks();
    });

    /* Task List Actions */
    el('taskList').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const action = btn.dataset.action;

      try {
        if (action === 'toggle-task') {
          const res = await api(`/api/tasks/${id}/toggle`, { method: 'PATCH' });
          celebrateReward(res.reward);
          await refreshAll();
        } else if (action === 'toggle-subtask-input') {
          state.openSubtaskTaskId = state.openSubtaskTaskId === id ? null : id;
          renderTasks(cachedTasks);
          if (state.openSubtaskTaskId === id) {
            const inp = el('taskList').querySelector(`[data-subtask-form="${id}"] input`);
            if (inp) inp.focus();
          }
        } else if (action === 'toggle-subtask') {
          const taskId = Number(btn.dataset.taskId);
          const subId = Number(btn.dataset.subId);
          await api(`/api/tasks/${taskId}/subtasks/${subId}/toggle`, { method: 'PATCH' });
          await refreshTasksOnly();
        } else if (action === 'delete-subtask') {
          const taskId = Number(btn.dataset.taskId);
          const subId = Number(btn.dataset.subId);
          await api(`/api/tasks/${taskId}/subtasks/${subId}`, { method: 'DELETE' });
          showToast('Subtask deleted');
          await refreshTasksOnly();
        } else if (action === 'edit-task') {
          const task = cachedTasks.find((t) => t.id === id);
          if (task) openTaskModal(task);
        } else if (action === 'cancel-task') {
          await api(`/api/tasks/${id}/cancel`, { method: 'PATCH' });
          showToast('Task cancelled');
          await refreshAll();
        } else if (action === 'delete-task') {
          await api(`/api/tasks/${id}`, { method: 'DELETE' });
          if (state.openSubtaskTaskId === id) state.openSubtaskTaskId = null;
          showToast('Task deleted');
          await refreshAll();
        }
      } catch (err) {
        showErrorBanner(err.message);
      }
    });

    el('taskList').addEventListener('submit', async (e) => {
      const form = e.target.closest('[data-subtask-form]');
      if (!form) return;
      e.preventDefault();
      const taskId = Number(form.dataset.subtaskForm);
      const input = form.querySelector('input');
      try {
        await api(`/api/tasks/${taskId}/subtasks`, {
          method: 'POST',
          body: JSON.stringify({ title: input.value }),
        });
        showToast('Subtask added');
        await refreshTasksOnly();
        const nextInput = el('taskList').querySelector(`[data-subtask-form="${taskId}"] input`);
        if (nextInput) nextInput.focus();
      } catch (err) {
        showErrorBanner(err.message);
      }
    });

    /* Habit Form & Actions */
    el('toggleHabitFormBtn').addEventListener('click', () => {
      el('habitForm').classList.toggle('hidden');
      el('habitFormErrors').classList.add('hidden');
      if (!el('habitForm').classList.contains('hidden')) {
        el('habitNameInput').focus();
      }
    });

    el('cancelHabitFormBtn').addEventListener('click', () => {
      el('habitForm').classList.add('hidden');
      el('habitForm').reset();
      el('weekdayPicker').classList.add('hidden');
    });

    el('habitFreqSelect').addEventListener('change', (e) => {
      el('weekdayPicker').classList.toggle('hidden', e.target.value !== 'weekdays');
    });

    el('habitForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = el('habitFormErrors');
      errBox.classList.add('hidden');

      const frequency = el('habitFreqSelect').value;
      const weekdays = [...el('weekdayPicker').querySelectorAll('input:checked')].map((i) => i.value);
      try {
        await api('/api/habits', {
          method: 'POST',
          body: JSON.stringify({
            name: el('habitNameInput').value,
            frequency,
            weekdays,
          }),
        });
        el('habitForm').reset();
        el('habitForm').classList.add('hidden');
        el('weekdayPicker').classList.add('hidden');
        showToast('Habit added');
        await refreshAll();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('hidden');
      }
    });

    el('habitList').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const action = btn.dataset.action;

      try {
        if (action === 'toggle-habit') {
          const res = await api(`/api/habits/${id}/toggle`, {
            method: 'PATCH',
            body: JSON.stringify({ date: state.selectedDate }),
          });
          celebrateReward(res.reward);
          await refreshAll();
        } else if (action === 'delete-habit') {
          await api(`/api/habits/${id}`, { method: 'DELETE' });
          showToast('Habit removed');
          await refreshAll();
        }
      } catch (err) {
        showErrorBanner(err.message);
      }
    });
  }

  /* Init */
  initTheme();
  el('datePicker').value = state.selectedDate;
  bindEvents();
  refreshAll();
})();

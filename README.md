# Level Up – Productivity Hub ⚡

A modern, gamified personal productivity tracker built with Node.js, Express, better-sqlite3, and vanilla modern frontend (HTML5/CSS3/JavaScript).

## Features

- **🎮 Gamified Progression**: Earn XP for completing tasks and habits. Level up from Beginner to Productivity Master with streaks, badges, and milestones.
- **📋 Task & Subtask Management**: Full CRUD for tasks with priority levels, categories, date filtering, and nested checklist subtasks.
- **🔁 Habit Tracking**: Track daily habits or schedule specific weekdays (e.g. Mon, Wed, Fri) with streak counters and daily completion bonuses.
- **📊 Interactive Charts & Analytics**:
  - Live SVG Donut/Pie Charts for task distribution by Status, Category, and Priority.
  - Horizontal Completion Breakdown graphs.
  - 7-Day Weekly Productivity Bar & Trend Line Graphs.
- **🌓 Dark & Light Mode**: Seamless theme switching with local storage persistence and system preference detection.
- **💾 SQLite Backend**: Zero-config persistent storage with WAL mode and foreign key constraints.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (v18+)

### Installation & Run

1. Clone or download this repository.
2. Open a terminal in the project directory:
   ```bash
   npm install
   ```
3. Start the application:
   ```bash
   npm start
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Structure

```text
├── backend/
│   ├── database.js          # SQLite connection, pragmas, and table schemas
│   ├── server.js            # Express server and static asset routing
│   ├── routes/
│   │   ├── tasks.js         # /api/tasks and /api/tasks/:id/subtasks
│   │   ├── habits.js        # /api/habits and habit toggles
│   │   └── analytics.js     # /api/analytics/dashboard, /weekly, /breakdown, /achievements
│   └── services/
│       ├── productivity.js  # Productivity statistics and date helpers
│       └── gamification.js  # XP calculation, levels, streaks, and badge logic
├── frontend/
│   ├── index.html           # Dashboard UI layout
│   ├── style.css            # Responsive dark/light theme styling
│   └── app.js               # Client-side API integration, charts, and event handlers
├── database/                # SQLite storage (created on first run)
├── package.json
└── README.md
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tasks` | Get tasks with optional filters (`date`, `category`, `priority`, `status`, `search`) |
| `POST` | `/api/tasks` | Create a new task (with optional `subtasks` array) |
| `PUT` | `/api/tasks/:id` | Update an existing task |
| `PATCH` | `/api/tasks/:id/toggle` | Toggle task completion & award XP |
| `PATCH` | `/api/tasks/:id/cancel` | Cancel a task |
| `DELETE` | `/api/tasks/:id` | Delete a task |
| `POST` | `/api/tasks/:id/subtasks` | Add a subtask to a task |
| `PATCH` | `/api/tasks/:id/subtasks/:subId/toggle` | Toggle subtask completion |
| `DELETE` | `/api/tasks/:id/subtasks/:subId` | Delete a subtask |
| `GET` | `/api/habits` | Get habits for a date with scheduled & completed flags |
| `POST` | `/api/habits` | Create a new habit (`daily` or `weekdays`) |
| `PATCH` | `/api/habits/:id/toggle` | Toggle habit completion & award XP |
| `DELETE` | `/api/habits/:id` | Archive a habit |
| `GET` | `/api/analytics/dashboard` | Daily KPI stats, streaks, and XP level info |
| `GET` | `/api/analytics/weekly` | 7-day productivity & habit rate breakdown |
| `GET` | `/api/analytics/breakdown` | Task breakdown by status, category, and priority |
| `GET` | `/api/analytics/achievements` | Badges and level milestones |

---

## License

MIT

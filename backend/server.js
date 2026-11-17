const express = require('express');
const path = require('path');
require('./database');                       // creates tables on start

const frontendDir = path.join(__dirname, '..', 'frontend');

const app = express();
app.use(express.json());
app.use(express.static(frontendDir));

app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/habits', require('./routes/habits'));
app.use('/api/analytics', require('./routes/analytics'));

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use('/api', (req, res) => res.status(404).json({ errors: ['Not found'] }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ errors: ['Invalid JSON'] });
  console.error(err);
  res.status(500).json({ errors: ['Server error'] });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Level Up running at http://localhost:${PORT}`));
}

module.exports = app;

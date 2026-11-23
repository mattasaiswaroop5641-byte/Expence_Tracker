const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const db = require('./services/db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static frontend UI
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// Mount REST API
app.use('/api', apiRoutes);

// Dedicated Admin Page Route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

// Fallback to index.html for SPA client-side routing
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Initialize DB on boot
db.getDb();

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Omnivance Expense Engine Server is Running Locally!   `);
  console.log(` URL: http://localhost:${PORT}                          `);
  console.log(` API: http://localhost:${PORT}/api/health               `);
  console.log(` Storage: server/data/db.json                          `);
  console.log(`=======================================================`);
});

module.exports = app;

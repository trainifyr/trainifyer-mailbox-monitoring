// Load env FIRST
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// TODO(PHASE-8: REPLACE WITH JWT)
const mockSession = require('./src/middleware/mockSession');

const app = express();
const PORT = process.env.PORT || 5000;

// Security & parsing
app.use(helmet());
app.use(cors());
app.use(express.json());

// Mock session (PHASE 1-7 only)
app.use(mockSession);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    mockUser: {
      role: req.mockUserRole || null,
      id: req.mockUserId || null
    },
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

app.listen(PORT, () => {
  console.log(`[INFO] Trainifyer backend running on port ${PORT}`);
  console.log(`[INFO] Health check: http://localhost:${PORT}/api/health`);
});

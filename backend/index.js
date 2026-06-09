// Load env FIRST
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');

// TODO(PHASE-8: REPLACE WITH JWT)
const mockSession = require('./src/middleware/mockSession');

const app  = express();
const PORT = process.env.PORT || 5000;

// Security & parsing
app.use(helmet());
app.use(cors());
app.use(express.json());

// Mock session (PHASE 1-7 only)
app.use(mockSession);

// -- Health check: basic
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    mockUser: {
      role: req.mockUserRole || null,
      id:   req.mockUserId   || null
    },
    timestamp: new Date().toISOString()
  });
});

// -- Health check: database connectivity
// Lists all public tables by calling the list_public_tables() RPC.
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to be set in .env.
app.get('/api/health/db', async (req, res) => {
  try {
    // Lazy-require so the server still boots even if Supabase creds are missing.
    const supabase = require('./src/lib/supabaseClient');
    const { data, error } = await supabase.rpc('list_public_tables');
    if (error) throw error;
    res.status(200).json({
      status: 'healthy',
      tables: data.map((r) => r.tablename),
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({
      status: 'unhealthy',
      error: e.message,
      timestamp: new Date().toISOString()
    });
  }
});

// -- Cohort CRUD routes (WI-201) --
app.use('/api/users/students', require('./src/routes/students'));
app.use('/api/batches',        require('./src/routes/batches'));
app.use('/api/batches/:id/settings', require('./src/routes/batchSettings'));

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
  console.log(`[INFO] Health check:    http://localhost:${PORT}/api/health`);
  console.log(`[INFO] DB health check: http://localhost:${PORT}/api/health/db`);
});

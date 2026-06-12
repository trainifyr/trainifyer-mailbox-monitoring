// Load env FIRST
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');

const authMiddleware = require('./src/middleware/authMiddleware');

const app  = express();
const PORT = process.env.PORT || 5000;

// Security & parsing
app.use(helmet());

// Production CORS: Allow our Render frontend + local dev
const allowedOrigins = [
  'http://localhost:5173',
  'https://trainifyer-frontend.onrender.com' // Adjust to your actual Render URL
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json());

// Auth middleware (JWT + mock fallback)
app.use(authMiddleware);

// -- Health check: basic
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    auth: req.user
      ? { method: req.user.email?.includes('@mock.local') ? 'mock' : 'jwt', user: req.user }
      : { method: 'none', user: null },
    timestamp: new Date().toISOString()
  });
});

// -- Health check: database connectivity
app.get('/api/health/db', async (req, res) => {
  try {
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
app.use('/api/mail',           require('./src/routes/mail'));
app.use('/api/meetings',       require('./src/routes/meetings'));
app.use('/api/meetings/:id/consent', require('./src/routes/meetingConsent'));
app.use('/api/meetings/:id',         require('./src/routes/attendanceLogs'));
app.use('/api/reports',              require('./src/routes/reports'));

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

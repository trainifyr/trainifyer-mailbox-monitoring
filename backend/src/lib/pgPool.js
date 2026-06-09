// pg connection pool for raw SQL operations (schema migrations, complex reports).
// Uses DATABASE_URL from .env (Supabase transaction pooler is recommended for free tier).
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in environment');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

module.exports = pool;

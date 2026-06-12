require('dotenv').config();
const { Pool } = require('pg');

async function test() {
  console.log('Connecting to:', process.env.DATABASE_URL.replace(/:([^:]+)@/, ':****@'));
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const res = await pool.query('SELECT tablename FROM pg_tables WHERE schemaname = \'public\'');
    console.log('Success! Tables found:', res.rows.map(r => r.tablename));
  } catch (err) {
    console.error('Connection failed:', err.message);
  } finally {
    await pool.end();
  }
}

test();

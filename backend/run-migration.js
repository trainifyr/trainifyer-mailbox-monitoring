const fs = require('fs');
require('dotenv').config();
const pool = require('./src/lib/pgPool');

async function run() {
  try {
    const sql = fs.readFileSync('./db/migrations/add_live_polls.sql', 'utf8');
    await pool.query(sql);
    console.log('Polls migration applied successfully.');
  } catch (e) {
    console.error('Migration failed:', e);
  } finally {
    process.exit();
  }
}

run();

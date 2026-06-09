require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const pool = require('../src/lib/pgPool');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    console.log('[SCHEMA] Applying db/schema.sql ...');
    await client.query(sql);
    console.log('[SCHEMA] OK - schema applied (or already up to date).');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[SCHEMA] FAILED:', err.message);
  process.exit(1);
});

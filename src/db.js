const pg = require('pg');
const { config } = require('./config.js');

let pool = null;

/**
 * Lazy singleton pg.Pool. Created on first call to getPool().
 */
function getPool() {
  if (!pool) {
    const isRemote = config.databaseUrl && !config.databaseUrl.includes('localhost') && !config.databaseUrl.includes('127.0.0.1');
    pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: config.pool.max,
      idleTimeoutMillis: config.pool.idleTimeoutMillis,
      connectionTimeoutMillis: config.pool.connectionTimeoutMillis,
      ...(isRemote ? { ssl: { rejectUnauthorized: false } } : {}),
    });

    // Log pool errors but never throw/crash the process
    pool.on('error', (err) => {
      console.error('[distillation/db] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

/**
 * Execute a parameterized query against the pool.
 */
function query(text, params) {
  return getPool().query(text, params);
}

/**
 * Drain and close the pool. Safe to call multiple times.
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, query, closePool };

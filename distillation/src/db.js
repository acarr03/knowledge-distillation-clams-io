import pg from 'pg';
import { config } from './config.js';

let pool = null;

/**
 * Lazy singleton pg.Pool. Created on first call to getPool().
 */
export function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: config.pool.max,
      idleTimeoutMillis: config.pool.idleTimeoutMillis,
      connectionTimeoutMillis: config.pool.connectionTimeoutMillis,
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
export function query(text, params) {
  return getPool().query(text, params);
}

/**
 * Drain and close the pool. Safe to call multiple times.
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

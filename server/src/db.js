import pkg from 'pg';
import { DATABASE_URL } from './config.js';

const { Pool } = pkg;

export const pool = new Pool({
  connectionString: DATABASE_URL,
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function getClient() {
  return pool.connect();
}

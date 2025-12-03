import '../src/config.js';
import { pool } from '../src/db.js';

async function run() {
  try {
    const { rows: userRows } = await pool.query(
      `SELECT id, email_encrypted FROM users ORDER BY id LIMIT 5`
    );
    console.log('Users count sample:', userRows.length);

    const { rows: recCounts } = await pool.query(
      `SELECT u.id AS user_id, COUNT(r.id)::int AS record_count
         FROM users u
         LEFT JOIN records r ON r.user_id = u.id
        GROUP BY u.id
        ORDER BY u.id
        LIMIT 5`
    );
    console.log('Record counts sample:', recCounts);

    const { rows: fileCounts } = await pool.query(
      `SELECT r.user_id, COUNT(f.id)::int AS file_count
         FROM records r
         LEFT JOIN record_files f ON f.record_id = r.id
        GROUP BY r.user_id
        ORDER BY r.user_id
        LIMIT 5`
    );
    console.log('File counts by user sample:', fileCounts);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();

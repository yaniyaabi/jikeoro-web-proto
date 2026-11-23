'use strict';
async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
async function earnedPoints(client, userId) {
  const result = await client.query(`SELECT
    COUNT(*)::integer * 100 + COUNT(*) FILTER(WHERE status='completed')::integer * 50 +
    CASE WHEN COUNT(*) FILTER(WHERE category='조도' AND date_trunc('month',created_at AT TIME ZONE 'Asia/Seoul')=date_trunc('month',now() AT TIME ZONE 'Asia/Seoul'))>=3 THEN 150 ELSE 0 END AS points
    FROM jikeoro.reports WHERE user_id=$1`, [userId]);
  return Number(result.rows[0].points);
}
module.exports = { transaction, earnedPoints };

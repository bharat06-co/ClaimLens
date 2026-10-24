import { Pool, PoolClient, QueryResultRow, types } from 'pg';

// PostgreSQL DATE has no time zone. Keep it as YYYY-MM-DD rather than turning
// local midnight into a UTC instant (which displays the previous day in India).
types.setTypeParser(1082, value => value);

const globalPg = globalThis as typeof globalThis & { __claimlensPool?: Pool };

function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  if (!globalPg.__claimlensPool) {
    globalPg.__claimlensPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 7000,
      idleTimeoutMillis: 10000,
    });
  }
  return globalPg.__claimlensPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
  return getPool().query<T>(sql, params);
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { runMigrations } from '../server/src/db/migrate.ts';

function queryableFor(db) {
  return { query: (text, params) => db.query(text, params) };
}

describe('runMigrations (PGlite)', () => {
  it('applies pending migrations and is idempotent', async () => {
    const db = new PGlite();
    const queryable = queryableFor(db);

    const first = await runMigrations(queryable);
    assert.ok(first.includes('0001_service_requests'));

    // The service_requests table now exists and is usable.
    await queryable.query(
      `INSERT INTO service_requests
        (id, customer_id, worker_id, category, description, latitude, longitude, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        '123e4567-e89b-12d3-a456-426614174000',
        '223e4567-e89b-12d3-a456-426614174000',
        null,
        'plumbing',
        'Leaking sink',
        25.03,
        121.56,
        'pending',
        new Date().toISOString(),
      ],
    );

    const second = await runMigrations(queryable);
    assert.deepEqual(second, []);

    await db.close();
  });

  it('records applied migrations in schema_migrations', async () => {
    const db = new PGlite();
    const queryable = queryableFor(db);

    await runMigrations(queryable);
    const result = await queryable.query('SELECT id FROM schema_migrations');
    assert.ok(result.rows.some((row) => row.id === '0001_service_requests'));

    await db.close();
  });

  it('only applies a new migration the next run', async () => {
    const db = new PGlite();
    const queryable = queryableFor(db);

    await runMigrations(queryable, [{ id: '0001_service_requests', sql: 'SELECT 1' }]);
    const added = await runMigrations(queryable, [
      { id: '0001_service_requests', sql: 'SELECT 1' },
      { id: '0002_demo', sql: 'CREATE TABLE demo (id int)' },
    ]);
    assert.deepEqual(added, ['0002_demo']);

    await db.close();
  });
});

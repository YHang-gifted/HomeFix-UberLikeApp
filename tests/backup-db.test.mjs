import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { backupFileName, pgDumpArgs, pgEnvFromUrl } from '../scripts/backup-db.mjs';

describe('backupFileName', () => {
  it('builds a sortable, filesystem-safe timestamped name', () => {
    const name = backupFileName(new Date('2026-07-01T12:34:56.789Z'));

    assert.equal(name, 'homefix-20260701T123456Z.sql');
  });

  it('has no characters that are unsafe in a filename', () => {
    const name = backupFileName(new Date('2026-01-02T03:04:05.000Z'));

    assert.match(name, /^homefix-\d{8}T\d{6}Z\.sql$/);
  });
});

describe('pgEnvFromUrl', () => {
  it('maps a full postgres URL to PG* variables', () => {
    const env = pgEnvFromUrl('postgres://alice:s3cr3t@db.example.com:6432/homefix');

    assert.deepEqual(env, {
      PGHOST: 'db.example.com',
      PGPORT: '6432',
      PGUSER: 'alice',
      PGPASSWORD: 's3cr3t',
      PGDATABASE: 'homefix',
    });
  });

  it('decodes percent-encoded credentials', () => {
    const env = pgEnvFromUrl('postgresql://a%40b:p%2Fw@localhost/db');

    assert.equal(env.PGUSER, 'a@b');
    assert.equal(env.PGPASSWORD, 'p/w');
  });

  it('carries an sslmode query parameter through', () => {
    const env = pgEnvFromUrl('postgres://u:p@host/db?sslmode=require');

    assert.equal(env.PGSSLMODE, 'require');
  });

  it('rejects a non-postgres URL', () => {
    assert.throws(() => pgEnvFromUrl('mysql://u:p@host/db'), /postgres:\/\//);
  });

  it('rejects a malformed URL', () => {
    assert.throws(() => pgEnvFromUrl('not a url'), /not a valid URL/);
  });
});

describe('pgDumpArgs', () => {
  it('names the output file and never embeds the connection string', () => {
    const args = pgDumpArgs('out.sql');

    assert.deepEqual(args, [
      '--no-owner',
      '--no-privileges',
      '--format=plain',
      '--file',
      'out.sql',
    ]);
    assert.ok(!args.some((a) => a.includes('postgres://')));
  });
});

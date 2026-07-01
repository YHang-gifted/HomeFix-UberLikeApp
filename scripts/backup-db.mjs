import { spawn } from 'node:child_process';
import process from 'node:process';
import { URL } from 'node:url';

/**
 * Build a timestamped, filesystem-safe dump filename, e.g.
 * `homefix-20260701T123456Z.sql`. Sortable and collision-free at one-second
 * resolution.
 */
export function backupFileName(date = new Date()) {
  const stamp = date.toISOString().slice(0, 19).replace(/[:-]/g, '');
  return `homefix-${stamp}Z.sql`;
}

/**
 * Parse a `postgres://` connection URL into libpq `PG*` environment variables.
 *
 * The password is returned as `PGPASSWORD` so it is passed to `pg_dump` via the
 * child process environment and NEVER appears in argv (where it would be visible
 * in `ps`) or in any log line. Throws on a malformed or non-postgres URL.
 */
export function pgEnvFromUrl(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must be a postgres:// connection string');
  }

  const env = {};
  if (url.hostname) {
    env.PGHOST = url.hostname;
  }
  if (url.port) {
    env.PGPORT = url.port;
  }
  if (url.username) {
    env.PGUSER = decodeURIComponent(url.username);
  }
  if (url.password) {
    env.PGPASSWORD = decodeURIComponent(url.password);
  }
  const database = url.pathname.replace(/^\//, '');
  if (database) {
    env.PGDATABASE = database;
  }
  const sslmode = url.searchParams.get('sslmode');
  if (sslmode) {
    env.PGSSLMODE = sslmode;
  }
  return env;
}

/**
 * `pg_dump` arguments. Contains no secrets — the connection is supplied through
 * the `PG*` environment (see {@link pgEnvFromUrl}). Plain SQL, portable restore
 * (owners and ACLs stripped so it restores cleanly into a fresh role).
 */
export function pgDumpArgs(outFile) {
  return ['--no-owner', '--no-privileges', '--format=plain', '--file', outFile];
}

function main() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    process.stderr.write('DATABASE_URL is not set; nothing to back up.\n');
    return 1;
  }

  const outFile = process.env['BACKUP_OUT'] ?? backupFileName();

  let pgEnv;
  try {
    pgEnv = pgEnvFromUrl(databaseUrl);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const child = spawn('pg_dump', pgDumpArgs(outFile), {
    env: { ...process.env, ...pgEnv },
    stdio: 'inherit',
  });
  child.on('error', (error) => {
    process.stderr.write(
      `Failed to run pg_dump (is it installed and on PATH?): ${error.message}\n`,
    );
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    if (code === 0) {
      process.stdout.write(`Backup written to ${outFile}\n`);
    } else {
      process.stderr.write(`pg_dump exited with code ${code ?? 'null'}\n`);
      process.exitCode = code ?? 1;
    }
  });
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}

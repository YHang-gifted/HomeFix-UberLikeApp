# Database Backups & Restore Runbook

HomeFix stores all durable state in a single Postgres database. This runbook
covers the managed backups the deploy target takes automatically, how to take an
on-demand logical backup, and how to restore. Backups are not exercised in CI —
this is an operator procedure.

## What is backed up

Everything the app persists lives in Postgres: users, service requests, quotes,
payments, payouts, reviews, messages, notifications, device tokens, and the audit
log. There is no other durable store — uploaded images use an in-memory mock
store today, so nothing on the filesystem needs backing up. Restoring the
database fully restores application state.

## Managed backups (primary)

The production database runs on Railway's managed Postgres, which takes automated
backups on the plan's schedule. This is the primary line of defence and requires
no application code.

Operator checklist on the Railway dashboard:

- Confirm automated backups are **enabled** on the Postgres service.
- Note the **retention window** and whether it meets the recovery target.
- Record where **point-in-time / snapshot restore** is triggered, and who has
  access.
- After any schema migration (`server/src/db/migrations`), verify the next backup
  completed so a restore would include the new tables.

Managed snapshots are the fastest path to recovery. The logical backup below is a
portable, provider-independent second copy — useful for migrating providers,
local debugging against production-shaped data, or keeping an off-site copy.

## On-demand logical backup

`scripts/backup-db.mjs` wraps `pg_dump`. It reads the connection from
`DATABASE_URL` and writes a timestamped plain-SQL file to the current directory.

```bash
# requires the postgresql-client (pg_dump) to be installed and on PATH
export DATABASE_URL='postgres://user:password@host:5432/homefix'
npm run backup:db
# → Backup written to homefix-20260701T123456Z.sql
```

Override the output path with `BACKUP_OUT`:

```bash
BACKUP_OUT=/backups/homefix-pre-migration.sql npm run backup:db
```

**Secret handling.** The script parses `DATABASE_URL` into libpq `PG*` variables
and passes the password via `PGPASSWORD` in the child environment, so the
credentials never appear in the process arguments (visible in `ps`) or in any log
line. Never commit a dump or a real `DATABASE_URL` to the repository — dumps
contain customer data and are covered by the same rules as production data.

The dump is taken with `--no-owner --no-privileges` so it restores cleanly into a
fresh database owned by whatever role you connect as.

## Restore

Restore into an **empty** database (create a scratch one first; never restore
over a live production database except in a declared recovery):

```bash
createdb homefix_restore
psql 'postgres://user:password@host:5432/homefix_restore' -f homefix-20260701T123456Z.sql
```

On boot the server runs the SQL migrations in `server/src/db/migrations` via the
multi-statement runner, so a restored dump plus a normal server start yields a
schema-current database. If you restore into a database an older server version
wrote, start the current server once to apply any newer migrations.

## Verifying a backup

A backup you have never restored is a hope, not a backup. Periodically:

1. Take a logical dump (or export a managed snapshot).
2. Restore it into a scratch database as above.
3. Point a local server at the scratch database and confirm `GET /ready` returns
   `200` and a couple of read endpoints return expected rows.
4. Drop the scratch database.

## Retention

- Managed snapshots: keep at least the provider's default window; extend to meet
  the agreed recovery-point objective.
- Logical dumps: keep off-site copies encrypted at rest; rotate on the same
  retention policy. Delete customer-data dumps promptly once no longer needed.

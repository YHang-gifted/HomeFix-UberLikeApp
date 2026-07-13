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

The production database runs on Railway's managed Postgres. Railway offers **two
independent mechanisms**, and they are not interchangeable — the difference matters,
so pick deliberately. Both live on the Postgres service's **Backups** tab.

_(Verified against Railway's docs on 2026-07-13. Railway's dashboard moves; if these
steps don't match what you see, fix this section rather than working around it.)_

### 1. Scheduled volume backups — snapshots of the whole volume

Set a schedule under **Backups**. Railway's retention is fixed by the schedule you
pick, and it is shorter than people assume:

| Schedule | Taken     | Kept         |
| -------- | --------- | ------------ |
| Daily    | every 24h | **6 days**   |
| Weekly   | every 7d  | **1 month**  |
| Monthly  | every 30d | **3 months** |

You can select several schedules at once (e.g. Daily + Weekly) and trigger a manual
backup any time. **Enable at least Daily + Weekly.**

Restoring: find the backup by its timestamp → **Restore** → Railway _stages_ the
change → review under **Details** → **Deploy**. The old volume is retained but
unmounted, so a bad restore is itself reversible.

Three footguns that are easy to learn the hard way:

- **Restoring a backup deletes every backup newer than it.** Take a manual backup
  immediately before any restore.
- **Wiping a volume deletes all of its backups.** They are not stored elsewhere.
- **Backups only restore into the same project + environment.** They are not a
  provider-migration path — that is what the logical dump below is for.

### 2. Point-in-Time Recovery (PITR) — the one that matters here

PITR continuously archives every WAL segment to a Railway bucket (`Postgres-PITR`)
via pgBackRest, so you can restore to **any timestamp** in the window, not just to a
snapshot boundary.

**HomeFix should have this on.** Migrations in `server/src/db/migrations` run
**automatically on boot** (see `docs/deployment.md`), so a faulty migration mutates
production the moment a deploy goes out. Scheduled snapshots can only take you back
to the previous night; PITR takes you back to 14:31, one minute before the migration
ran. That is the exact failure this project is exposed to.

Enable: **Backups** tab → **Enable PITR**. Railway creates the bucket, sets
`WAL_ARCHIVE_*` on the service, and redeploys; the first base backup is taken
automatically, after which a datetime picker appears.

> **The window is not retroactive.** It begins at the first base backup after you
> enable it. Enabling PITR today does not let you restore to yesterday — so enable it
> before you need it, not when you need it.

Restoring: pick a timestamp → **Restore to this moment**. Railway provisions a
**brand-new sibling service** (`<source>-restored-YYYYMMDD-HHMM`) and replays WAL into
it. **The source is never touched and keeps serving traffic** — which is what makes
the restore drill below safe to run against production. Cutting over (swapping the
connection string, decommissioning the original) is a manual step.

The restored fork runs as plain non-archiving Postgres; enable PITR on it too if you
keep it.

### Which does what

Snapshots are the coarse, cheap floor. PITR is the one that survives a bad migration.
The logical dump below is neither — it is the portable, provider-independent copy:
the only one of the three you can restore **outside Railway**, and the only one that
survives a volume being wiped.

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

## Verifying a backup — the restore drill

**A backup you have never restored is a hope, not a backup.** This is the step that is
always skipped and is the only one that proves anything. Run it once now, and again
after any change to the schema-migration flow.

The drill is safe against production: a PITR restore provisions a _new_ service and
never touches the source, which keeps serving traffic throughout.

1. **Take a manual volume backup first** (Backups tab). Cheap insurance, and required
   before any restore because restoring deletes newer backups.
2. **PITR → pick a timestamp a few minutes ago → Restore to this moment.** Wait for
   `<source>-restored-…` to come up.
3. **Point a server at the fork.** Set `DATABASE_URL` to the restored service's
   connection string and start the app (locally is fine). Confirm:
   - `GET /ready` → `200` with `"database": "ok"`
   - a couple of read endpoints return the rows you expect
   - the row counts look right — especially `payments`, `payouts` and `audit_log`,
     where a silent gap is the expensive kind
4. **Note how long steps 2–3 actually took.** That number is your real RTO. Write it
   down here; an RTO nobody has measured is a guess.
5. **Delete the restored service** (and its bucket) so it stops costing money.

Do the same drill once for the **logical dump** path (`npm run backup:db` → restore into
a scratch database), because that is the only path that still works if Railway itself is
the problem.

## Retention

- **Volume snapshots:** Daily (kept 6 days) + Weekly (kept 1 month). Note the Daily
  window is only **6 days** — shorter than most people assume.
- **PITR:** the archive window is what actually bounds recovery for a bad migration.
  It is **not retroactive** — enable it before you need it.
- **Logical dumps:** keep off-site copies encrypted at rest; rotate on the same
  retention policy. Delete customer-data dumps promptly once no longer needed. A dump
  contains customer data and is covered by the same rules as production data — never
  commit one.

**Recovery objectives.** Not yet agreed. Once the drill above has been run once, record
the measured RTO and the RPO the enabled schedules actually give you, rather than the
ones we would like.

import process from 'node:process';

/** Structured fields merged into a log record. Values must be JSON-serializable. */
export type LogFields = Record<string, unknown>;

type LogLevel = 'info' | 'error';

/**
 * Emit one log record. In the default `json` mode every call writes a single
 * self-contained JSON object on one line — `{ level, time, msg, ...fields }` — so a
 * log drain (e.g. a Railway → Logtail/Datadog integration) can parse each line and
 * index the fields directly. Set `LOG_FORMAT=pretty` for a compact human-readable
 * line in local development. Info goes to stdout, error to stderr.
 *
 * `LOG_FORMAT` is read straight from the environment (not the validated config) to
 * keep this a dependency-free, low-level utility that any module can import without
 * a cycle. `env.ts` still validates the value so a bad setting fails fast on boot.
 */
function write(level: LogLevel, message: string, fields: LogFields): void {
  const stream = level === 'error' ? process.stderr : process.stdout;
  if (process.env['LOG_FORMAT'] === 'pretty') {
    const extra = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : '';
    stream.write(`[${level}] ${message}${extra}\n`);
    return;
  }
  const record = { level, time: new Date().toISOString(), msg: message, ...fields };
  stream.write(`${JSON.stringify(record)}\n`);
}

export const logger = {
  info(message: string, fields: LogFields = {}): void {
    write('info', message, fields);
  },
  error(message: string, fields: LogFields = {}): void {
    write('error', message, fields);
  },
};

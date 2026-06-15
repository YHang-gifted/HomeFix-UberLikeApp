import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.expo',
  'android',
  'ios',
]);

/** True when the buffer contains a NUL byte (a sign of truncation or binary corruption). */
export function hasNulByte(buffer) {
  return buffer.includes(0);
}

/** Parse JSON text and report the outcome without throwing. */
export function validateJsonText(text) {
  try {
    JSON.parse(text);
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        out.push(...listFiles(join(dir, entry.name)));
      }
    } else if (entry.isFile()) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function main() {
  const root = process.argv[2] ?? '.';
  const errors = [];
  let checked = 0;

  for (const file of listFiles(root)) {
    const buffer = readFileSync(file);
    checked += 1;

    if (hasNulByte(buffer)) {
      errors.push(`${file}: contains a NUL byte (likely truncated or corrupted on save)`);
      continue;
    }

    if (extname(file) === '.json') {
      const result = validateJsonText(buffer.toString('utf8'));
      if (!result.ok) {
        errors.push(`${file}: invalid JSON (${result.error})`);
      }
    }
  }

  if (errors.length > 0) {
    process.stderr.write('File integrity check failed:\n');
    for (const message of errors) {
      process.stderr.write(`  - ${message}\n`);
    }
    return 1;
  }

  process.stdout.write(`File integrity OK: ${checked} files, no NUL bytes, all JSON valid.\n`);
  return 0;
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  process.exit(main());
}

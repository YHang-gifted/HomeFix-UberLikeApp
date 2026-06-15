import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * True when a Markdown checklist line about a security fix is checked: "- [x] ... security fix ...".
 */
export function isSecurityFixDeclared(prBody) {
  if (typeof prBody !== 'string') {
    return false;
  }
  return prBody
    .split('\n')
    .some((line) => /^\s*-\s*\[x\]/i.test(line) && /security fix/i.test(line));
}

/**
 * True when a unified diff adds a line containing a SEC-NNNN id (new ledger entry or index row).
 */
export function diffAddsSecEntry(diffText) {
  if (typeof diffText !== 'string') {
    return false;
  }
  return /^\+.*SEC-\d{4}/m.test(diffText);
}

function main() {
  const prBody = process.env.PR_BODY ?? '';
  if (!isSecurityFixDeclared(prBody)) {
    process.stdout.write('Not marked as a security fix; ledger check skipped.\n');
    return 0;
  }
  const diffFile = process.env.LEDGER_DIFF_FILE;
  const diffText = diffFile ? readFileSync(diffFile, 'utf8') : '';
  if (diffAddsSecEntry(diffText)) {
    process.stdout.write('OK: a new SEC-NNNN entry was added to docs/security-fixes.md.\n');
    return 0;
  }
  process.stderr.write(
    '::error::This PR is marked as a security fix but no new SEC-NNNN entry was added to docs/security-fixes.md. Add a ledger entry (see docs/security-fixes.md) before merging.\n',
  );
  return 1;
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  process.exit(main());
}

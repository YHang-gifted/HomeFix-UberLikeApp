import assert from 'node:assert/strict';
import process from 'node:process';
import { afterEach, describe, it } from 'node:test';

import { logger } from '../server/src/utils/logger.ts';

/** Run `fn` while capturing everything written to process[stream], restoring after. */
function capture(stream, fn) {
  const original = process[stream].write;
  let out = '';
  process[stream].write = (chunk) => {
    out += String(chunk);
    return true;
  };
  try {
    fn();
  } finally {
    process[stream].write = original;
  }
  return out;
}

describe('logger', () => {
  afterEach(() => {
    delete process.env.LOG_FORMAT;
  });

  it('json mode writes one self-contained JSON object per line to stdout', () => {
    delete process.env.LOG_FORMAT;
    const out = capture('stdout', () => {
      logger.info('request', { type: 'request', status: 200 });
    });

    const lines = out.trimEnd().split('\n');
    assert.equal(lines.length, 1);
    // Pure JSON — no `[info]` prefix, so a drain can parse the line directly.
    assert.ok(lines[0].startsWith('{'));
    const record = JSON.parse(lines[0]);
    assert.equal(record.level, 'info');
    assert.equal(record.msg, 'request');
    assert.equal(record.type, 'request');
    assert.equal(record.status, 200);
    // A machine-parseable ISO timestamp for ordering/indexing.
    assert.equal(typeof record.time, 'string');
    assert.ok(!Number.isNaN(Date.parse(record.time)));
  });

  it('routes error logs to stderr (not stdout) with level "error"', () => {
    delete process.env.LOG_FORMAT;
    let errLine = '';
    const stdoutDuring = capture('stdout', () => {
      errLine = capture('stderr', () => {
        logger.error('boom', { type: 'error', requestId: 'r1' });
      });
    });

    assert.equal(stdoutDuring, '', 'error must not write to stdout');
    const record = JSON.parse(errLine.trimEnd());
    assert.equal(record.level, 'error');
    assert.equal(record.msg, 'boom');
    assert.equal(record.requestId, 'r1');
  });

  it('pretty mode writes a compact human line with no JSON envelope', () => {
    process.env.LOG_FORMAT = 'pretty';
    const out = capture('stdout', () => {
      logger.info('hi', { a: 1 });
    });
    assert.equal(out, '[info] hi {"a":1}\n');
  });

  it('pretty mode omits the fields object when there are none', () => {
    process.env.LOG_FORMAT = 'pretty';
    const out = capture('stdout', () => {
      logger.info('ready');
    });
    assert.equal(out, '[info] ready\n');
  });
});

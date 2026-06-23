import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  nextWorkerStatus,
  workerActionLabel,
} from '../app/src/features/serviceRequests/workerStatus.ts';

describe('nextWorkerStatus', () => {
  it('advances through the worker pipeline', () => {
    assert.equal(nextWorkerStatus('matched'), 'accepted');
    assert.equal(nextWorkerStatus('accepted'), 'in_progress');
    assert.equal(nextWorkerStatus('in_progress'), 'completed');
  });

  it('returns null when there is no forward action', () => {
    assert.equal(nextWorkerStatus('pending'), null);
    assert.equal(nextWorkerStatus('completed'), null);
    assert.equal(nextWorkerStatus('cancelled'), null);
  });
});

describe('workerActionLabel', () => {
  it('labels each advance action', () => {
    assert.equal(workerActionLabel('matched'), 'Accept job');
    assert.equal(workerActionLabel('accepted'), 'Start work');
    assert.equal(workerActionLabel('in_progress'), 'Mark complete');
  });

  it('returns null when there is no action', () => {
    assert.equal(workerActionLabel('pending'), null);
    assert.equal(workerActionLabel('completed'), null);
  });
});

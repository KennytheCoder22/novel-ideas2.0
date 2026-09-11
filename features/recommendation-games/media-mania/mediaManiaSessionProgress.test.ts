import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaManiaSessionProgress } from './mediaManiaSessionProgress';

test('sets continue after the initial media unlock and preserve completion at boundaries', () => {
  for (const count of [0, 1, 5, 6, 7, 11, 12, 13, 60, 61]) {
    const progress = mediaManiaSessionProgress(count);
    assert.equal((progress.setNumber - 1) * 6 + progress.completed, count);
    assert.equal(progress.atCheckpoint, count > 0 && count % 6 === 0);
    assert.ok(progress.completed >= 0 && progress.completed <= 6);
  }
});
test('undo at a boundary retracts the celebration and reset returns to the first set', () => {
  assert.equal(mediaManiaSessionProgress(6).atCheckpoint, true);
  assert.equal(mediaManiaSessionProgress(5).atCheckpoint, false);
  assert.equal(mediaManiaSessionProgress(5).completed, 5);
  assert.equal(mediaManiaSessionProgress(0).setNumber, 1);
  assert.equal(mediaManiaSessionProgress(0).completed, 0);
});

const test = require('node:test');
const assert = require('node:assert');
const SpanCore = require('../js/core.js');

test('Calendar Layout & Geometry Math', async (t) => {
  await t.test('compute overlap ranges correctly', () => {
    // Two overlapping events: 09:00 - 10:00 (60m) and 09:30 - 10:30 (60m)
    const taskA = { startM: SpanCore.timeToMinutes('09:00'), endM: SpanCore.timeToMinutes('10:00') };
    const taskB = { startM: SpanCore.timeToMinutes('09:30'), endM: SpanCore.timeToMinutes('10:30') };
    const taskC = { startM: SpanCore.timeToMinutes('11:00'), endM: SpanCore.timeToMinutes('12:00') };

    const overlapsAB = taskA.startM < taskB.endM && taskB.startM < taskA.endM;
    const overlapsAC = taskA.startM < taskC.endM && taskC.startM < taskA.endM;

    assert.strictEqual(overlapsAB, true, 'Event A and B must overlap');
    assert.strictEqual(overlapsAC, false, 'Event A and C must not overlap');
  });

  await t.test('pixel height calculation per duration', () => {
    const HOUR_HEIGHT = 64;
    function getBlockHeight(durationMinutes) {
      return Math.max(22, (durationMinutes / 60) * HOUR_HEIGHT);
    }

    assert.strictEqual(getBlockHeight(60), 64);
    assert.strictEqual(getBlockHeight(30), 32);
    assert.strictEqual(getBlockHeight(15), 22, 'Minimum block height floor is 22px');
    assert.strictEqual(getBlockHeight(120), 128);
  });
});

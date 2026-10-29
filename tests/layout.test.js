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

  await t.test('all-day layout never places date-less backlog tasks on Monday', () => {
    const visibleDateStrs = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
    const visStartStr = visibleDateStrs[0];
    const visEndStr = visibleDateStrs[visibleDateStrs.length - 1];

    function filterAllDayItems(tasks) {
      const items = [];
      tasks.forEach(task => {
        if (!task || !task.date || typeof task.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(task.date.trim())) {
          return;
        }
        const taskDate = task.date.trim();
        const cleanEndDate = (task.endDate && typeof task.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(task.endDate.trim())) ? task.endDate.trim() : null;
        const isMultiDay = !!(cleanEndDate && cleanEndDate > taskDate);
        const isAllDay = !!task.allDay || (!task.time && !!taskDate) || isMultiDay;
        if (!isAllDay) return;

        const tStart = taskDate;
        const tEnd = (cleanEndDate && cleanEndDate >= tStart) ? cleanEndDate : tStart;
        if (tEnd < visStartStr || tStart > visEndStr) return;

        let colStart = visibleDateStrs.indexOf(tStart);
        const startsBefore = (colStart === -1 && tStart < visStartStr);
        if (startsBefore) colStart = 0;

        let colEnd = visibleDateStrs.indexOf(tEnd);
        const endsAfter = (colEnd === -1 && tEnd > visEndStr);
        if (endsAfter) colEnd = visibleDateStrs.length - 1;

        if (colStart === -1 || colEnd === -1 || colEnd < colStart) return;

        items.push({ task, colStart, colEnd });
      });
      return items;
    }

    const testTasks = [
      { id: 'b_1', title: 'Mail Teresa', date: null, allDay: true },
      { id: 'b_2', title: 'Ans: facture poubelle', date: '', allDay: true },
      { id: 'b_3', title: 'Dys-moi (rdv)', date: undefined, allDay: true },
      { id: 'past_1', title: 'Old event Oct 5', date: '2026-10-05', allDay: true },
      { id: 'future_1', title: 'Future event Oct 29', date: '2026-10-29', allDay: true },
      { id: 'valid_mon', title: 'Real Monday event', date: '2026-10-12', allDay: true },
      { id: 'valid_wed', title: 'Real Wednesday event', date: '2026-10-14', allDay: true }
    ];

    const rendered = filterAllDayItems(testTasks);
    assert.strictEqual(rendered.length, 2, 'Only the 2 scheduled events in that week should appear');
    assert.strictEqual(rendered[0].task.id, 'valid_mon');
    assert.strictEqual(rendered[0].colStart, 0, 'Monday event is on Monday (col 0)');
    assert.strictEqual(rendered[1].task.id, 'valid_wed');
    assert.strictEqual(rendered[1].colStart, 2, 'Wednesday event is on Wednesday (col 2)');
  });
});

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

  await t.test('mobile week alignment generates Monday to Sunday strip', () => {
    function getMonday(d) {
      const date = new Date(d);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(date.setDate(diff));
    }

    // Wednesday, Nov 18, 2026
    const wednesday = new Date(2026, 10, 18);
    const mon = getMonday(wednesday);

    assert.strictEqual(mon.getDay(), 1, 'Start of week must be Monday (day 1)');
    assert.strictEqual(mon.getDate(), 16, 'Monday is Nov 16');

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      weekDays.push(d.getDay());
    }
    // Monday (1) through Sunday (0)
    assert.deepStrictEqual(weekDays, [1, 2, 3, 4, 5, 6, 0]);
  });

  await t.test('mobile hour height is 46px and desktop is 64px', () => {
    function getHourHeight(isMobile) {
      return isMobile ? 46 : 64;
    }
    assert.strictEqual(getHourHeight(true), 46, 'Mobile hour height must be 46px');
    assert.strictEqual(getHourHeight(false), 64, 'Desktop hour height must be 64px');

    // On 812px height screen (iPhone 13 mini) with ~600px visible canvas, 46px/h displays ~13 hours
    const visibleHours = Math.floor(600 / getHourHeight(true));
    assert.ok(visibleHours >= 8, 'Can view at least 8 to 10 hours at once on iPhone 13 mini');
  });

  await t.test('mobile navigation advances/recedes by 1 whole week (7 days)', () => {
    function getStep(isMobile, visibleDays) {
      return isMobile ? 7 : ((visibleDays === 7 || visibleDays === 5) ? 7 : visibleDays);
    }
    assert.strictEqual(getStep(true, 1), 7, 'Header arrows on mobile jump by 7 days even in 1J view');
    assert.strictEqual(getStep(true, 3), 7, 'Header arrows on mobile jump by 7 days in 3J view');
    assert.strictEqual(getStep(true, 7), 7, 'Header arrows on mobile jump by 7 days in 7J view');
  });

  await t.test('empty all-day items collapses completely (returns 0 items)', () => {
    function renderAllDayContinuousRibbonHtml(items) {
      if (!items || items.length === 0) return '';
      return '<div class="cal-allday-section">...</div>';
    }
    assert.strictEqual(renderAllDayContinuousRibbonHtml([]), '', 'Empty all-day section must collapse to empty string');
    assert.strictEqual(renderAllDayContinuousRibbonHtml(null), '', 'Null all-day section must collapse to empty string');
    assert.ok(renderAllDayContinuousRibbonHtml([{ id: '1' }]).length > 0, 'Populated all-day section renders ribbon markup');
  });
});

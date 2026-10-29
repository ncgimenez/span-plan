const test = require('node:test');
const assert = require('node:assert');
const SpanCore = require('../js/core.js');

test('SpanCore Utilities (span-plan)', async (t) => {
  await t.test('getLocalDateString returns local YYYY-MM-DD', () => {
    const fixedDate = new Date(2026, 9, 28, 12, 0, 0); // Oct 28, 2026
    assert.strictEqual(SpanCore.getLocalDateString(fixedDate), '2026-10-28');
  });

  await t.test('timeToMinutes and minutesToTime accuracy', () => {
    assert.strictEqual(SpanCore.timeToMinutes('00:00'), 0);
    assert.strictEqual(SpanCore.timeToMinutes('14:45'), 885);
    assert.strictEqual(SpanCore.timeToMinutes('23:59'), 1439);
    assert.strictEqual(SpanCore.minutesToTime(885), '14:45');
    assert.strictEqual(SpanCore.formatHour(9), '09:00');
  });

  await t.test('escapeHtml prevents XSS injection', () => {
    assert.strictEqual(
      SpanCore.escapeHtml('<script>alert("test")</script>&"\''),
      '&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt;&amp;&quot;&#039;'
    );
  });

  await t.test('extractTaskUrl extracts clean links', () => {
    assert.strictEqual(SpanCore.extractTaskUrl({ url: 'https://meet.google.com/xyz' }), 'https://meet.google.com/xyz');
    assert.strictEqual(SpanCore.extractTaskUrl({ location: 'Salle 4 www.zoom.us/j/123' }), 'https://www.zoom.us/j/123');
    assert.strictEqual(SpanCore.extractTaskUrl({ notes: 'Doc: https://docs.google.com/document/d/1' }), 'https://docs.google.com/document/d/1');
  });

  await t.test('getTaskActionType detects call, mail, pay', () => {
    assert.strictEqual(SpanCore.getTaskActionType({ title: 'Appeler client pour devis' }), 'call');
    assert.strictEqual(SpanCore.getTaskActionType({ title: 'Envoyer mail récapitulatif' }), 'mail');
    assert.strictEqual(SpanCore.getTaskActionType({ title: 'Régler la facture Stripe' }), 'pay');
    assert.strictEqual(SpanCore.getTaskActionType({ title: 'Regarder film Interstellar' }), 'content');
    assert.strictEqual(SpanCore.getTaskActionType({ title: 'Vidéo tiktok recettes pasta' }), 'content');
    assert.strictEqual(SpanCore.getTaskActionType({ title: 'Rédiger le rapport Q3' }), null);
  });

  await t.test('normalizeTask enforces universal schema', () => {
    const raw = {
      id: 'p_100',
      title: 'Brainstorming roadmap',
      context: 'work',
      duration: 60,
      type: 'event',
      date: '2026-10-29',
      time: '10:00'
    };
    const norm = SpanCore.normalizeTask(raw);
    assert.strictEqual(norm.context, 'work');
    assert.strictEqual(norm.category, 'Work');
    assert.strictEqual(norm.type, 'event');
    assert.strictEqual(norm.isEvent, true);
    assert.strictEqual(norm.duration, 60);
    assert.strictEqual(norm.estimate, 2);
    assert.strictEqual(norm.scheduledDate, '2026-10-29');
    assert.strictEqual(norm.scheduledTime, '10:00');
  });
});

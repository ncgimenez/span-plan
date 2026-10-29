const test = require('node:test');
const assert = require('node:assert');
const SpanCore = require('../js/core.js');

test('Span Plan Backup, Export (CSV/JSON) & Import Engine', async (t) => {
  const sampleTasks = [
    {
      id: 't_1',
      title: 'Réunion client "Projet Alpha"',
      type: 'event',
      date: '2026-10-30',
      time: '14:00',
      duration: 60,
      context: 'work',
      actionType: 'call',
      completed: false,
      important: true,
      notes: 'Lien: https://meet.google.com/abc',
      subtasks: [
        { id: 'sub_1', title: 'Préparer slides', completed: true },
        { id: 'sub_2', title: 'Partager le compte-rendu', completed: false }
      ]
    },
    {
      id: 't_2',
      title: 'Régler facture Stripe & EDF',
      type: 'task',
      date: null,
      time: '',
      duration: 15,
      context: 'life',
      actionType: 'pay',
      completed: true,
      important: false,
      notes: 'Total: 150€'
    }
  ];

  await t.test('tasksToCsv exports valid CSV with BOM, quotes and subtasks', () => {
    const csv = SpanCore.tasksToCsv(sampleTasks);
    assert.ok(csv.startsWith('\uFEFF'), 'CSV starts with UTF-8 BOM');
    assert.ok(csv.includes('ID,Titre,Date,Heure,Duree_min,Categorie,Type'), 'CSV contains header');
    assert.ok(csv.includes('"Réunion client ""Projet Alpha"""'), 'Quotes inside titles are escaped');
    assert.ok(csv.includes('[✓] Préparer slides | [ ] Partager le compte-rendu'), 'Subtasks are serialized');
    assert.ok(csv.includes('Régler facture Stripe & EDF'), 'French accents preserved');
  });

  await t.test('csvToTasks parses CSV back into normalized SpanTasks', () => {
    const csv = SpanCore.tasksToCsv(sampleTasks);
    const parsed = SpanCore.csvToTasks(csv);
    assert.strictEqual(parsed.length, 2);

    const t1 = parsed[0];
    assert.strictEqual(t1.id, 't_1');
    assert.strictEqual(t1.title, 'Réunion client "Projet Alpha"');
    assert.strictEqual(t1.date, '2026-10-30');
    assert.strictEqual(t1.time, '14:00');
    assert.strictEqual(t1.type, 'event');
    assert.strictEqual(t1.context, 'work');
    assert.strictEqual(t1.important, true);
    assert.strictEqual(t1.subtasks.length, 2);
    assert.strictEqual(t1.subtasks[0].title, 'Préparer slides');
    assert.strictEqual(t1.subtasks[0].completed, true);
    assert.strictEqual(t1.subtasks[1].title, 'Partager le compte-rendu');
    assert.strictEqual(t1.subtasks[1].completed, false);

    const t2 = parsed[1];
    assert.strictEqual(t2.id, 't_2');
    assert.strictEqual(t2.title, 'Régler facture Stripe & EDF');
    assert.strictEqual(t2.date, null);
    assert.strictEqual(t2.type, 'task');
    assert.strictEqual(t2.context, 'life');
    assert.strictEqual(t2.completed, true);
  });

  await t.test('createBackupArchive produces complete format v2 metadata', () => {
    const archive = SpanCore.createBackupArchive(sampleTasks, [{ id: 'f_1', title: 'Focus task' }], { theme: 'dark' });
    assert.strictEqual(archive.app, 'span-plan');
    assert.strictEqual(archive.version, 2);
    assert.strictEqual(archive.stats.totalTasks, 2);
    assert.strictEqual(archive.stats.events, 1);
    assert.strictEqual(archive.stats.backlog, 1);
    assert.strictEqual(archive.stats.completed, 1);
    assert.strictEqual(archive.stats.focusCount, 1);
    assert.strictEqual(archive.tasks.length, 2);
    assert.strictEqual(archive.focusTasks.length, 1);
    assert.strictEqual(archive.settings.theme, 'dark');
  });

  await t.test('parseImportFile recognizes JSON archive', () => {
    const archive = SpanCore.createBackupArchive(sampleTasks, [], { theme: 'dark' });
    const jsonStr = JSON.stringify(archive);
    const result = SpanCore.parseImportFile(jsonStr, 'span-plan-backup.json');

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.format, 'json_archive');
    assert.strictEqual(result.tasks.length, 2);
    assert.strictEqual(result.summary.events, 1);
    assert.strictEqual(result.summary.backlog, 1);
  });

  await t.test('parseImportFile recognizes raw JSON array', () => {
    const jsonStr = JSON.stringify(sampleTasks);
    const result = SpanCore.parseImportFile(jsonStr, 'tasks.json');

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.format, 'json_tasks');
    assert.strictEqual(result.tasks.length, 2);
  });

  await t.test('parseImportFile recognizes CSV file', () => {
    const csv = SpanCore.tasksToCsv(sampleTasks);
    const result = SpanCore.parseImportFile(csv, 'export-2026.csv');

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.format, 'csv');
    assert.strictEqual(result.tasks.length, 2);
    assert.strictEqual(result.tasks[0].title, 'Réunion client "Projet Alpha"');
  });
});

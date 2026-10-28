const test = require('node:test');
const assert = require('node:assert');
const SpanCore = require('../js/core.js');

test('SpanReactiveStore (span-plan)', async (t) => {
  await t.test('Store CRUD operations and subscriber notifications', () => {
    const store = new SpanCore.SpanReactiveStore('test_plan_store');
    const log = [];
    const unsub = store.subscribe((evt, payload) => log.push(evt));

    const task = store.addTask({
      title: 'Préparer réunion hebdo',
      context: 'work',
      duration: 30
    }, 'test');

    assert.strictEqual(store.getTasks().length, 1);
    assert.strictEqual(task.context, 'work');
    assert.strictEqual(task.category, 'Work');
    assert.strictEqual(log.includes('add'), true);

    const updated = store.updateTask(task.id, { completed: true }, 'test');
    assert.strictEqual(updated.completed, true);
    assert.strictEqual(log.includes('update'), true);

    const deleted = store.deleteTask(task.id, 'test');
    assert.strictEqual(deleted, true);
    assert.strictEqual(store.getTasks().length, 0);
    assert.strictEqual(log.includes('delete'), true);

    unsub();
  });

  await t.test('Undo history restores previous snapshot', () => {
    const store = new SpanCore.SpanReactiveStore('test_undo_store');
    const t1 = store.addTask({ title: 'Task 1', context: 'work' }, 'local');
    const t2 = store.addTask({ title: 'Task 2', context: 'life' }, 'local');
    assert.strictEqual(store.getTasks().length, 2);

    const undoSuccess = store.undo();
    assert.strictEqual(undoSuccess, true);
    assert.strictEqual(store.getTasks().length, 1);
    assert.strictEqual(store.getTasks()[0].title, 'Task 1');
  });
});

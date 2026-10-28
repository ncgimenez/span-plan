const test = require('node:test');
const assert = require('node:assert');

// Simulation of executeAutoRollover logic
function runAutoRollover(allTasks, currentToday) {
  const recreatedBacklogBlocks = [];
  const modifiedParents = [];

  allTasks.forEach(task => {
    if (!task || !task.date) return;
    if (task.recurrence && task.recurrence !== 'none') return;
    if (task.date >= currentToday) return;

    const hasSubtasks = Array.isArray(task.subtasks) && task.subtasks.length > 0;

    if (hasSubtasks) {
      const completedSubtasks = task.subtasks.filter(s => !!s.completed);
      const unfinishedSubtasks = task.subtasks.filter(s => !s.completed);

      if (unfinishedSubtasks.length === 0) {
        if (!task.completed) {
          task.completed = true;
          task.updated_at = new Date().toISOString();
        }
        return;
      }

      if (completedSubtasks.length === 0) {
        if (task.type === 'event') {
          task.subtasks = [];
          task.updated_at = new Date().toISOString();
          modifiedParents.push(task);

          recreatedBacklogBlocks.push({
            id: 'recreated_' + Date.now(),
            title: task.title,
            type: 'task',
            date: null,
            endDate: null,
            time: '',
            allDay: false,
            duration: task.duration || 60,
            context: task.context || 'work',
            important: !!task.important,
            completed: false,
            subtasks: unfinishedSubtasks.map(s => ({ ...s, completed: false })),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        } else {
          task.date = null;
          task.time = '';
          task.endDate = null;
          task.isRollover = false;
          task.completed = false;
          task.updated_at = new Date().toISOString();
          modifiedParents.push(task);
        }
        return;
      }

      // Some completed, some unfinished:
      task.subtasks = completedSubtasks;
      task.completed = true;
      task.updated_at = new Date().toISOString();
      modifiedParents.push(task);

      recreatedBacklogBlocks.push({
        id: 'recreated_' + Date.now(),
        title: task.title,
        type: 'task',
        date: null,
        endDate: null,
        time: '',
        allDay: false,
        duration: task.duration || 60,
        context: task.context || 'work',
        important: !!task.important,
        completed: false,
        subtasks: unfinishedSubtasks.map(s => ({ ...s, completed: false })),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      return;
    }

    if (task.type !== 'event' && !task.completed) {
      task.date = null;
      task.time = '';
      task.endDate = null;
      task.isRollover = false;
      task.updated_at = new Date().toISOString();
    }
  });

  if (recreatedBacklogBlocks.length > 0) {
    recreatedBacklogBlocks.forEach(newBlock => {
      allTasks.unshift(newBlock);
    });
  }

  return { allTasks, recreatedBacklogBlocks, modifiedParents };
}

test('Backlog rollover preserves block grouping for unfinished subtasks', async (t) => {
  await t.test('splits block: done subtasks stay on past day, unfinished subtasks stay grouped in recreated backlog block', () => {
    const tasks = [
      {
        id: 'p1',
        title: 'Projet Alpha',
        date: '2026-10-27',
        time: '10:00',
        completed: false,
        context: 'work',
        important: true,
        subtasks: [
          { id: 's1', title: 'Sous-tâche 1 (faite)', completed: true },
          { id: 's2', title: 'Sous-tâche 2 (à faire)', completed: false },
          { id: 's3', title: 'Sous-tâche 3 (à faire)', completed: false }
        ]
      }
    ];

    const result = runAutoRollover(tasks, '2026-10-28');

    // Past task on 2026-10-27 must keep ONLY the completed subtask and be marked completed
    const pastTask = result.allTasks.find(t => t.id === 'p1');
    assert.strictEqual(pastTask.date, '2026-10-27');
    assert.strictEqual(pastTask.completed, true);
    assert.strictEqual(pastTask.subtasks.length, 1);
    assert.strictEqual(pastTask.subtasks[0].id, 's1');

    // New task in backlog must exist, date: null, title 'Projet Alpha', and have both remaining subtasks
    const backlogBlock = result.allTasks.find(t => t.date === null);
    assert.ok(backlogBlock, 'Backlog block should exist');
    assert.strictEqual(backlogBlock.title, 'Projet Alpha');
    assert.strictEqual(backlogBlock.important, true);
    assert.strictEqual(backlogBlock.completed, false);
    assert.strictEqual(backlogBlock.subtasks.length, 2);
    assert.strictEqual(backlogBlock.subtasks[0].title, 'Sous-tâche 2 (à faire)');
    assert.strictEqual(backlogBlock.subtasks[1].title, 'Sous-tâche 3 (à faire)');
  });

  await t.test('moves full block to backlog when no subtasks were completed', () => {
    const tasks = [
      {
        id: 'p2',
        title: 'Projet Beta',
        date: '2026-10-27',
        time: '14:00',
        completed: false,
        context: 'life',
        subtasks: [
          { id: 's10', title: 'Pas fait 1', completed: false },
          { id: 's11', title: 'Pas fait 2', completed: false }
        ]
      }
    ];

    const result = runAutoRollover(tasks, '2026-10-28');
    assert.strictEqual(result.allTasks.length, 1);
    const moved = result.allTasks[0];
    assert.strictEqual(moved.id, 'p2');
    assert.strictEqual(moved.date, null);
    assert.strictEqual(moved.subtasks.length, 2);
  });
});

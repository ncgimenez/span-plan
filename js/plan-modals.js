// ==============================================================
// SPAN PLAN - MODALS & POPOVERS (TASK EDIT, SUBTASKS, QUICK ADD)
// ==============================================================


function toggleSubtasksRolloverPanel(show) {
  const panel = document.getElementById('subtasksRolloverPanel');
  if (!panel) return;
  const isHidden = panel.style.display === 'none' || !panel.style.display;
  const willShow = (typeof show === 'boolean') ? show : isHidden;
  panel.style.display = willShow ? 'flex' : 'none';
  if (willShow) {
    const parent = window.SpanPlanState.tasks.find(t => t.id === currentSubtasksParentId);
    const titleInput = document.getElementById('rolloverNewTitle');
    if (titleInput) {
      if (!titleInput.value || titleInput.dataset.parentId !== currentSubtasksParentId) {
        if (parent) titleInput.value = `${parent.title} (suite)`;
        titleInput.dataset.parentId = currentSubtasksParentId;
      }
      setTimeout(() => titleInput.focus(), 50);
    }
    const dateInput = document.getElementById('rolloverCustomDate');
    const timeInput = document.getElementById('rolloverCustomTime');
    const allDayInput = document.getElementById('rolloverCustomAllDay');
    if (dateInput) {
      if (!dateInput.value || dateInput.dataset.parentId !== currentSubtasksParentId) {
        const parentDateObj = (parent && parent.date) ? new Date(parent.date + 'T00:00:00') : new Date();
        const tomorrowObj = new Date(parentDateObj.getTime() + 86400000);
        dateInput.value = getLocalDateString(tomorrowObj);
        dateInput.dataset.parentId = currentSubtasksParentId;
      }
    }
    if (timeInput && parent) {
      timeInput.value = parent.time || '09:00';
    }
    if (allDayInput && parent) {
      allDayInput.checked = !!parent.allDay;
      toggleRolloverCustomTime(!!parent.allDay);
    }
  }
}

function toggleRolloverCustomTime(isAllDay) {
  const timeInput = document.getElementById('rolloverCustomTime');
  const timeGroup = document.getElementById('rolloverTimeGroup');
  if (timeInput) {
    timeInput.disabled = isAllDay;
    if (isAllDay) {
      if (timeGroup) timeGroup.style.opacity = '0.4';
    } else {
      if (timeGroup) timeGroup.style.opacity = '1';
    }
  }
}

function executeCustomSubtasksRollover() {
  if (!currentSubtasksParentId) return;
  const dateInput = document.getElementById('rolloverCustomDate');
  const timeInput = document.getElementById('rolloverCustomTime');
  const allDayInput = document.getElementById('rolloverCustomAllDay');

  const targetDate = dateInput ? dateInput.value : '';
  if (!targetDate) {
    if (typeof showToast === 'function') showToast('Veuillez choisir une date', 'warning');
    if (dateInput) dateInput.focus();
    return;
  }

  const isAllDay = allDayInput ? allDayInput.checked : false;
  const targetTime = isAllDay ? '' : (timeInput ? timeInput.value : '09:00');
  const desc = isAllDay ? `le ${targetDate} (toute la journée)` : `le ${targetDate} à ${targetTime}`;

  executeSubtasksRolloverCore({
    targetDate: targetDate,
    targetEndDate: targetDate,
    targetTime: targetTime,
    targetAllDay: isAllDay,
    targetDesc: desc
  });
}

function executeSubtasksRollover(mode) {
  if (!currentSubtasksParentId) return;
  const allTasks = window.SpanPlanState.tasks;
  const parent = allTasks.find(t => t.id === currentSubtasksParentId);
  if (!parent) return;

  const parentDateObj = parent.date ? new Date(parent.date + 'T00:00:00') : new Date();
  const tomorrowObj = new Date(parentDateObj.getTime() + 86400000);
  const tomorrowStr = getLocalDateString(tomorrowObj);

  let targetDate = parent.date || TODAY_STR;
  let targetEndDate = targetDate;
  let targetTime = parent.time || '09:00';
  let targetAllDay = false;
  let targetDesc = '';

  if (mode === 'tomorrow') {
    targetDate = tomorrowStr;
    targetEndDate = tomorrowStr;
    targetTime = parent.time || '09:00';
    targetAllDay = !!parent.allDay;
    targetDesc = `demain à ${targetTime || 'toute la journée'}`;
  } else if (mode === 'later_today') {
    targetDate = parent.date || TODAY_STR;
    targetEndDate = targetDate;
    targetAllDay = false;
    if (parent.time) {
      const parts = parent.time.split(':');
      let startMins = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      let endMins = startMins + (parent.duration || 60);
      let laterMins = Math.min(23 * 60, endMins + 30);
      let lh = String(Math.floor(laterMins / 60)).padStart(2, '0');
      let lm = String(laterMins % 60).padStart(2, '0');
      targetTime = `${lh}:${lm}`;
    } else {
      targetTime = '14:00';
    }
    targetDesc = `aujourd'hui à ${targetTime}`;
  } else if (mode === 'allday_tomorrow') {
    targetDate = tomorrowStr;
    targetEndDate = tomorrowStr;
    targetTime = '';
    targetAllDay = true;
    targetDesc = `demain (toute la journée)`;
  } else if (mode === 'backlog') {
    targetDate = null;
    targetEndDate = null;
    targetTime = '';
    targetAllDay = false;
    targetDesc = `dans le Backlog`;
  }

  executeSubtasksRolloverCore({
    targetDate,
    targetEndDate,
    targetTime,
    targetAllDay,
    targetDesc
  });
}

function executeSubtasksRolloverCore({ targetDate, targetEndDate, targetTime, targetAllDay, targetDesc }) {
  if (!currentSubtasksParentId) return;
  const allTasks = window.SpanPlanState.tasks;
  const parent = allTasks.find(t => t.id === currentSubtasksParentId);
  if (!parent || !Array.isArray(parent.subtasks)) return;

  const unfinished = parent.subtasks.filter(s => !s.completed);
  if (unfinished.length === 0) {
    if (typeof showToast === 'function') showToast('Aucune sous-tâche restante à reporter', 'info');
    return;
  }

  const completedSubtasks = parent.subtasks.filter(s => s.completed);
  const markParentDone = document.getElementById('rolloverMarkParentDone') ? document.getElementById('rolloverMarkParentDone').checked : true;
  const titleInput = document.getElementById('rolloverNewTitle');
  const newTitle = (titleInput && titleInput.value.trim()) ? titleInput.value.trim() : `${parent.title} (suite)`;

  // 1. Mettre à jour le parent : ne garder que les terminées et marquer done si souhaité
  parent.subtasks = completedSubtasks;
  if (markParentDone) {
    parent.completed = true;
  }
  parent.updated_at = new Date().toISOString();

  // 2. Créer le nouveau bloc pour la suite
  const newTaskId = 'task_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
  const continuationTask = {
    id: newTaskId,
    title: newTitle,
    date: targetDate,
    endDate: targetEndDate,
    time: targetTime,
    duration: parent.duration || 60,
    allDay: targetAllDay,
    type: parent.type || 'task',
    context: parent.context || 'work',
    completed: false,
    subtasks: unfinished.map(s => ({ ...s, completed: false })),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  allTasks.push(continuationTask);

  // 3. Mettre à jour Focus (span_tasks)
  const movedIds = new Set(unfinished.map(s => String(s.id || '')).filter(Boolean));
  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks')) || [];
    if (Array.isArray(focusTasks)) {
      focusTasks.forEach(ft => {
        const matchesId = ft.id && movedIds.has(String(ft.id));
        if (matchesId) {
          ft.parentEventId = continuationTask.id;
          ft.date = targetDate;
          ft.time = targetTime;
        }
      });
      localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
    }
  } catch (err) {}

  syncSubtasksToFocus(parent);
  syncSubtasksToFocus(continuationTask);

  savePlanState();
  if (typeof syncPlanToCloud === 'function') syncPlanToCloud();

  closeSubtasksModal();

  if (typeof showToast === 'function') {
    showToast(`Suite créée : "${newTitle}" (${targetDesc})`, 'success');
  }
}


// ==============================================================
// TASK CONTEXT MENU & POPOVER
// ==============================================================
// POPOVER
function openTaskPopover(e, id) {
  popoverTargetTaskId = id;
  const menu = document.getElementById('taskPopoverMenu');
  if (!menu) return;

  const task = window.SpanPlanState.tasks.find(t => t.id === id);

  const rolloverItem = document.getElementById('popoverItemRollover');
  if (rolloverItem) {
    const hasUnfinishedSubtasks = task && Array.isArray(task.subtasks) && task.subtasks.some(s => !s.completed);
    rolloverItem.style.display = hasUnfinishedSubtasks ? 'block' : 'none';
  }

  const importantText = document.getElementById('popoverImportantText');
  if (importantText) {
    importantText.textContent = (task && task.important) ? "Retirer l'importance (I)" : "Marquer comme important (I)";
  }

  // Update action picker buttons in popover
  const currentAction = (task && task.actionType) ? task.actionType : 'auto';
  menu.querySelectorAll('.popover-action-btn').forEach(btn => {
    btn.classList.toggle('active', btn.classList.contains(`chip-${currentAction}`));
  });

  const btnRect = e.currentTarget.getBoundingClientRect();
  menu.style.display = 'flex';
  
  const top = btnRect.bottom + 4;
  const left = Math.min(window.innerWidth - 180, btnRect.left - 130);
  menu.style.top = `${top}px`;
  menu.style.left = `${Math.max(10, left)}px`;
}

function popoverSetActionType(action) {
  if (!popoverTargetTaskId) return;
  setPlanTaskAction(popoverTargetTaskId, action);
  closeTaskPopover();
}
window.popoverSetActionType = popoverSetActionType;

function closeTaskPopover() {
  const menu = document.getElementById('taskPopoverMenu');
  if (menu) menu.style.display = 'none';
  popoverTargetTaskId = null;
}

function handleBackdropClick(event, modalId) {
  if (event.target.id === modalId) {
    document.getElementById(modalId).style.display = 'none';
  }
}

document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#calendarQuickAddPopover')) return;
  // Clic sur un événement existant, un ruban all-day, un item de backlog ou la barre de titre
  if (e.target.closest('.schedule-block-item') || 
      e.target.closest('.cal-allday-ribbon') || 
      e.target.closest('.task-item') || 
      e.target.closest('.app-header') || 
      e.target.closest('.app-sidebar')) {
    closeQuickAddPopover();
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#taskPopoverMenu') && !e.target.closest('.btn-task-menu')) {
    closeTaskPopover();
  }
  if (!e.target.closest('#calendarQuickAddPopover')) {
    // Si ce n'est pas un clic direct sur le canvas pour créer un slot, fermer le popover
    if (!e.target.classList.contains('schedule-grid-canvas') && !e.target.classList.contains('canvas-hour-slot')) {
      closeQuickAddPopover();
    }
  }
  if (!e.target.closest('.schedule-block-item.is-expanded') && !e.target.closest('.subtasks-unfold-btn') && !e.target.closest('.subtasks-mini-unfold-btn')) {
    if (window.expandedBlockAccordionIds && window.expandedBlockAccordionIds.size > 0) {
      window.expandedBlockAccordionIds.clear();
      document.querySelectorAll('.schedule-block-item.is-expanded').forEach(b => {
        b.classList.remove('is-expanded');
        const btn = b.querySelector('.subtasks-unfold-btn');
        if (btn) {
          const remaining = parseInt(b.dataset.overflowCount || '1', 10);
          btn.innerHTML = `<span class="unfold-btn-text">+${remaining} autre${remaining > 1 ? 's' : ''}</span><span class="unfold-btn-arrow">▾</span>`;
          btn.title = 'Déplier toutes les sous-tâches';
        }
        const miniBtn = b.querySelector('.subtasks-mini-unfold-btn');
        if (miniBtn) {
          miniBtn.textContent = '▾';
          miniBtn.title = 'Déplier sous-tâches';
        }
      });
    }
  }
});

window.addEventListener('keydown', (e) => {
  const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;

  // Escape: fermer tous les menus et popovers
  if (e.key === 'Escape') {
    closeQuickAddPopover();
    closeTaskPopover();
    if (window.expandedBlockAccordionIds && window.expandedBlockAccordionIds.size > 0) {
      window.expandedBlockAccordionIds.clear();
      document.querySelectorAll('.schedule-block-item.is-expanded').forEach(b => b.classList.remove('is-expanded'));
    }
    if (typeof closeEditModal === 'function') closeEditModal();
    if (typeof toggleQuickAddBar === 'function') toggleQuickAddBar(false);
    return;
  }

  // ↵ Enter dans la modale d'édition : sauvegarder immédiatement (sauf saut de ligne standard dans le textarea de notes)
  const editModal = document.getElementById('editModalOverlay');
  const isEditModalOpen = editModal && window.getComputedStyle(editModal).display !== 'none';
  if (isEditModalOpen && e.key === 'Enter') {
    const isNotesTextarea = e.target && e.target.id === 'editTaskNotes';
    if (!isNotesTextarea || (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveTaskModal();
      return;
    }
  }

  // ⌘B / Ctrl+B: Toggle Sidebar
  if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
    e.preventDefault();
    toggleSidebar();
    return;
  }

  // ⌘K / Ctrl+K: Quick add bar
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    toggleQuickAddBar();
    return;
  }

  // ⌘C / Ctrl+C : Copier la tâche sélectionnée
  if (!isTyping && (e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
    if (copySelectedPlanTask()) {
      e.preventDefault();
      return;
    }
  }

  // ⌘V / Ctrl+V : Coller la tâche copiée sur le créneau ciblé
  if (!isTyping && (e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) {
    if (pastePlanTask()) {
      e.preventDefault();
      return;
    }
  }

  // Raccourcis une touche (hors saisie)
  if (!isTyping && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (e.key === 'i' || e.key === 'I' || e.key === '!') {
      e.preventDefault();
      toggleSelectedTasksImportant();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedTaskIds && selectedTaskIds.size > 0) {
        e.preventDefault();
        deleteSelectedTasks();
      }
    } else if (e.key === 'Enter') {
      if (selectedTaskIds && selectedTaskIds.size === 1) {
        e.preventDefault();
        const singleId = Array.from(selectedTaskIds)[0];
        openEditModal(singleId);
      }
    } else if (e.key === '[') {
      e.preventDefault();
      toggleSidebar();
    } else if (e.key === '1') {
      e.preventDefault();
      setVisibleDays(1);
    } else if (e.key === '3') {
      e.preventDefault();
      setVisibleDays(3);
    } else if (e.key === '5') {
      e.preventDefault();
      setVisibleDays(5);
    } else if (e.key === '7') {
      e.preventDefault();
      setVisibleDays(7);
    } else if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      jumpToToday();
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      toggleQuickAddBar(true);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateTimeline(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigateTimeline(1);
    }
  }
});

function toggleSelectedTasksImportant() {
  const targetIds = (selectedTaskIds && selectedTaskIds.size > 0)
    ? Array.from(selectedTaskIds)
    : (popoverTargetTaskId ? [popoverTargetTaskId] : []);

  if (targetIds.length === 0) {
    if (typeof showToast === 'function') {
      showToast("Sélectionnez d'abord un élément pour marquer son importance (Touche I)", 'info');
    }
    return;
  }

  const tasks = window.SpanPlanState.tasks.filter(t => targetIds.includes(t.id));
  if (tasks.length === 0) return;

  const hasUnimportant = tasks.some(t => !t.important);
  const newStatus = hasUnimportant;

  tasks.forEach(t => {
    t.important = newStatus;
    t.updated_at = new Date().toISOString();
  });

  savePlanState();

  if (typeof showToast === 'function') {
    const msg = newStatus
      ? (tasks.length > 1 ? `${tasks.length} éléments marqués importants !` : `"${tasks[0].title}" marqué important !`)
      : (tasks.length > 1 ? `Importance retirée pour ${tasks.length} éléments` : `Importance retirée`);
    showToast(msg, 'info');
  }
}
window.toggleSelectedTasksImportant = toggleSelectedTasksImportant;

function popoverAction(action) {
  const id = popoverTargetTaskId;
  closeTaskPopover();
  if (!id) return;

  if (action === 'edit') {
    openEditModal(id);
  } else if (action === 'toggle-important') {
    const task = window.SpanPlanState.tasks.find(t => t.id === id);
    if (task) {
      task.important = !task.important;
      task.updated_at = new Date().toISOString();
      savePlanState();
      if (typeof showToast === 'function') {
        showToast(task.important ? 'Marqué important !' : 'Importance retirée', 'info');
      }
    }
    return;
  } else if (action === 'rollover') {
    openSubtasksModal(id);
    setTimeout(() => toggleSubtasksRolloverPanel(true), 60);
    return;
  } else if (action === 'today') {
    scheduleTaskDirectly(id, TODAY_STR);
    if (typeof showToast === 'function') {
      showToast('Scheduled for Today', 'success');
    }
  } else if (action === 'toggle-type') {
    const task = window.SpanPlanState.tasks.find(t => t.id === id);
    if (task) {
      task.type = (task.type === 'event') ? 'task' : 'event';
      savePlanState();
      if (typeof showToast === 'function') {
        const label = task.type === 'event' ? 'Converted to Event 📅' : 'Converted to Task 📋';
        showToast(label, 'info');
      }
    }
  } else if (action === 'attach-subtask') {
    const task = window.SpanPlanState.tasks.find(t => t.id === id);
    if (!task) return;
    const sameDayBlocks = window.SpanPlanState.tasks.filter(t => 
      t.id !== task.id && 
      (t.date === task.date || (!task.date && t.date === TODAY_STR)) &&
      (t.time || t.allDay)
    );
    if (sameDayBlocks.length === 0) {
      if (typeof showToast === 'function') showToast("Aucun autre bloc disponible pour y attacher cette tâche", 'warning');
      return;
    }
    const blockNames = sameDayBlocks.map((b, i) => `${i + 1}. ${b.title || 'Sans titre'} (${b.time || 'Toute la journée'})`).join('\n');
    const choice = prompt(`Choisir le numéro du bloc auquel rattacher "${task.title}" :\n\n${blockNames}`);
    if (choice) {
      const idx = parseInt(choice, 10) - 1;
      if (idx >= 0 && idx < sameDayBlocks.length) {
        const targetBlock = sameDayBlocks[idx];
        if (attachTaskAsSubtask(task.id, targetBlock.id)) {
          if (!window.expandedBlockAccordionIds) window.expandedBlockAccordionIds = new Set();
          window.expandedBlockAccordionIds.add(targetBlock.id);
          savePlanState();
          if (typeof showToast === 'function') {
            showToast(`"${task.title}" attachée en sous-tâche à "${targetBlock.title}"`, 'success');
          }
        }
      }
    }
    return;
  } else if (action === 'focus') {
    pushToSpanFocus(id);
  } else if (action === 'backlog') {
    moveToBacklog(id);
    if (typeof showToast === 'function') {
      showToast('Moved to Backlog', 'info');
    }
  } else if (action === 'delete') {
    deleteTask(id);
    if (typeof showToast === 'function') {
      showToast('Item deleted', 'info');
    }
  }
}

// ==============================================================
// SUBTASKS, SHORTCUTS, QUICK ADD & EDIT MODALS
// ==============================================================
// ==============================================================
// MODALE INTERACTIVE D'APERÇU DES SOUS-TÂCHES
// ==============================================================
var currentSubtasksParentId = null;

function openSubtasksModal(taskId, focusInput = false, targetSubtaskId = null) {
  const task = window.SpanPlanState.tasks.find(t => t.id === taskId);
  if (!task) return;

  // Dédupliquer les sous-tâches si des doublons ont été accidentellement insérés
  if (Array.isArray(task.subtasks) && task.subtasks.length > 1) {
    const seenTitles = new Set();
    const deduped = [];
    task.subtasks.forEach(s => {
      const key = (s.title || '').trim().toLowerCase();
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        deduped.push(s);
      }
    });
    if (deduped.length !== task.subtasks.length) {
      task.subtasks = deduped;
      task.updated_at = new Date().toISOString();
      savePlanState();
      if (typeof syncSubtasksToFocus === 'function') {
        syncSubtasksToFocus(task);
      }
    }
  }

  currentSubtasksParentId = taskId;
  const overlay = document.getElementById('subtasksModalOverlay');
  const typeBadge = document.getElementById('subtasksTypeBadge');
  const titleText = document.getElementById('subtasksTitleText');

  if (typeBadge) typeBadge.textContent = task.type === 'event' ? 'Event' : 'Task';
  if (titleText) titleText.textContent = task.title;

  renderSubtasksModalList();
  if (overlay) overlay.style.display = 'flex';

  if (targetSubtaskId) {
    setTimeout(() => {
      enableSubtaskInlineEdit(null, targetSubtaskId);
      const row = document.querySelector(`.subtask-interactive-row[data-subtask-id="${targetSubtaskId}"]`);
      if (row) {
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        row.classList.add('subtask-highlight-pulse');
        setTimeout(() => row.classList.remove('subtask-highlight-pulse'), 1500);
      }
    }, 60);
  } else if (focusInput) {
    setTimeout(() => {
      const input = document.getElementById('subtasksInlineAddInput');
      if (input) {
        input.focus();
        input.select();
      }
    }, 60);
  }
}
window.openSubtasksModal = openSubtasksModal;

function quickAddSubtaskFromBlock(taskId) {
  openSubtasksModal(taskId, true);
}
window.quickAddSubtaskFromBlock = quickAddSubtaskFromBlock;

function closeSubtasksModal() {
  const overlay = document.getElementById('subtasksModalOverlay');
  if (overlay) overlay.style.display = 'none';
  const rolloverPanel = document.getElementById('subtasksRolloverPanel');
  if (rolloverPanel) rolloverPanel.style.display = 'none';
  currentSubtasksParentId = null;
  renderCalendar();
}
window.closeSubtasksModal = closeSubtasksModal;

function renderSubtasksModalList() {
  const listEl = document.getElementById('subtasksChecklistItems');
  const textEl = document.getElementById('subtasksProgressText');
  const pctEl = document.getElementById('subtasksProgressPercent');
  const fillEl = document.getElementById('subtasksProgressFill');
  if (!listEl || !currentSubtasksParentId) return;

  const parent = window.SpanPlanState.tasks.find(t => t.id === currentSubtasksParentId);
  if (!parent) return;

  const subtasks = Array.isArray(parent.subtasks) ? parent.subtasks : [];
  const completedCount = subtasks.filter(s => s.completed).length;
  const totalCount = subtasks.length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const sortedSubtasks = [...subtasks].sort((a, b) => (a.completed ? 1 : 0) - (b.completed ? 1 : 0));

  if (textEl) textEl.textContent = `${completedCount} of ${totalCount} completed`;
  if (pctEl) pctEl.textContent = `${pct}%`;
  if (fillEl) fillEl.style.width = `${pct}%`;

  const unfinished = subtasks.filter(s => !s.completed);
  const rolloverBar = document.getElementById('subtasksRolloverActionBar');
  const rolloverBtnText = document.getElementById('subtasksRolloverBtnText');
  const batchCountEl = document.getElementById('subtasksBatchDragCount');
  const rolloverPanel = document.getElementById('subtasksRolloverPanel');
  const rolloverTitleInput = document.getElementById('rolloverNewTitle');

  if (rolloverBar) {
    if (unfinished.length > 0) {
      rolloverBar.style.display = 'flex';
      if (rolloverBtnText) {
        rolloverBtnText.textContent = `Reporter les ${unfinished.length} restante${unfinished.length > 1 ? 's' : ''}...`;
      }
      if (batchCountEl) {
        batchCountEl.textContent = `${unfinished.length} restante${unfinished.length > 1 ? 's' : ''}`;
      }
      if (rolloverTitleInput && (!rolloverTitleInput.value || rolloverTitleInput.dataset.parentId !== currentSubtasksParentId)) {
        rolloverTitleInput.value = `${parent.title} (suite)`;
        rolloverTitleInput.dataset.parentId = currentSubtasksParentId;
      }
    } else {
      rolloverBar.style.display = 'none';
      if (rolloverPanel) rolloverPanel.style.display = 'none';
    }
  }

  if (subtasks.length === 0) {
    listEl.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 18px 0;">No subtasks yet</div>`;
    return;
  }

  listEl.innerHTML = sortedSubtasks.map(sub => {
    const subAction = getTaskActionType(sub);
    let subActionIcon = '⚡';
    let subActionLabel = 'Auto';
    if (subAction === 'call') { subActionIcon = '📞'; subActionLabel = 'Call'; }
    else if (subAction === 'mail') { subActionIcon = '✉️'; subActionLabel = 'Mail'; }
    else if (subAction === 'pay') { subActionIcon = '💳'; subActionLabel = 'Paiement'; }
    else if (sub.actionType === 'other') { subActionIcon = '📦'; subActionLabel = 'Standard'; }

    return `
    <div class="subtask-interactive-row ${sub.completed ? 'completed' : ''}" 
         data-subtask-id="${sub.id}"
         draggable="true"
         ondragstart="handleSubtaskDragStart(event, '${currentSubtasksParentId}', '${sub.id}')" 
         ondragend="handleSubtaskDragEnd(event)"
         ondragover="handleSubtaskRowDragOver(event, '${sub.id}')"
         ondragleave="handleSubtaskRowDragLeave(event)"
         ondrop="handleSubtaskRowDrop(event, '${sub.id}')"
         ondblclick="enableSubtaskInlineEdit(event, '${sub.id}')"
         title="Double-cliquer pour modifier, glisser pour déplacer">
      <span class="subtask-drag-handle">⠿</span>
      <button type="button" 
              class="subtask-cat-btn cat-${sub.context || parent.context || 'work'}" 
              onclick="event.stopPropagation(); cycleSubtaskContext('${sub.id}')" 
              title="Catégorie: ${sub.context || parent.context || 'work'} (cliquer pour changer)">
      </button>
      <button type="button" 
              class="subtask-action-btn action-${subAction}" 
              onclick="event.stopPropagation(); cycleSubtaskActionType('${sub.id}')" 
              title="Type d'action: ${subActionLabel} (cliquer pour changer)">
        ${subActionIcon}
      </button>
      <div class="subtask-checkbox ${sub.completed ? 'checked' : ''}" 
           onclick="event.stopPropagation(); handleSubtaskModalToggle('${sub.id}')"
           title="${sub.completed ? 'Marquer comme non fait' : 'Marquer comme fait'}">
        ${sub.completed ? '✓' : ''}
      </div>
      <span class="subtask-title-display ${sub.completed ? 'completed' : ''}" 
            onclick="enableSubtaskInlineEdit(event, '${sub.id}')"
            title="Cliquer pour modifier, glisser pour déplacer">
        ${escapeHtml(sub.title)}
      </span>
      <input type="text" 
             class="subtask-title-input ${sub.completed ? 'completed' : ''}" 
             id="subtask_input_${sub.id}"
             value="${escapeHtml(sub.title)}" 
             placeholder="Nom de la sous-tâche..."
             style="display: none;"
             onclick="event.stopPropagation()"
             onblur="saveSubtaskInlineEdit('${sub.id}', this.value)"
             onkeydown="handleSubtaskInputKey(event, '${sub.id}')">
      <button type="button" 
              class="subtask-edit-btn" 
              onclick="event.stopPropagation(); enableSubtaskInlineEdit(event, '${sub.id}')" 
              title="Modifier le nom">✏️</button>
      <button type="button" 
              class="subtask-backlog-btn" 
              onclick="event.stopPropagation(); moveSubtaskToBacklog('${currentSubtasksParentId}', '${sub.id}')" 
              title="Déplacer dans le Backlog">📥</button>
      <button type="button" 
              class="subtask-detach-btn" 
              onclick="event.stopPropagation(); detachSubtaskToDay('${sub.id}')" 
              title="Détacher en événement toute la journée sans heure">📅</button>
      <button type="button" 
              class="subtask-delete-btn" 
              onclick="event.stopPropagation(); deleteSubtask('${sub.id}')" 
              title="Supprimer la sous-tâche">✕</button>
    </div>
  `;}).join('');
}

function enableSubtaskInlineEdit(event, subtaskId) {
  if (event) event.stopPropagation();
  const row = document.querySelector(`.subtask-interactive-row[data-subtask-id="${subtaskId}"]`);
  if (!row) return;
  const displaySpan = row.querySelector('.subtask-title-display');
  const inputEl = row.querySelector('.subtask-title-input');
  if (!displaySpan || !inputEl) return;

  row.setAttribute('draggable', 'false');
  displaySpan.style.display = 'none';
  inputEl.style.display = 'block';
  inputEl.focus();
  inputEl.select();
}

function saveSubtaskInlineEdit(subtaskId, newTitle) {
  const row = document.querySelector(`.subtask-interactive-row[data-subtask-id="${subtaskId}"]`);
  if (row) row.setAttribute('draggable', 'true');
  updateSubtaskTitle(subtaskId, newTitle);
  renderSubtasksModalList();
}

function handleSubtaskInputKey(event, subtaskId) {
  if (event.key === 'Enter') {
    event.target.blur();
  } else if (event.key === 'Escape') {
    const row = document.querySelector(`.subtask-interactive-row[data-subtask-id="${subtaskId}"]`);
    if (row) row.setAttribute('draggable', 'true');
    renderSubtasksModalList();
  }
}

var draggedOverSubtaskId = null;

function handleSubtaskRowDragOver(e, targetSubtaskId) {
  if (!window.draggedSubtaskInfo) return;
  const { parentId, subtaskId } = window.draggedSubtaskInfo;
  if (parentId !== currentSubtasksParentId) return;
  if (subtaskId === targetSubtaskId) return;

  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

  if (draggedOverSubtaskId !== targetSubtaskId) {
    document.querySelectorAll('.subtask-interactive-row.drag-over-row').forEach(r => r.classList.remove('drag-over-row'));
    const targetRow = document.querySelector(`.subtask-interactive-row[data-subtask-id="${targetSubtaskId}"]`);
    if (targetRow) targetRow.classList.add('drag-over-row');
    draggedOverSubtaskId = targetSubtaskId;
  }
}

function handleSubtaskRowDragLeave(e) {
  if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
  e.currentTarget.classList.remove('drag-over-row');
  if (draggedOverSubtaskId === e.currentTarget.dataset.subtaskId) {
    draggedOverSubtaskId = null;
  }
}

function handleSubtaskRowDrop(e, targetSubtaskId) {
  if (!window.draggedSubtaskInfo) return;
  const { parentId, subtaskId } = window.draggedSubtaskInfo;
  if (parentId !== currentSubtasksParentId) return;
  if (subtaskId === targetSubtaskId) return;

  e.preventDefault();
  e.stopPropagation();

  document.querySelectorAll('.subtask-interactive-row.drag-over-row').forEach(r => r.classList.remove('drag-over-row'));
  draggedOverSubtaskId = null;

  const allTasks = window.SpanPlanState.tasks;
  const parent = allTasks.find(t => t.id === currentSubtasksParentId);
  if (!parent || !Array.isArray(parent.subtasks)) {
    handleSubtaskDragEnd(e);
    return;
  }

  const fromIndex = parent.subtasks.findIndex(s => String(s.id) === String(subtaskId));
  const toIndex = parent.subtasks.findIndex(s => String(s.id) === String(targetSubtaskId));

  if (fromIndex !== -1 && toIndex !== -1) {
    const [moved] = parent.subtasks.splice(fromIndex, 1);
    parent.subtasks.splice(toIndex, 0, moved);
    parent.updated_at = new Date().toISOString();
    savePlanState();
    syncSubtasksToFocus(parent);
  }

  handleSubtaskDragEnd(e);
  renderSubtasksModalList();
}

function handleSubtaskModalToggle(subtaskId) {
  if (!currentSubtasksParentId) return;
  toggleSubtaskCompletion(currentSubtasksParentId, subtaskId);
  const parent = window.SpanPlanState.tasks.find(t => t.id === currentSubtasksParentId);
  syncSubtasksToFocus(parent);
  renderSubtasksModalList();
}

function updateSubtaskTitle(subtaskId, newTitle) {
  if (!currentSubtasksParentId) return;
  const parent = window.SpanPlanState.tasks.find(t => t.id === currentSubtasksParentId);
  if (!parent || !Array.isArray(parent.subtasks)) return;

  const sub = parent.subtasks.find(s => String(s.id) === String(subtaskId));
  if (!sub) return;

  const trimmed = (newTitle || '').trim();
  if (trimmed && trimmed !== sub.title) {
    sub.title = trimmed;
    savePlanState();
    syncSubtasksToFocus(parent);
    if (typeof showToast === 'function') {
      showToast('Subtask updated', 'info');
    }
  }
}

function cycleSubtaskContext(subtaskId) {
  if (!currentSubtasksParentId) return;
  const parent = window.SpanPlanState.tasks.find(t => t.id === currentSubtasksParentId);
  if (!parent || !Array.isArray(parent.subtasks)) return;

  const sub = parent.subtasks.find(s => String(s.id) === String(subtaskId));
  if (!sub) return;

  const contexts = ['work', 'life', 'fun'];
  const currentCtx = sub.context || parent.context || 'work';
  const nextIdx = (contexts.indexOf(currentCtx) + 1) % contexts.length;
  sub.context = contexts[nextIdx];

  savePlanState();
  syncSubtasksToFocus(parent);
  renderSubtasksModalList();
}

function cycleSubtaskActionType(subtaskId) {
  if (!currentSubtasksParentId) return;
  const parent = window.SpanPlanState.tasks.find(t => t.id === currentSubtasksParentId);
  if (!parent || !Array.isArray(parent.subtasks)) return;

  const sub = parent.subtasks.find(s => String(s.id) === String(subtaskId));
  if (!sub) return;

  // Cycle: auto (null) -> call -> mail -> pay -> other (standard) -> auto
  const currentAction = sub.actionType || 'auto';
  const order = ['auto', 'call', 'mail', 'pay', 'other'];
  const nextIdx = (order.indexOf(currentAction) + 1) % order.length;
  const nextAction = order[nextIdx];

  sub.actionType = nextAction === 'auto' ? null : nextAction;
  parent.updated_at = new Date().toISOString();

  savePlanState();
  syncSubtasksToFocus(parent);
  renderSubtasksModalList();
  renderCalendar();
  if (typeof showToast === 'function') {
    const labels = {
      auto: '⚡ Action: Détection auto',
      call: '📞 Action: Call',
      mail: '✉️ Action: Mail',
      pay: '💳 Action: Paiement',
      other: '📦 Action: Standard'
    };
    showToast(labels[nextAction] || 'Action modifiée', 'info');
  }
}
window.cycleSubtaskActionType = cycleSubtaskActionType;

function deleteSubtask(subtaskId) {
  if (!currentSubtasksParentId) return;
  const parent = window.SpanPlanState.tasks.find(t => t.id === currentSubtasksParentId);
  if (!parent || !Array.isArray(parent.subtasks)) return;

  const subToDelete = parent.subtasks.find(s => String(s.id) === String(subtaskId));
  if (subToDelete) {
    const subTitle = (subToDelete.title || '').trim().toLowerCase();

    // 1. Marquer comme supprimé par son identifiant unique
    const keys = [];
    if (subToDelete.id) keys.push(subToDelete.id);
    addDismissedTaskIds(keys);

    // Sync avec le registre Focus (span_deleted_task_ids)
    try {
      const deletedSet = new Set(JSON.parse(localStorage.getItem('span_deleted_task_ids') || '[]'));
      keys.forEach(k => deletedSet.add(String(k)));
      localStorage.setItem('span_deleted_task_ids', JSON.stringify(Array.from(deletedSet)));
    } catch (e) {}

    // 2. Nettoyer de span_tasks (Focus)
    try {
      let focusTasks = JSON.parse(localStorage.getItem('span_tasks')) || [];
      if (Array.isArray(focusTasks)) {
        const cleaned = focusTasks.filter(ft => 
          String(ft.id) !== String(subtaskId) && 
          (!ft.title || ft.title.trim().toLowerCase() !== subTitle)
        );
        localStorage.setItem('span_tasks', JSON.stringify(cleaned));
      }
    } catch (e) {}

    // 3. Supprimer toutes les occurrences de cette sous-tâche dans le parent
    parent.subtasks = parent.subtasks.filter(s => 
      String(s.id) !== String(subtaskId) && 
      (!subTitle || (s.title || '').trim().toLowerCase() !== subTitle)
    );
  } else {
    parent.subtasks = parent.subtasks.filter(s => String(s.id) !== String(subtaskId));
  }

  parent.updated_at = new Date().toISOString();
  savePlanState();
  syncSubtasksToFocus(parent);
  if (typeof syncPlanToCloud === 'function') syncPlanToCloud();
  renderSubtasksModalList();
  if (typeof showToast === 'function') {
    showToast('Subtask deleted', 'info');
  }
}

function syncSubtasksToFocus(parent) {
  if (!parent) return;
  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks'));
    if (!Array.isArray(focusTasks)) return;

    const parentId = parent.focusId || parent.id;
    focusTasks = focusTasks.filter(ft => ft.parentEventId !== parentId && ft.parentEventId !== parent.id);

    const catCapMap = { work: 'Work', life: 'Home', fun: 'Fun' };

    (parent.subtasks || []).forEach(st => {
      let subCtx = 'work';
      if (/#(life|perso|home)\b/i.test(st.title)) subCtx = 'life';
      else if (/#(fun|sport)\b/i.test(st.title)) subCtx = 'fun';
      else if (st.context) subCtx = normalizePlanContext(st.context);
      else if (st.category) subCtx = normalizePlanContext(st.category);
      else if (parent.context) subCtx = normalizePlanContext(parent.context);

      focusTasks.push({
        id: st.id,
        title: st.title,
        completed: !!st.completed,
        category: catCapMap[subCtx] || 'Work',
        actionType: st.actionType || null,
        estimate: 1,
        duration: 30,
        isEvent: false,
        isFavorite: false,
        parentEventId: parentId,
        scheduledDate: parent.date || null,
        scheduledTime: null
      });
    });

    localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
  } catch (e) {}
}

function toggleQuickAddBar(forceOpen = null) {
  const container = document.getElementById('quickAddContainer') || document.querySelector('.quick-add-container');
  if (!container) return;
  const isCurrentlyOpen = container.classList.contains('is-visible');
  const shouldOpen = (forceOpen !== null) ? forceOpen : !isCurrentlyOpen;
  
  container.classList.toggle('is-visible', shouldOpen);
  if (shouldOpen) {
    const input = document.getElementById('quickTaskInput');
    if (input) {
      setTimeout(() => {
        input.focus();
        input.select();
      }, 60);
    }
  }
}

function submitSubtaskInlineAdd() {
  const input = document.getElementById('subtasksInlineAddInput');
  if (!input || !currentSubtasksParentId) return;
  const title = input.value.trim();
  if (!title) return;

  const parent = window.SpanPlanState.tasks.find(t => t.id === currentSubtasksParentId);
  if (!parent) return;

  let subCtx = 'work';
  if (/#(life|perso|home)\b/i.test(title)) subCtx = 'life';
  else if (/#(fun|sport)\b/i.test(title)) subCtx = 'fun';
  else if (/#(work|code|pro)\b/i.test(title)) subCtx = 'work';
  else if (currentContextFilter !== 'all') subCtx = normalizePlanContext(currentContextFilter);
  else subCtx = normalizePlanContext(parent.context || 'work');

  if (!Array.isArray(parent.subtasks)) parent.subtasks = [];
  const newSub = {
    id: 'sub_' + Date.now(),
    title: title,
    completed: false,
    context: subCtx,
    actionType: null
  };
  parent.subtasks.push(newSub);
  input.value = '';
  savePlanState();
  syncSubtasksToFocus(parent);
  renderSubtasksModalList();
  renderCalendar();
  setTimeout(() => input.focus(), 30);
}

function editParentFromSubtasksModal() {
  const parentId = currentSubtasksParentId;
  closeSubtasksModal();
  if (parentId) {
    openEditModal(parentId);
  }
}

// ==============================================================
// MODALE RACCOURCIS CLAVIER (?)
// ==============================================================
function openShortcutsModal() {
  const modal = document.getElementById('shortcutsModalOverlay');
  if (modal) modal.style.display = 'flex';
}

function closeShortcutsModal() {
  const modal = document.getElementById('shortcutsModalOverlay');
  if (modal) modal.style.display = 'none';
}

// ==============================================================
// QUICK-ADD POPOVER (GOOGLE CALENDAR SIGNATURE EXPERIENCE)
// ==============================================================
var quickAddState = {
  dateStr: TODAY_STR,
  timeStr: '09:00',
  type: 'event',
  context: 'work'
};

var quickAddPopoverAction = 'auto';

function setQuickAddPopoverAction(action) {
  quickAddPopoverAction = action || 'auto';
  document.querySelectorAll('#quickAddPopoverActionChips .quick-action-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.action === quickAddPopoverAction);
  });
}
window.setQuickAddPopoverAction = setQuickAddPopoverAction;

function openQuickAddPopover(dateStr, timeStr, clickX, clickY) {
  closeQuickAddPopover();
  if (selectedTaskIds.size > 0 && marqueeMoved) return;

  const popover = document.getElementById('calendarQuickAddPopover');
  if (!popover) {
    openCreateModalWithDefaults(dateStr, timeStr);
    return;
  }

  quickAddState.dateStr = dateStr || TODAY_STR;
  quickAddState.timeStr = timeStr || '09:00';
  quickAddState.type = 'event';
  quickAddState.context = currentContextFilter === 'all' ? 'work' : normalizePlanContext(currentContextFilter);
  setQuickAddPopoverAction('auto');

  // Preview date & horaire (durée par défaut : 30 minutes)
  const [hStr, mStr] = (quickAddState.timeStr || '09:00').split(':');
  const startMin = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
  const endMin = Math.min(23 * 60 + 59, startMin + 30);
  const endH = String(Math.floor(endMin / 60)).padStart(2, '0');
  const endM = String(endMin % 60).padStart(2, '0');
  const timeRangePreview = `${quickAddState.timeStr} – ${endH}:${endM}`;

  let dateLabel = 'Today';
  try {
    const [y, m, d] = quickAddState.dateStr.split('-').map(Number);
    const dObj = new Date(y, m - 1, d);
    const dayName = dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    dateLabel = (quickAddState.dateStr === TODAY_STR) ? `Today (${dayName})` : dayName;
  } catch (err) {
    dateLabel = quickAddState.dateStr;
  }

  const timePreviewEl = document.getElementById('quickAddTimePreview');
  if (timePreviewEl) {
    timePreviewEl.textContent = `${dateLabel} • ${timeRangePreview}`;
  }

  const titleInput = document.getElementById('quickAddTitleInput');
  if (titleInput) {
    titleInput.value = '';
  }

  updateQuickAddTypeVisuals();
  updateQuickAddCategoryVisuals();

  // Positionnement du popover (clamped à la fenêtre)
  const popWidth = 320;
  const popHeight = 185;
  let left = (clickX || window.innerWidth / 2) + 14;
  let top = (clickY || window.innerHeight / 2) - 40;

  if (left + popWidth > window.innerWidth - 16) {
    left = (clickX || window.innerWidth / 2) - popWidth - 14;
  }
  if (left < 16) left = 16;

  if (top + popHeight > window.innerHeight - 16) {
    top = window.innerHeight - popHeight - 16;
  }
  if (top < 65) top = 65;

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.style.display = 'flex';

  setTimeout(() => {
    if (titleInput) {
      titleInput.focus();
      titleInput.select();
    }
  }, 40);
}

function closeQuickAddPopover() {
  const popover = document.getElementById('calendarQuickAddPopover');
  if (popover) {
    popover.style.display = 'none';
  }
}

function setQuickAddType(type) {
  quickAddState.type = (type === 'event') ? 'event' : 'task';
  updateQuickAddTypeVisuals();
}

function updateQuickAddTypeVisuals() {
  const btnEvent = document.getElementById('quickTypeEvent');
  const btnTask = document.getElementById('quickTypeTask');
  if (btnEvent && btnTask) {
    btnEvent.classList.toggle('active', quickAddState.type === 'event');
    btnTask.classList.toggle('active', quickAddState.type === 'task');
  }
}

function setQuickAddCategory(cat) {
  quickAddState.context = normalizePlanContext(cat);
  updateQuickAddCategoryVisuals();
}

function updateQuickAddCategoryVisuals() {
  document.querySelectorAll('#quickAddCatChips .quick-cat-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.context === quickAddState.context);
  });
}

function saveQuickAdd() {
  const titleInput = document.getElementById('quickAddTitleInput');
  const title = (titleInput ? titleInput.value : '').trim();
  if (!title) {
    if (titleInput) titleInput.focus();
    return;
  }

  let isImportant = false;
  let cleanTitle = title;
  if (cleanTitle.endsWith('!') || /\s!($|\s)/.test(cleanTitle) || /#important\b/i.test(cleanTitle)) {
    isImportant = true;
    if (cleanTitle.endsWith('!')) cleanTitle = cleanTitle.slice(0, -1).trim();
  }

  const date = quickAddState.dateStr || TODAY_STR;
  const time = quickAddState.timeStr || '09:00';
  const duration = 30;
  const type = quickAddState.type || 'event';
  const context = quickAddState.context || 'work';

  const newItem = {
    id: 'plan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    title: cleanTitle,
    date: date,
    time: time,
    duration: duration,
    context: context,
    type: type,
    actionType: (quickAddPopoverAction === 'auto') ? null : quickAddPopoverAction,
    completed: false,
    important: isImportant,
    subtasks: []
  };

  window.SpanPlanState.tasks.push(newItem);
  savePlanState();
  closeQuickAddPopover();
  if (typeof showToast === 'function') {
    showToast(`${type === 'event' ? '📅 Event' : '📋 Task'} added at ${time}`, 'success');
  }
}

function openFullEditFromQuickAdd() {
  const titleInput = document.getElementById('quickAddTitleInput');
  const title = (titleInput ? titleInput.value : '').trim();
  const date = quickAddState.dateStr || TODAY_STR;
  const time = quickAddState.timeStr || '09:00';
  const type = quickAddState.type || 'event';
  const context = quickAddState.context || 'work';

  closeQuickAddPopover();

  openCreateModalWithDefaults(date, time);
  if (title) {
    const editTitle = document.getElementById('editTaskTitle');
    if (editTitle) editTitle.value = title;
  }
  selectModalType(type);
  selectEditContext(context);
}

// ==============================================================
// CRÉATION ET ÉDITION VIA MODALE UNIFIÉE
// ==============================================================
function selectModalType(type) {
  editingItemType = (type === 'event') ? 'event' : 'task';
  const taskPill = document.getElementById('modalTypeTask');
  const eventPill = document.getElementById('modalTypeEvent');
  if (taskPill) taskPill.classList.toggle('active', editingItemType === 'task');
  if (eventPill) eventPill.classList.toggle('active', editingItemType === 'event');

  const headerSpan = document.getElementById('modalHeaderTitle') || document.querySelector('#editModalOverlay .modal-header span');
  if (headerSpan) {
    if (editingTaskId) {
      headerSpan.textContent = editingItemType === 'event' ? "Edit Event" : 'Edit Task';
    } else {
      headerSpan.textContent = editingItemType === 'event' ? "New Event" : 'New Task';
    }
  }
}

function toggleModalAllDay(isAllDay) {
  const rowTimes = document.getElementById('rowTaskTimes');
  const allDayCheck = document.getElementById('editTaskAllDay');
  if (allDayCheck) allDayCheck.checked = !!isAllDay;

  if (rowTimes) {
    rowTimes.style.display = isAllDay ? 'none' : 'flex';
  }
}

function handleModalStartDateChange() {
  const dateInput = document.getElementById('editTaskDate');
  const endDateInput = document.getElementById('editTaskEndDate');
  if (dateInput && endDateInput) {
    if (!endDateInput.value || endDateInput.value < dateInput.value) {
      endDateInput.value = dateInput.value;
    }
  }
  updateRecurrenceWeeklyLabel(dateInput ? dateInput.value : '');
}

function handleModalEndDateChange() {
  const dateInput = document.getElementById('editTaskDate');
  const endDateInput = document.getElementById('editTaskEndDate');
  const allDayCheck = document.getElementById('editTaskAllDay');

  if (dateInput && endDateInput && dateInput.value && endDateInput.value) {
    if (endDateInput.value > dateInput.value && allDayCheck && !allDayCheck.checked) {
      allDayCheck.checked = true;
      toggleModalAllDay(true);
    }
  }
}

function handleModalStartTimeChange() {
  const startInput = document.getElementById('editTaskTime');
  const endInput = document.getElementById('editTaskEndTime');
  const durInput = document.getElementById('editTaskDuration');
  if (!startInput || !endInput) return;

  const currentDur = parseInt(durInput ? durInput.value : 30, 10) || 30;
  if (startInput.value) {
    endInput.value = getEndTimeFromDuration(startInput.value, currentDur);
  }
}

function handleModalEndTimeChange() {
  const startInput = document.getElementById('editTaskTime');
  const endInput = document.getElementById('editTaskEndTime');
  const durInput = document.getElementById('editTaskDuration');
  if (!startInput || !endInput) return;

  if (startInput.value && endInput.value) {
    const dur = getDurationFromTimes(startInput.value, endInput.value);
    if (durInput) durInput.value = dur;
  }
}

function toggleModalExtraDetails(forceState) {
  const content = document.getElementById('extraDetailsContent');
  const icon = document.getElementById('extraDetailsToggleIcon');
  const text = document.getElementById('extraDetailsToggleText');
  if (!content) return;

  const isCurrentlyOpen = content.style.display !== 'none';
  const shouldOpen = forceState !== undefined ? forceState : !isCurrentlyOpen;

  content.style.display = shouldOpen ? 'block' : 'none';
  if (icon) icon.textContent = shouldOpen ? '▾' : '▸';
  if (text) text.textContent = shouldOpen ? 'Masquer lieu & notes' : '+ Lieu, Lien web & Notes';
}

window.toggleModalAllDay = toggleModalAllDay;
window.handleModalStartDateChange = handleModalStartDateChange;
window.handleModalEndDateChange = handleModalEndDateChange;
window.handleModalStartTimeChange = handleModalStartTimeChange;
window.handleModalEndTimeChange = handleModalEndTimeChange;
window.toggleModalExtraDetails = toggleModalExtraDetails;

function openCreateModalWithDefaults(dateStr = TODAY_STR, timeStr = '') {
  editingTaskId = null;
  editingContext = currentContextFilter === 'all' ? 'work' : normalizePlanContext(currentContextFilter);

  const isAllDay = !timeStr;
  const allDayCheck = document.getElementById('editTaskAllDay');
  if (allDayCheck) allDayCheck.checked = isAllDay;
  toggleModalAllDay(isAllDay);

  const impCheck = document.getElementById('editTaskImportant');
  if (impCheck) impCheck.checked = false;

  selectModalType(timeStr ? 'event' : 'task');

  const titleEl = document.getElementById('editTaskTitle');
  if (titleEl) titleEl.value = '';

  const locEl = document.getElementById('editTaskLocation');
  if (locEl) locEl.value = '';

  const notesEl = document.getElementById('editTaskNotes');
  if (notesEl) notesEl.value = '';

  toggleModalExtraDetails(false);

  const dateEl = document.getElementById('editTaskDate');
  if (dateEl) dateEl.value = dateStr || TODAY_STR;

  const endDateEl = document.getElementById('editTaskEndDate');
  if (endDateEl) endDateEl.value = dateStr || TODAY_STR;

  const recEl = document.getElementById('editTaskRecurrence');
  if (recEl) recEl.value = 'none';
  updateRecurrenceWeeklyLabel(dateStr || TODAY_STR);

  const timeEl = document.getElementById('editTaskTime');
  if (timeEl) timeEl.value = timeStr || '09:00';

  const endTimeEl = document.getElementById('editTaskEndTime');
  const durEl = document.getElementById('editTaskDuration');
  if (durEl) durEl.value = 30;
  if (endTimeEl) {
    endTimeEl.value = getEndTimeFromDuration(timeStr || '09:00', 30);
  }

  const headerSpan = document.getElementById('modalHeaderTitle') || document.querySelector('#editModalOverlay .modal-header span');
  if (headerSpan) headerSpan.textContent = timeStr ? `New Event (${timeStr})` : (isAllDay ? 'New All-Day Item' : 'New Task');

  const deleteBtn = document.getElementById('btnModalDeleteTask');
  if (deleteBtn) deleteBtn.style.display = 'none';

  document.querySelectorAll('#modalContextPills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.context === editingContext);
  });

  selectEditPlanAction('auto');

  const modal = document.getElementById('editModalOverlay');
  if (modal) modal.style.display = 'flex';
  if (titleEl) {
    setTimeout(() => titleEl.focus(), 80);
  }
}

function openEditModal(id) {
  const task = window.SpanPlanState.tasks.find(t => t.id === id);
  if (!task) return;

  editingTaskId = id;
  editingContext = normalizePlanContext(task.context || 'work');

  selectModalType(task.type === 'event' ? 'event' : 'task');

  const titleEl = document.getElementById('editTaskTitle');
  if (titleEl) titleEl.value = task.title;

  const isAllDay = !!task.allDay || (!task.time && !!task.date);
  const allDayCheck = document.getElementById('editTaskAllDay');
  if (allDayCheck) allDayCheck.checked = isAllDay;
  toggleModalAllDay(isAllDay);

  const impCheck = document.getElementById('editTaskImportant');
  if (impCheck) impCheck.checked = !!task.important;

  const dateEl = document.getElementById('editTaskDate');
  if (dateEl) dateEl.value = task.date || '';

  const endDateEl = document.getElementById('editTaskEndDate');
  if (endDateEl) endDateEl.value = task.endDate || task.date || '';

  const locEl = document.getElementById('editTaskLocation');
  if (locEl) locEl.value = task.location || '';

  const notesEl = document.getElementById('editTaskNotes');
  if (notesEl) notesEl.value = task.notes || '';

  const hasExtra = Boolean((task.location && task.location.trim()) || (task.notes && task.notes.trim()));
  toggleModalExtraDetails(hasExtra);

  const recEl = document.getElementById('editTaskRecurrence');
  if (recEl) recEl.value = task.recurrence || 'none';
  updateRecurrenceWeeklyLabel(task.date || TODAY_STR);

  const timeEl = document.getElementById('editTaskTime');
  if (timeEl) timeEl.value = task.time || '09:00';

  const endTimeEl = document.getElementById('editTaskEndTime');
  const durEl = document.getElementById('editTaskDuration');
  const dur = task.duration || 30;
  if (durEl) durEl.value = dur;
  if (endTimeEl) {
    endTimeEl.value = getEndTimeFromDuration(task.time || '09:00', dur);
  }

  const deleteBtn = document.getElementById('btnModalDeleteTask');
  if (deleteBtn) deleteBtn.style.display = 'inline-block';

  document.querySelectorAll('#modalContextPills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.context === editingContext);
  });

  selectEditPlanAction(task.actionType || 'auto');

  document.getElementById('editModalOverlay').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editModalOverlay').style.display = 'none';
  editingTaskId = null;
}

function deleteCurrentEditingTask() {
  if (!editingTaskId) return;
  const idToDelete = editingTaskId;
  const task = window.SpanPlanState.tasks.find(t => t.id === idToDelete);
  const typeLabel = (task && task.type === 'event') ? 'Event' : 'Task';
  deleteTask(idToDelete);
  closeEditModal();
  if (typeof showToast === 'function') {
    showToast(`${typeLabel} deleted`, 'info');
  }
}

function selectEditContext(ctx) {
  editingContext = normalizePlanContext(ctx);
  document.querySelectorAll('#modalContextPills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.context === editingContext);
  });
}

function saveTaskModal() {
  const title = document.getElementById('editTaskTitle').value.trim();
  if (!title) return;

  const impCheck = document.getElementById('editTaskImportant');
  let isImportant = impCheck ? impCheck.checked : false;

  let cleanTitle = title;
  if (cleanTitle.endsWith('!') || /\s!($|\s)/.test(cleanTitle) || /#important\b/i.test(cleanTitle)) {
    isImportant = true;
    if (cleanTitle.endsWith('!')) {
      cleanTitle = cleanTitle.slice(0, -1).trim();
    }
  }

  const allDayCheck = document.getElementById('editTaskAllDay');
  const isAllDay = allDayCheck ? allDayCheck.checked : false;

  const dateVal = document.getElementById('editTaskDate').value || null;
  let endDateVal = document.getElementById('editTaskEndDate').value || null;

  if (isAllDay && !endDateVal) {
    endDateVal = dateVal;
  }

  let timeVal = '';
  let endTimeVal = '';
  let durationVal = 30;

  if (!isAllDay) {
    timeVal = document.getElementById('editTaskTime').value || '';
    endTimeVal = document.getElementById('editTaskEndTime').value || '';
    if (timeVal && endTimeVal) {
      durationVal = getDurationFromTimes(timeVal, endTimeVal);
    } else if (timeVal) {
      durationVal = 30;
      endTimeVal = getEndTimeFromDuration(timeVal, 30);
    }
  }

  const recEl = document.getElementById('editTaskRecurrence');
  const recurrenceVal = recEl ? recEl.value : 'none';

  const locEl = document.getElementById('editTaskLocation');
  const locationVal = locEl ? locEl.value.trim() : '';

  const notesEl = document.getElementById('editTaskNotes');
  const notesVal = notesEl ? notesEl.value.trim() : '';

  const computedEndDate = isAllDay 
    ? endDateVal 
    : (timeVal && (timeToMinutes(timeVal) + durationVal > 1440) ? getNextDateString(dateVal) : dateVal);

  if (editingTaskId) {
    const task = window.SpanPlanState.tasks.find(t => t.id === editingTaskId);
    if (task) {
      task.title = cleanTitle || title;
      task.type = editingItemType;
      task.allDay = isAllDay;
      task.important = isImportant;
      task.date = dateVal;
      task.endDate = computedEndDate;
      task.recurrence = recurrenceVal;
      task.time = timeVal;
      task.endTime = endTimeVal;
      task.duration = durationVal;
      task.context = editingContext;
      task.actionType = (editingPlanActionType === 'auto') ? null : editingPlanActionType;
      task.location = locationVal;
      task.notes = notesVal;
      task.updated_at = new Date().toISOString();
    }
    if (typeof showToast === 'function') {
      const label = editingItemType === 'event' ? 'Event updated' : 'Task updated';
      showToast(`${label}${isImportant ? ' !' : ''}`, 'info');
    }
  } else {
    const nowIso = new Date().toISOString();
    const newTask = {
      id: 'p_' + Date.now(),
      title: cleanTitle || title,
      type: editingItemType,
      allDay: isAllDay,
      important: isImportant,
      date: dateVal,
      endDate: computedEndDate,
      recurrence: recurrenceVal,
      recurrenceExceptions: [],
      time: timeVal,
      endTime: endTimeVal,
      duration: durationVal,
      context: editingContext,
      actionType: (editingPlanActionType === 'auto') ? null : editingPlanActionType,
      location: locationVal,
      notes: notesVal,
      completed: false,
      isRollover: false,
      created_at: nowIso,
      updated_at: nowIso
    };
    window.SpanPlanState.tasks.unshift(newTask);

    // Retirer ce titre des identifiants supprimés s'il y était pour éviter toute suppression fantôme au refresh
    try {
      const dismissed = JSON.parse(localStorage.getItem('span_plan_dismissed_focus_ids')) || [];
      const titleKey = 'title:' + title.toLowerCase();
      const updatedDismissed = dismissed.filter(d => d !== titleKey && d !== newTask.id);
      localStorage.setItem('span_plan_dismissed_focus_ids', JSON.stringify(updatedDismissed));
    } catch (e) {}

    if (typeof showToast === 'function') {
      const timeTxt = timeVal ? ` at ${timeVal}` : (isAllDay ? ' (All-day)' : '');
      const recTxt = (recurrenceVal && recurrenceVal !== 'none') ? ' 🔁' : '';
      const label = editingItemType === 'event' ? 'Event created' : 'Task created';
      showToast(`${label}: "${newTask.title}"${timeTxt}${recTxt}`, 'success');
    }
  }

  closeEditModal();
  savePlanState();
}


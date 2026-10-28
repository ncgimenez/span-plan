// ==============================================================
// SPAN PLAN - CALENDAR DRAG, DROP, RESIZE & SELECTION INTERACTION
// ==============================================================

// REDIMENSIONNEMENT INTERACTIF (AVEC GESTION PROPRE DU DÉPASSEMENT NOCTURNE & OVERNIGHT)
var resizingTaskId = null;
let resizeStartY = 0;
let resizeStartDuration = 30;
let resizeIsContinuation = false;
let resizingProposedMinutes = 30;

function startResize(e, taskId) {
  e.preventDefault();
  e.stopPropagation();
  resizingTaskId = taskId;
  
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  resizeStartY = clientY;
  
  const blockEl = e.target.closest('.schedule-block-item') || document.getElementById(`block_${taskId}`) || document.getElementById(`block_${taskId}_cont`);
  resizeIsContinuation = Boolean(blockEl && blockEl.dataset.isContinuation === 'true');

  const task = window.SpanPlanState.tasks.find(t => t.id === taskId);
  resizeStartDuration = task ? (task.duration || 30) : 30;
  resizingProposedMinutes = resizeStartDuration;

  if (blockEl) {
    blockEl.classList.add('is-resizing');
  }

  window.addEventListener('mousemove', handleResizeMove);
  window.addEventListener('mouseup', handleResizeEnd);
  window.addEventListener('touchmove', handleResizeMove, { passive: false });
  window.addEventListener('touchend', handleResizeEnd);
}

function handleResizeMove(e) {
  if (!resizingTaskId) return;
  e.preventDefault();

  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const deltaY = clientY - resizeStartY;
  const deltaMinutes = (deltaY / HOUR_HEIGHT) * 60;

  let proposedMinutes = Math.round((resizeStartDuration + deltaMinutes) / 15) * 15;
  // Plafond strict : 24h maximum (1440 min) et minimum 15 min
  proposedMinutes = Math.max(15, Math.min(1440, proposedMinutes));
  resizingProposedMinutes = proposedMinutes;

  const task = window.SpanPlanState.tasks.find(t => t.id === resizingTaskId);
  const taskStartM = task ? timeToMinutes(task.time || '00:00') : 0;

  const blockEl = document.getElementById(`block_${resizingTaskId}`) || document.getElementById(`block_${resizingTaskId}_cont`);
  if (!blockEl) return;

  if (!resizeIsContinuation) {
    if (taskStartM + proposedMinutes > 1440) {
      // Dépasse minuit : le bloc du jour s'arrête exactement à minuit
      const day1Minutes = Math.max(15, 1440 - taskStartM);
      const day1Height = Math.max(22, (day1Minutes / 60) * HOUR_HEIGHT - 2);
      blockEl.style.height = `${day1Height}px`;

      const overflowM = (taskStartM + proposedMinutes) - 1440;
      const nextDayEndH = String(Math.floor(overflowM / 60)).padStart(2, '0');
      const nextDayEndM = String(overflowM % 60).padStart(2, '0');
      blockEl.classList.add('is-overnight-resizing');
      blockEl.setAttribute('data-overnight-info', `↳ Glisse sur le jour suivant jusqu'à ${nextDayEndH}:${nextDayEndM} (+${overflowM}m)`);
    } else {
      blockEl.classList.remove('is-overnight-resizing');
      blockEl.removeAttribute('data-overnight-info');
      const normalHeight = Math.max(22, (proposedMinutes / 60) * HOUR_HEIGHT - 2);
      blockEl.style.height = `${normalHeight}px`;
    }
  } else {
    // Redimensionnement depuis le segment de continuation
    const contMinutes = Math.max(15, (taskStartM + proposedMinutes) - 1440);
    const contHeight = Math.max(22, (contMinutes / 60) * HOUR_HEIGHT - 2);
    blockEl.style.height = `${contHeight}px`;
  }
}

function handleResizeEnd() {
  if (!resizingTaskId) return;

  const taskId = resizingTaskId;
  resizingTaskId = null;
  window.removeEventListener('mousemove', handleResizeMove);
  window.removeEventListener('mouseup', handleResizeEnd);
  window.removeEventListener('touchmove', handleResizeMove);
  window.removeEventListener('touchend', handleResizeEnd);

  document.querySelectorAll('.is-resizing, .is-overnight-resizing').forEach(el => {
    el.classList.remove('is-resizing', 'is-overnight-resizing');
    el.removeAttribute('data-overnight-info');
  });

  const task = window.SpanPlanState.tasks.find(t => t.id === taskId);
  if (task) {
    const finalMinutes = Math.max(15, Math.min(1440, resizingProposedMinutes));
    task.duration = finalMinutes;
    const taskStartM = timeToMinutes(task.time || '00:00');
    if (task.time) {
      task.endTime = getEndTimeFromDuration(task.time, finalMinutes);
    }
    if (taskStartM + finalMinutes > 1440) {
      task.endDate = getNextDateString(task.date);
    } else if (!task.allDay) {
      task.endDate = task.date;
    }
    task.updated_at = new Date().toISOString();
    savePlanState();
    if (typeof syncPlanToCloud === 'function') syncPlanToCloud();
    renderPlanGrid(true);
  }
}

// MULTI-SÉLECTION & DÉPLACEMENT DE GROUPE (SYSTÈME EXACT DU PORTFOLIO)
var selectedTaskIds = new Set();
let isPointerDragging = false;
let dragAnchorTaskId = null;
let dragAnchorClientY = 0;
let dragAnchorClientX = 0;
let dragGrabOffsetX = 0;
let dragGrabOffsetY = 0;
let dragInitialTops = new Map();
let hasMovedBeyondThreshold = false;
let dragWasAlreadySelected = false;

let marqueeCanvas = null;
let marqueeEl = null;
let marqueeStartX = 0;
let marqueeStartY = 0;
let marqueeMoved = false;

function toggleTaskSelection(id) {
  if (selectedTaskIds.has(id)) {
    selectedTaskIds.delete(id);
  } else {
    selectedTaskIds.add(id);
  }
  updateSelectionVisuals();
}

function selectTaskExclusively(id) {
  selectedTaskIds.clear();
  selectedTaskIds.add(id);
  updateSelectionVisuals();
}

function clearSelection() {
  if (selectedTaskIds.size === 0) return;
  selectedTaskIds.clear();
  updateSelectionVisuals();
}

function deleteSelectedTasks() {
  if (selectedTaskIds.size === 0) return;
  const count = selectedTaskIds.size;
  const idsToDelete = Array.from(selectedTaskIds);
  selectedTaskIds.clear();
  updateSelectionVisuals();
  deleteTasks(idsToDelete);
  if (typeof showToast === 'function') {
    showToast(`${count} item${count > 1 ? 's' : ''} deleted`, 'info');
  }
}

function updateSelectionVisuals() {
  document.querySelectorAll('.schedule-block-item').forEach(el => {
    const id = el.dataset.taskId;
    el.classList.toggle('is-selected', selectedTaskIds.has(id));
  });

  document.querySelectorAll('.task-item').forEach(el => {
    const id = el.getAttribute('data-task-id') || el.querySelector('.task-row-main')?.getAttribute('data-task-id');
  });

  const bar = document.getElementById('multiSelectActionBar');
  const countSpan = document.getElementById('multiSelectCountText');
  if (bar) {
    if (selectedTaskIds.size > 0) {
      bar.classList.add('show');
      if (countSpan) {
        countSpan.textContent = `${selectedTaskIds.size} sélection${selectedTaskIds.size > 1 ? 's' : ''}`;
      }
    } else {
      bar.classList.remove('show');
    }
  }
}

// POINTER DOWN SUR UN BLOC (CLIC OU DÉPLACEMENT SIMPLE/GROUPE)
function handleBlockPointerDown(e, taskId, dateStr) {
  if (e.target.closest('.btn-task-menu') || 
      e.target.closest('.checkbox') || 
      e.target.closest('.resize-handle') || 
      e.target.closest('.event-progress-pill') ||
      e.target.closest('.btn-block-quick-add-subtask') ||
      e.target.closest('.btn-subtask-quick-backlog') ||
      e.target.closest('.block-subtask-row') ||
      e.target.closest('.block-subtasks-container') ||
      e.target.closest('.subtasks-unfold-btn') ||
      e.target.closest('.subtasks-mini-unfold-btn') ||
      e.target.closest('.subtask-interactive-row')) {
    return;
  }
  if (e.button !== 0) return;
  if (window.draggedSubtaskInfo || window.draggedBatchSubtasksInfo) return;

  closeQuickAddPopover();
  e.stopPropagation();

  const isModifier = (e.metaKey || e.ctrlKey || e.shiftKey);

  if (isModifier) {
    e.preventDefault();
    toggleTaskSelection(taskId);
    return;
  }

  const wasAlreadySelected = selectedTaskIds.has(taskId);
  dragWasAlreadySelected = wasAlreadySelected;

  if (!wasAlreadySelected) {
    selectTaskExclusively(taskId);
  }

  dragAnchorTaskId = taskId;
  dragAnchorClientY = e.clientY;
  dragAnchorClientX = e.clientX;
  hasMovedBeyondThreshold = false;
  isPointerDragging = false;

  const anchorEl = document.getElementById(`block_${taskId}`) || document.getElementById(`block_${taskId}_cont`);
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    dragGrabOffsetX = Math.max(10, Math.min(rect.width - 10, e.clientX - rect.left));
    dragGrabOffsetY = Math.max(10, Math.min(rect.height - 10, e.clientY - rect.top));
  } else {
    dragGrabOffsetX = 20;
    dragGrabOffsetY = 20;
  }

  dragInitialTops.clear();
  selectedTaskIds.forEach(id => {
    const task = window.SpanPlanState.tasks.find(t => t.id === id);
    const el = document.getElementById(`block_${id}`) || document.getElementById(`block_${id}_cont`);
    if (task && el) {
      const parts = (task.time || '00:00').split(':');
      const startM = parseInt(parts[0], 10) * 60 + (parseInt(parts[1], 10) || 0);
      const currentTop = parseFloat(el.style.top) || el.offsetTop;
      dragInitialTops.set(id, {
        task,
        el,
        initialTop: currentTop,
        initialStartMinutes: startM,
        duration: task.duration || 30,
        date: task.date
      });
    }
  });

  window.addEventListener('pointermove', handleBlockPointerMove);
  window.addEventListener('pointerup', handleBlockPointerUp);
  window.addEventListener('pointercancel', handleBlockPointerUp);
}

function handleBlockPointerMove(e) {
  if (!dragAnchorTaskId) return;
  if (window.draggedSubtaskInfo || window.draggedBatchSubtasksInfo) {
    if (typeof handleBlockPointerUp === 'function') handleBlockPointerUp();
    return;
  }

  const deltaY = e.clientY - dragAnchorClientY;
  const deltaX = e.clientX - dragAnchorClientX;

  if (!hasMovedBeyondThreshold) {
    if (Math.hypot(deltaX, deltaY) > 5) {
      hasMovedBeyondThreshold = true;
      isPointerDragging = true;
      document.body.classList.add('is-card-dragging');
      if (window.getSelection) {
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();
      }

      // Créer la carte flottante directement accrochée au curseur
      const anchorEl = document.getElementById(`block_${dragAnchorTaskId}`);
      if (anchorEl) {
        const rect = anchorEl.getBoundingClientRect();
        let avatar = document.getElementById('activeFloatingDragAvatar');
        if (!avatar) {
          avatar = anchorEl.cloneNode(true);
          avatar.id = 'activeFloatingDragAvatar';
          avatar.className = anchorEl.className + ' is-floating-drag-avatar';
          avatar.style.width = `${rect.width}px`;
          avatar.style.height = `${rect.height}px`;
          avatar.style.left = `${e.clientX - dragGrabOffsetX}px`;
          avatar.style.top = `${e.clientY - dragGrabOffsetY}px`;
          document.body.appendChild(avatar);
        }
      }

      dragInitialTops.forEach(info => {
        info.el.classList.add('is-batch-dragging');
        info.el.style.pointerEvents = 'none';
      });
    } else {
      return;
    }
  }

  if (isPointerDragging) {
    e.preventDefault();

    // Suivi au pixel près du curseur de la souris (partout à travers l'écran)
    const avatar = document.getElementById('activeFloatingDragAvatar');
    if (avatar) {
      avatar.style.left = `${e.clientX - dragGrabOffsetX}px`;
      avatar.style.top = `${e.clientY - dragGrabOffsetY}px`;
    }

    const elUnder = document.elementFromPoint(e.clientX, e.clientY);

    // Détection du survol de la zone Backlog (sidebar, drawer, bouton toggle, onglet mobile)
    const targetBacklog = elUnder?.closest('.sidebar-backlog-section, .sidebar-backlog-scroll, #backlogDrawer, .backlog-drawer, .btn-backlog-toggle, #btnToggleDrawer, #mobileNavBacklog, #backlogTaskList');

    document.querySelectorAll('.sidebar-backlog-section.drag-over, .sidebar-backlog-scroll.drag-over, #backlogDrawer.drag-over, .backlog-drawer.drag-over, .btn-backlog-toggle.drag-over, #btnToggleDrawer.drag-over, #mobileNavBacklog.drag-over, #backlogTaskList.drag-over').forEach(el => {
      if (el !== targetBacklog) el.classList.remove('drag-over');
    });

    if (targetBacklog) {
      targetBacklog.classList.add('drag-over');
      document.querySelectorAll('[id^="pointerDragGhost_"]').forEach(g => g.remove());
      document.querySelectorAll('.day-dock.dock-drop-hover, .cal-allday-drop-cell.drag-over, .schedule-block-item.subtask-drop-target').forEach(d => d.classList.remove('dock-drop-hover', 'drag-over', 'subtask-drop-target'));
      return;
    }

    // Détection de survol d'un autre bloc pour imbrication directe en sous-tâche
    const targetBlockEl = elUnder?.closest('.schedule-block-item');
    const targetBlockId = targetBlockEl?.dataset.taskId;
    const isOverOtherBlock = Boolean(targetBlockId && targetBlockId !== dragAnchorTaskId && !dragInitialTops.has(targetBlockId));

    document.querySelectorAll('.schedule-block-item.subtask-drop-target').forEach(b => {
      if (!isOverOtherBlock || b !== targetBlockEl) {
        b.classList.remove('subtask-drop-target');
      }
    });

    if (isOverOtherBlock) {
      targetBlockEl.classList.add('subtask-drop-target');
      document.querySelectorAll('[id^="pointerDragGhost_"]').forEach(g => g.remove());
      document.querySelectorAll('.day-dock.dock-drop-hover, .cal-allday-drop-cell.drag-over').forEach(d => d.classList.remove('dock-drop-hover', 'drag-over'));
      return;
    }

    // Détection de la colonne ou du dock sous le curseur
    const targetDock = elUnder?.closest('.day-dock, .cal-allday-drop-cell, .cal-allday-row');
    const targetCanvas = elUnder?.closest('.schedule-grid-canvas');
    const targetCol = targetCanvas ? targetCanvas.closest('.cal-day-column') : elUnder?.closest('.cal-day-column');

    document.querySelectorAll('.day-dock.dock-drop-hover, .cal-allday-drop-cell.drag-over').forEach(d => {
      if (d !== targetDock) d.classList.remove('dock-drop-hover', 'drag-over');
    });

    if (targetDock) {
      targetDock.classList.add('dock-drop-hover', 'drag-over');
      document.querySelectorAll('[id^="pointerDragGhost_"]').forEach(g => g.remove());
      return;
    }

    const activeCanvas = targetCanvas || targetCol?.querySelector('.schedule-grid-canvas');
    if (targetCol && activeCanvas) {
      const cRect = activeCanvas.getBoundingClientRect();
      const relY = Math.max(0, (e.clientY - dragGrabOffsetY) - cRect.top);
      let targetStartM = Math.round((relY / HOUR_HEIGHT) * 60);
      targetStartM = Math.round(targetStartM / 15) * 15;
      targetStartM = Math.max(0, Math.min(23 * 60 + 45, targetStartM));

      const anchorInfo = dragInitialTops.get(dragAnchorTaskId);
      const anchorStartM = anchorInfo ? anchorInfo.initialStartMinutes : 0;
      const diffM = targetStartM - anchorStartM;

      dragInitialTops.forEach(info => {
        const itemStartM = Math.max(0, Math.min(23 * 60 + 45, info.initialStartMinutes + diffM));
        const itemEndM = itemStartM + info.duration;
        const snappedTop = ((itemStartM - START_HOUR * 60) / 60) * HOUR_HEIGHT;
        const isOvernightGhost = (itemEndM > 1440);
        const ghostDuration = isOvernightGhost ? Math.max(15, 1440 - itemStartM) : info.duration;
        const height = Math.max(30, (ghostDuration / 60) * HOUR_HEIGHT);

        const startH = String(Math.floor(itemStartM / 60)).padStart(2, '0');
        const startM = String(itemStartM % 60).padStart(2, '0');
        const endTotal = itemEndM % 1440;
        const endH = String(Math.floor(endTotal / 60)).padStart(2, '0');
        const endM = String(endTotal % 60).padStart(2, '0');
        const overnightSuffix = isOvernightGhost ? ' (+1j)' : '';

        const ghostId = `pointerDragGhost_${info.task.id}`;
        let ghost = document.getElementById(ghostId);
        if (!ghost) {
          ghost = document.createElement('div');
          ghost.id = ghostId;
          activeCanvas.appendChild(ghost);
        } else if (ghost.parentElement !== activeCanvas) {
          ghost.remove();
          activeCanvas.appendChild(ghost);
        }
        ghost.className = `drag-preview-slot cat-${info.task.context || 'work'} ${isOvernightGhost ? 'is-overnight-start' : ''}`;
        ghost.style.top = `${snappedTop}px`;
        ghost.style.height = `${height}px`;
        ghost.style.left = '4px';
        ghost.style.right = '4px';
        const isEvent = (info.task.type === 'event');
        ghost.innerHTML = `
          <div class="ghost-time-label">${isEvent ? '📅 ' : '⏱ '}${startH}:${startM} – ${endH}:${endM}${overnightSuffix} (${info.duration}m)</div>
          <div class="ghost-title-label">${info.task.title}</div>
        `;
      });
    } else {
      document.querySelectorAll('[id^="pointerDragGhost_"]').forEach(g => g.remove());
    }
  }
}

let lastBlockClickTime = 0;
let lastBlockClickTaskId = null;

function handleBlockPointerUp(e) {
  window.removeEventListener('pointermove', handleBlockPointerMove);
  window.removeEventListener('pointerup', handleBlockPointerUp);
  window.removeEventListener('pointercancel', handleBlockPointerUp);

  document.body.classList.remove('is-card-dragging');
  const avatar = document.getElementById('activeFloatingDragAvatar');
  if (avatar) avatar.remove();

  document.querySelectorAll('[id^="pointerDragGhost_"]').forEach(g => g.remove());
  document.querySelectorAll('.day-dock.dock-drop-hover, .cal-allday-drop-cell.drag-over, .sidebar-backlog-section.drag-over, .sidebar-backlog-scroll.drag-over, #backlogDrawer.drag-over, .backlog-drawer.drag-over, .btn-backlog-toggle.drag-over, #btnToggleDrawer.drag-over, #mobileNavBacklog.drag-over, #backlogTaskList.drag-over').forEach(d => d.classList.remove('dock-drop-hover', 'drag-over'));

  dragInitialTops.forEach(info => {
    info.el.classList.remove('is-batch-dragging');
    info.el.style.pointerEvents = '';
  });

  const anchorId = dragAnchorTaskId;
  const wasDragging = isPointerDragging;
  const moved = hasMovedBeyondThreshold;

  dragAnchorTaskId = null;
  isPointerDragging = false;
  hasMovedBeyondThreshold = false;

  if (!moved) {
    const clickNow = Date.now();
    const isDoubleClick = (lastBlockClickTaskId === anchorId && (clickNow - lastBlockClickTime) < 400);

    if (isDoubleClick) {
      lastBlockClickTime = 0;
      lastBlockClickTaskId = null;
      dragInitialTops.clear();
      openEditModal(anchorId);
      return;
    }

    lastBlockClickTime = clickNow;
    lastBlockClickTaskId = anchorId;

    if (anchorId) {
      if (dragWasAlreadySelected) {
        clearSelection();
      } else {
        selectTaskExclusively(anchorId);
      }
    }
    dragInitialTops.clear();
    return;
  }

  // Si déplacement effectué, réinitialiser le compteur de double clic
  lastBlockClickTime = 0;
  lastBlockClickTaskId = null;

  document.querySelectorAll('.schedule-block-item.subtask-drop-target').forEach(b => b.classList.remove('subtask-drop-target'));

  if (wasDragging) {
    const elUnder = document.elementFromPoint(e.clientX, e.clientY);

    // DÉPÔT DANS LE BACKLOG DEPUIS LA GRILLE DU PLANNING
    const targetBacklog = elUnder?.closest('.sidebar-backlog-section, .sidebar-backlog-scroll, #backlogDrawer, .backlog-drawer, .btn-backlog-toggle, #btnToggleDrawer, #mobileNavBacklog, #backlogTaskList');
    if (targetBacklog) {
      let movedCount = 0;
      const movedTitles = [];
      dragInitialTops.forEach(info => {
        const task = info.task;
        const hasSubtasks = Array.isArray(task.subtasks) && task.subtasks.length > 0;
        if (hasSubtasks) {
          const completedSubtasks = task.subtasks.filter(s => !!s.completed);
          const unfinishedSubtasks = task.subtasks.filter(s => !s.completed);

          if (completedSubtasks.length > 0 && unfinishedSubtasks.length > 0 && task.date) {
            // Conserver l'historique des sous-tâches faites sur le jour
            task.subtasks = completedSubtasks;
            task.completed = true;
            task.updated_at = new Date().toISOString();

            // Créer le nouveau bloc regroupant toutes les sous-tâches restantes dans le Backlog
            const newBlock = {
              id: 'task_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36),
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
              subtasks: unfinishedSubtasks.map(s => ({
                id: String(s.id || ('sub_' + Math.random().toString(36).substr(2, 9))),
                title: (s.title || 'Untitled task').trim(),
                context: s.context || task.context || 'work',
                completed: false
              })),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            window.SpanPlanState.tasks.unshift(newBlock);
            if (typeof syncSubtasksToFocus === 'function') {
              syncSubtasksToFocus(task);
              syncSubtasksToFocus(newBlock);
            }
            movedTitles.push(task.title);
            movedCount++;
            return;
          }
        }

        task.date = null;
        task.endDate = null;
        task.time = '';
        task.allDay = false;
        task.isRollover = false;
        task.updated_at = new Date().toISOString();
        movedTitles.push(task.title);
        movedCount++;
      });

      // Synchronisation avec span_tasks (Focus) si présent dans localStorage
      try {
        const focusTasksRaw = localStorage.getItem('span_tasks');
        if (focusTasksRaw) {
          let fTasks = JSON.parse(focusTasksRaw);
          let fModified = false;
          fTasks = fTasks.map(ft => {
            if (dragInitialTops.has(ft.id)) {
              fModified = true;
              return {
                ...ft,
                date: null,
                scheduledDate: null,
                time: '',
                scheduledTime: '',
                updated_at: new Date().toISOString()
              };
            }
            return ft;
          });
          if (fModified) {
            localStorage.setItem('span_tasks', JSON.stringify(fTasks));
          }
        }
      } catch (err) {
        console.warn('Failed syncing to span_tasks:', err);
      }

      dragInitialTops.clear();
      clearSelection();
      savePlanState();
      if (typeof syncPlanToCloud === 'function') syncPlanToCloud();
      renderPlanGrid(true);
      if (typeof renderBacklogTasks === 'function') renderBacklogTasks();
      if (typeof updateBacklogCountBadge === 'function') updateBacklogCountBadge();

      if (typeof showToast === 'function') {
        const msg = movedCount === 1 
          ? `Déplacé dans le Backlog : "${movedTitles[0]}"`
          : `${movedCount} items déplacés dans le Backlog`;
        showToast(msg, 'info');
      }
      return;
    }

    const targetBlockEl = elUnder?.closest('.schedule-block-item');
    const targetBlockId = targetBlockEl?.dataset.taskId;
    const isOverOtherBlock = Boolean(targetBlockId && targetBlockId !== anchorId && !dragInitialTops.has(targetBlockId));

    if (isOverOtherBlock) {
      const targetTask = window.SpanPlanState.tasks.find(t => t.id === targetBlockId);
      const targetTitle = targetTask ? targetTask.title : 'block';
      let attachedCount = 0;
      dragInitialTops.forEach(info => {
        if (attachTaskAsSubtask(info.task.id, targetBlockId)) {
          attachedCount++;
        }
      });
      dragInitialTops.clear();
      clearSelection();
      if (!window.expandedBlockAccordionIds) window.expandedBlockAccordionIds = new Set();
      window.expandedBlockAccordionIds.add(targetBlockId);
      savePlanState();
      if (typeof showToast === 'function') {
        showToast(`${attachedCount} item${attachedCount > 1 ? 's' : ''} added as subtask of "${targetTitle}"`, 'success');
      }
      return;
    }

    const targetDock = elUnder?.closest('.day-dock, .cal-allday-drop-cell, .cal-allday-row');
    const targetCanvas = elUnder?.closest('.schedule-grid-canvas');
    const targetCol = targetCanvas ? targetCanvas.closest('.cal-day-column') : elUnder?.closest('.cal-day-column');
    const anchorInfo = dragInitialTops.get(anchorId);
    const anchorDate = anchorInfo?.date;

    if (targetDock) {
      const targetDate = targetDock.dataset.date || anchorDate;
      let movedCount = 0;
      dragInitialTops.forEach(info => {
        info.task.date = targetDate;
        info.task.endDate = targetDate;
        info.task.time = '';
        info.task.allDay = true;
        info.task.isRollover = false;
        info.task.updated_at = new Date().toISOString();
        movedCount++;
      });
      dragInitialTops.clear();
      savePlanState();
      if (typeof showToast === 'function') {
        showToast(`${movedCount} item${movedCount > 1 ? 's' : ''} moved to All-day / To-do`, 'success');
      }
      return;
    }

    const activeCanvas = targetCanvas || targetCol?.querySelector('.schedule-grid-canvas');
    if (targetCol && activeCanvas) {
      const cRect = activeCanvas.getBoundingClientRect();
      const relY = Math.max(0, (e.clientY - dragGrabOffsetY) - cRect.top);
      let targetStartM = Math.round((relY / HOUR_HEIGHT) * 60);
      targetStartM = Math.round(targetStartM / 15) * 15;
      targetStartM = Math.max(0, Math.min(23 * 60 + 45, targetStartM));

      const anchorStartM = anchorInfo ? anchorInfo.initialStartMinutes : 0;
      const diffM = targetStartM - anchorStartM;
      const targetDateStr = targetCol.dataset.date || activeCanvas.dataset.date;

      const isAltDuplicate = Boolean(e.altKey);
      let movedCount = 0;
      const duplicatedIds = [];

      dragInitialTops.forEach(info => {
        const itemStartM = Math.max(0, Math.min(23 * 60 + 45, info.initialStartMinutes + diffM));
        const startH = String(Math.floor(itemStartM / 60)).padStart(2, '0');
        const startM = String(itemStartM % 60).padStart(2, '0');
        const timeVal = `${startH}:${startM}`;
        const dateVal = targetDateStr || info.task.date;
        const dur = info.task.duration || 30;
        const endDateVal = (itemStartM + dur > 1440) ? getNextDateString(dateVal) : dateVal;
        const endTimeVal = getEndTimeFromDuration(timeVal, dur);

        if (isAltDuplicate) {
          // DUPLIQUER LA TÂCHE (Option+Glisser)
          const newId = 'plan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
          const clonedSubtasks = Array.isArray(info.task.subtasks) ? info.task.subtasks.map(s => ({
            ...s,
            id: 'sub_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            completed: false
          })) : [];

          const newTask = {
            ...info.task,
            id: newId,
            time: timeVal,
            endTime: endTimeVal,
            date: dateVal,
            endDate: endDateVal,
            subtasks: clonedSubtasks,
            allDay: false,
            isRollover: false,
            completed: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          window.SpanPlanState.tasks.push(newTask);
          duplicatedIds.push(newId);
        } else {
          // DÉPLACER LA TÂCHE ORIGINALE
          info.task.time = timeVal;
          info.task.allDay = false;
          info.task.date = dateVal;
          info.task.endDate = endDateVal;
          info.task.isRollover = false;
          info.task.endTime = endTimeVal;
          info.task.updated_at = new Date().toISOString();
        }
        movedCount++;
      });

      dragInitialTops.clear();
      savePlanState();

      if (isAltDuplicate && duplicatedIds.length > 0) {
        selectedTaskIds.clear();
        duplicatedIds.forEach(id => selectedTaskIds.add(id));
        updateSelectionVisuals();
      }

      if (typeof showToast === 'function') {
        const dateObj = new Date(targetDateStr + 'T00:00:00');
        const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const actionLabel = isAltDuplicate ? 'dupliqué(s) (⌥+Glisser)' : 'déplacé(s)';
        showToast(`✨ ${movedCount} élément(s) ${actionLabel} le ${dateLabel} (${String(Math.floor(targetStartM / 60)).padStart(2, '0')}:${String(targetStartM % 60).padStart(2, '0')})`, 'success');
      }
      return;
    }

    // Si déposé nulle part de valide, restaurer l'état
    dragInitialTops.clear();
    renderPlanGrid(true);
  }
}

// SÉLECTION MARQUEE SUR LA GRILLE VIDE (EXACTEMENT DU PORTFOLIO)
function handleCanvasPointerDown(e, dateStr) {
  if (e.target.closest('.schedule-block-item') || e.target.closest('.resize-handle') || e.target.closest('.now-timeline-marker')) {
    return;
  }
  if (e.button !== 0) return;

  const isModifier = (e.metaKey || e.ctrlKey || e.shiftKey);
  if (!isModifier) {
    clearSelection();
  }

  const canvas = e.currentTarget;
  const rect = canvas.getBoundingClientRect();
  marqueeCanvas = canvas;
  marqueeStartX = e.clientX - rect.left;
  marqueeStartY = e.clientY - rect.top;
  marqueeMoved = false;

  let marquee = canvas.querySelector('.cal-marquee');
  if (!marquee) {
    marquee = document.createElement('div');
    marquee.className = 'cal-marquee';
    canvas.appendChild(marquee);
  }
  marqueeEl = marquee;
  marqueeEl.style.left = `${marqueeStartX}px`;
  marqueeEl.style.top = `${marqueeStartY}px`;
  marqueeEl.style.width = '0px';
  marqueeEl.style.height = '0px';
  marqueeEl.style.display = 'none';

  window.addEventListener('pointermove', handleCanvasPointerMove);
  window.addEventListener('pointerup', handleCanvasPointerUp);
  window.addEventListener('pointercancel', handleCanvasPointerUp);
}

function handleCanvasPointerMove(e) {
  if (!marqueeCanvas || !marqueeEl) return;

  const rect = marqueeCanvas.getBoundingClientRect();
  const currentX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
  const currentY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

  const width = Math.abs(currentX - marqueeStartX);
  const height = Math.abs(currentY - marqueeStartY);

  if (!marqueeMoved) {
    if (Math.hypot(width, height) > 5) {
      marqueeMoved = true;
      marqueeEl.style.display = 'block';
    } else {
      return;
    }
  }

  const left = Math.min(marqueeStartX, currentX);
  const top = Math.min(marqueeStartY, currentY);

  marqueeEl.style.left = `${left}px`;
  marqueeEl.style.top = `${top}px`;
  marqueeEl.style.width = `${width}px`;
  marqueeEl.style.height = `${height}px`;

  const marqueeRect = { left, right: left + width, top, bottom: top + height };
  const blocks = marqueeCanvas.querySelectorAll('.schedule-block-item');

  blocks.forEach(block => {
    const id = block.dataset.taskId;
    const bTop = parseFloat(block.style.top) || block.offsetTop;
    const bLeft = block.offsetLeft;
    const bWidth = block.offsetWidth;
    const bHeight = block.offsetHeight;

    const bRect = { left: bLeft, right: bLeft + bWidth, top: bTop, bottom: bTop + bHeight };
    const intersects = !(
      marqueeRect.right < bRect.left ||
      marqueeRect.left > bRect.right ||
      marqueeRect.bottom < bRect.top ||
      marqueeRect.top > bRect.bottom
    );

    if (intersects) {
      selectedTaskIds.add(id);
    } else if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
      selectedTaskIds.delete(id);
    }
  });

  updateSelectionVisuals();
}

function handleCanvasPointerUp(e) {
  window.removeEventListener('pointermove', handleCanvasPointerMove);
  window.removeEventListener('pointerup', handleCanvasPointerUp);
  window.removeEventListener('pointercancel', handleCanvasPointerUp);

  if (marqueeEl) {
    marqueeEl.style.display = 'none';
    marqueeEl = null;
  }

  const canvas = marqueeCanvas;
  const wasMoved = marqueeMoved;
  marqueeCanvas = null;
  marqueeMoved = false;

  // Si clic simple sans glissement : cibler le créneau pour Cmd+V et fermer popovers
  if (!wasMoved && canvas) {
    const dateStr = canvas.dataset.date;
    const rect = canvas.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;

    const hoursFraction = offsetY / HOUR_HEIGHT;
    let totalMinutes = Math.round((START_HOUR * 60) + (hoursFraction * 60));
    totalMinutes = Math.round(totalMinutes / 15) * 15;
    totalMinutes = Math.max(0, Math.min(23 * 60 + 45, totalMinutes));

    const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const m = String(totalMinutes % 60).padStart(2, '0');
    const clickedTime = `${h}:${m}`;

    setTargetGridSlot(dateStr, clickedTime);

    if (selectedTaskIds.size > 0) {
      clearSelection();
    }
    closeQuickAddPopover();
    closeTaskPopover();
  }
}

// CRÉATION PAR DOUBLE-CLIC SUR LA GRILLE DU PLANNING
function handleCanvasDoubleClick(e, dateStr) {
  if (e.target.closest('.schedule-block-item') || e.target.closest('.resize-handle') || e.target.closest('.now-timeline-marker')) {
    return;
  }
  const canvas = e.currentTarget || document.getElementById(`canvas_${dateStr}`);
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const offsetY = e.clientY - rect.top;

  const hoursFraction = offsetY / HOUR_HEIGHT;
  let totalMinutes = Math.round((START_HOUR * 60) + (hoursFraction * 60));
  totalMinutes = Math.round(totalMinutes / 15) * 15;
  totalMinutes = Math.max(0, Math.min(23 * 60 + 45, totalMinutes));

  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const m = String(totalMinutes % 60).padStart(2, '0');
  const clickedTime = `${h}:${m}`;

  setTargetGridSlot(dateStr, clickedTime);
  openQuickAddPopover(dateStr, clickedTime, e.clientX, e.clientY);
}
window.handleCanvasDoubleClick = handleCanvasDoubleClick;

// COPIER-COLLER D'ÉVÉNEMENTS (CMD+C / CMD+V)
var copiedPlanTasks = [];
var targetGridSlot = null; // { date: 'YYYY-MM-DD', time: 'HH:MM' }

function setTargetGridSlot(dateStr, timeStr) {
  targetGridSlot = { date: dateStr, time: timeStr };
  // Visual indicator: brief marker on targeted hour slot
  const canvas = document.getElementById(`canvas_${dateStr}`);
  if (canvas) {
    document.querySelectorAll('.grid-target-slot-marker').forEach(el => el.remove());
    const [h, m] = (timeStr || '09:00').split(':').map(Number);
    const topPx = (h - START_HOUR + m / 60) * HOUR_HEIGHT;
    const marker = document.createElement('div');
    marker.className = 'grid-target-slot-marker';
    marker.style.top = `${topPx}px`;
    marker.innerHTML = `<span>${timeStr}</span>`;
    canvas.appendChild(marker);
    setTimeout(() => marker.classList.add('fade-out'), 2500);
    setTimeout(() => marker.remove(), 3000);
  }
}
window.setTargetGridSlot = setTargetGridSlot;

function copySelectedPlanTask() {
  const idsToCopy = selectedTaskIds.size > 0 ? Array.from(selectedTaskIds) : (popoverTargetTaskId ? [popoverTargetTaskId] : []);
  if (idsToCopy.length === 0) return false;

  const tasksToCopy = (window.SpanPlanState.tasks || []).filter(t => idsToCopy.includes(t.id));
  if (tasksToCopy.length === 0) return false;

  copiedPlanTasks = JSON.parse(JSON.stringify(tasksToCopy));
  try {
    localStorage.setItem('span_plan_copied_tasks', JSON.stringify(copiedPlanTasks));
  } catch (err) {}

  if (typeof showToast === 'function') {
    const title = tasksToCopy.length === 1 ? `"${tasksToCopy[0].title}"` : `${tasksToCopy.length} éléments`;
    showToast(`📋 Copié : ${title} (cliquez sur un créneau et faites ⌘V)`, 'success');
  }
  return true;
}
window.copySelectedPlanTask = copySelectedPlanTask;

function pastePlanTask() {
  if (!copiedPlanTasks || copiedPlanTasks.length === 0) {
    try {
      copiedPlanTasks = JSON.parse(localStorage.getItem('span_plan_copied_tasks')) || [];
    } catch (err) {}
  }
  if (!copiedPlanTasks || copiedPlanTasks.length === 0) {
    if (typeof showToast === 'function') {
      showToast('Presse-papier vide. Cliquez sur un événement et faites ⌘C d\'abord.', 'info');
    }
    return false;
  }

  const targetDate = (targetGridSlot && targetGridSlot.date) ? targetGridSlot.date : TODAY_STR;
  const targetTime = (targetGridSlot && targetGridSlot.time) ? targetGridSlot.time : '09:00';

  const newPastedIds = [];
  copiedPlanTasks.forEach((srcTask, index) => {
    const newId = 'plan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    
    const clonedSubtasks = Array.isArray(srcTask.subtasks) ? srcTask.subtasks.map(s => ({
      ...s,
      id: 'sub_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      completed: false
    })) : [];

    let pastedTime = targetTime;
    if (index > 0 && targetTime) {
      const [th, tm] = targetTime.split(':').map(Number);
      const newMinutes = (th * 60 + tm + (index * (srcTask.duration || 30))) % (24 * 60);
      const nh = String(Math.floor(newMinutes / 60)).padStart(2, '0');
      const nm = String(newMinutes % 60).padStart(2, '0');
      pastedTime = `${nh}:${nm}`;
    }

    const newTask = {
      ...srcTask,
      id: newId,
      date: targetDate,
      time: srcTask.allDay ? '' : pastedTime,
      subtasks: clonedSubtasks,
      completed: false,
      isRollover: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    window.SpanPlanState.tasks.push(newTask);
    newPastedIds.push(newId);
  });

  savePlanState();
  renderPlanGrid(true);
  if (typeof renderBacklogDrawer === 'function') renderBacklogDrawer();

  selectedTaskIds.clear();
  newPastedIds.forEach(id => selectedTaskIds.add(id));
  updateSelectionVisuals();

  if (typeof showToast === 'function') {
    const label = newPastedIds.length === 1 
      ? `📋 Collé : "${copiedPlanTasks[0].title}" à ${targetTime} (${targetDate})`
      : `📋 ${newPastedIds.length} éléments collés le ${targetDate}`;
    showToast(label, 'success');
  }
  return true;
}
window.pastePlanTask = pastePlanTask;

// DRAG & DROP HTML5 POUR LE DOCK / BACKLOG / SOUS-TÂCHES
var draggedTaskId = null;
window.draggedSubtaskInfo = null;
window.draggedBatchSubtasksInfo = null;

function handleDragStart(e, id) {
  draggedTaskId = id;
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  }
  const blockEl = document.getElementById(`block_${id}`);
  if (blockEl) blockEl.classList.add('dragging');
}

function handleSubtaskDragStart(e, parentId, subtaskId) {
  e.stopPropagation();
  const allTasks = window.SpanPlanState.tasks;
  const parent = allTasks.find(t => t.id === parentId);
  if (!parent || !Array.isArray(parent.subtasks)) return;

  const sub = parent.subtasks.find(s => String(s.id) === String(subtaskId));
  if (!sub) return;

  window.draggedSubtaskInfo = {
    parentId,
    subtaskId,
    subtask: { ...sub }
  };

  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'subtask', parentId, subtaskId }));
    e.dataTransfer.effectAllowed = 'move';
  }

  const overlay = document.getElementById('subtasksModalOverlay');
  if (overlay) {
    overlay.classList.add('dragging-subtask-active');
  }
  document.body.classList.add('is-dragging-subtask');
}

function handleSubtaskDragEnd(e) {
  const overlay = document.getElementById('subtasksModalOverlay');
  if (overlay) {
    overlay.classList.remove('dragging-subtask-active');
  }
  document.body.classList.remove('is-dragging-subtask');
  document.querySelectorAll('.schedule-block-item.subtask-drop-target').forEach(b => b.classList.remove('subtask-drop-target'));
  document.querySelectorAll('.schedule-grid-canvas.drag-over').forEach(c => c.classList.remove('drag-over'));
  document.querySelectorAll('.day-dock.drag-over').forEach(d => d.classList.remove('drag-over'));
  document.querySelectorAll('.cal-allday-drop-cell.drag-over').forEach(d => d.classList.remove('drag-over'));
  window.draggedSubtaskInfo = null;
}

function handleBatchSubtasksDragStart(e, parentId) {
  e.stopPropagation();
  const allTasks = window.SpanPlanState.tasks;
  const parent = allTasks.find(t => t.id === parentId);
  if (!parent || !Array.isArray(parent.subtasks)) return;

  const unfinished = parent.subtasks.filter(s => !s.completed);
  if (unfinished.length === 0) return;

  window.draggedBatchSubtasksInfo = {
    parentId,
    subtasks: unfinished.map(s => ({ ...s }))
  };

  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'batch_subtasks', parentId, count: unfinished.length }));
    e.dataTransfer.effectAllowed = 'move';
  }

  const overlay = document.getElementById('subtasksModalOverlay');
  if (overlay) {
    overlay.classList.add('dragging-subtask-active');
  }
  document.body.classList.add('is-dragging-subtask');
}

function handleBatchSubtasksDragEnd(e) {
  const overlay = document.getElementById('subtasksModalOverlay');
  if (overlay) {
    overlay.classList.remove('dragging-subtask-active');
  }
  document.body.classList.remove('is-dragging-subtask');
  document.querySelectorAll('.schedule-block-item.subtask-drop-target').forEach(b => b.classList.remove('subtask-drop-target'));
  document.querySelectorAll('.schedule-grid-canvas.drag-over').forEach(c => c.classList.remove('drag-over'));
  document.querySelectorAll('.day-dock.drag-over').forEach(d => d.classList.remove('drag-over'));
  document.querySelectorAll('.cal-allday-drop-cell.drag-over').forEach(d => d.classList.remove('drag-over'));
  window.draggedBatchSubtasksInfo = null;
}

function handleDragEnd(e) {
  if (draggedTaskId) {
    const blockEl = document.getElementById(`block_${draggedTaskId}`);
    if (blockEl) blockEl.classList.remove('dragging');
  }
  if (window.draggedSubtaskInfo) {
    handleSubtaskDragEnd(e);
  }
  if (window.draggedBatchSubtasksInfo) {
    handleBatchSubtasksDragEnd(e);
  }
  const ghost = document.getElementById('canvasDragGhost');
  if (ghost) ghost.remove();
  document.querySelectorAll('.schedule-grid-canvas.drag-over').forEach(c => c.classList.remove('drag-over'));
  document.querySelectorAll('.day-dock.drag-over').forEach(d => d.classList.remove('drag-over'));
  document.querySelectorAll('.cal-allday-drop-cell.drag-over').forEach(d => d.classList.remove('drag-over'));
  document.querySelectorAll('.schedule-block-item.subtask-drop-target').forEach(b => b.classList.remove('subtask-drop-target'));
  draggedTaskId = null;
}

window.addEventListener('dragend', handleDragEnd);

function handleSubtaskDropOnBlock(e, targetBlockId) {
  if (!window.draggedSubtaskInfo) return;
  const { parentId, subtaskId, subtask } = window.draggedSubtaskInfo;

  if (parentId === targetBlockId) {
    handleSubtaskDragEnd(e);
    return;
  }

  const allTasks = window.SpanPlanState.tasks;
  const sourceParent = allTasks.find(t => t.id === parentId || (t.focusId && t.focusId === parentId));
  const targetParent = allTasks.find(t => t.id === targetBlockId || (t.focusId && t.focusId === targetBlockId));

  if (!sourceParent || !targetParent) {
    handleSubtaskDragEnd(e);
    return;
  }

  const cleanTargetTitle = (subtask.title || '').trim().toLowerCase();
  const validSubtaskId = subtaskId || subtask.id;

  // 1. Ajouter la sous-tâche au parent cible s'il n'y figure pas déjà
  if (!Array.isArray(targetParent.subtasks)) {
    targetParent.subtasks = [];
  }
  const alreadyInTarget = targetParent.subtasks.some(s => 
    validSubtaskId && String(s.id) === String(validSubtaskId)
  );

  const finalSubtaskId = validSubtaskId || ('sub_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36));
  if (!alreadyInTarget) {
    targetParent.subtasks.push({
      ...subtask,
      id: finalSubtaskId,
      context: subtask.context || targetParent.context || 'work',
      parentEventId: targetParent.focusId || targetParent.id
    });
  }
  targetParent.updated_at = new Date().toISOString();

  // 2. RETIRER RÉELLEMENT ET DÉFINITIVEMENT de TOUS les autres parents (y compris sourceParent)
  allTasks.forEach(task => {
    if (task.id === targetParent.id) return;
    if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
      const prevCount = task.subtasks.length;
      task.subtasks = task.subtasks.filter(s => {
        if (validSubtaskId && String(s.id) === String(validSubtaskId)) return false;
        return true;
      });
      if (task.subtasks.length !== prevCount) {
        task.updated_at = new Date().toISOString();
        syncSubtasksToFocus(task);
      }
    }
  });

  // 3. Mettre à jour Focus (span_tasks) pour lier ce sous-élément au nouveau parent
  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks')) || [];
    if (Array.isArray(focusTasks)) {
      let matchedInFocus = false;
      focusTasks.forEach(ft => {
        const matchesId = validSubtaskId && String(ft.id) === String(validSubtaskId);
        if (matchesId) {
          ft.parentEventId = targetParent.focusId || targetParent.id;
          ft.scheduledDate = targetParent.date || null;
          matchedInFocus = true;
        }
      });
      if (!matchedInFocus) {
        const catCapMap = { work: 'Work', life: 'Home', fun: 'Fun' };
        const subCtx = normalizePlanContext(subtask.context || targetParent.context || 'work');
        focusTasks.push({
          id: finalSubtaskId,
          title: (subtask.title || '').trim(),
          completed: !!subtask.completed,
          category: catCapMap[subCtx] || 'Work',
          estimate: 1,
          duration: 30,
          isEvent: false,
          isFavorite: false,
          parentEventId: targetParent.focusId || targetParent.id,
          scheduledDate: targetParent.date || null,
          scheduledTime: null
        });
      }
      localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
    }
  } catch (err) {}

  // 4. Synchroniser Focus avant de sauvegarder le Plan
  syncSubtasksToFocus(sourceParent);
  syncSubtasksToFocus(targetParent);

  handleSubtaskDragEnd(e);

  // 5. Sauvegarder l'état
  savePlanState();
  if (typeof syncPlanToCloud === 'function') syncPlanToCloud();

  if (currentSubtasksParentId) {
    if (sourceParent.subtasks.length === 0) {
      closeSubtasksModal();
    } else {
      renderSubtasksModalList();
    }
  }

  if (typeof showToast === 'function') {
    showToast(`Sous-tâche déplacée dans "${targetParent.title}"`, 'success');
  }
}

function handleSubtaskDropToDay(targetDate) {
  if (!window.draggedSubtaskInfo) return;
  const { parentId, subtaskId, subtask } = window.draggedSubtaskInfo;

  const allTasks = window.SpanPlanState.tasks;
  const sourceParent = allTasks.find(t => t.id === parentId || (t.focusId && t.focusId === parentId));
  if (!sourceParent) {
    handleSubtaskDragEnd();
    return;
  }

  const cleanTargetTitle = (subtask.title || '').trim().toLowerCase();
  const validSubtaskId = subtaskId || subtask.id;

  // 1. Créer un nouvel événement lié au jour sans heure précise
  const newEventId = 'task_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
  const newEvent = {
    id: newEventId,
    title: (subtask.title || 'Untitled event').trim(),
    date: targetDate,
    endDate: targetDate,
    time: '',
    allDay: true,
    type: 'event', // Événement lié au jour sans heure précise
    context: subtask.context || sourceParent.context || 'work',
    completed: !!subtask.completed,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtasks: []
  };

  allTasks.push(newEvent);

  // 2. RETIRER RÉELLEMENT ET DÉFINITIVEMENT de TOUS les blocs parents (y compris sourceParent)
  allTasks.forEach(task => {
    if (task.id === newEventId) return;
    if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
      const prevCount = task.subtasks.length;
      task.subtasks = task.subtasks.filter(s => {
        if (validSubtaskId && String(s.id) === String(validSubtaskId)) return false;
        return true;
      });
      if (task.subtasks.length !== prevCount) {
        task.updated_at = new Date().toISOString();
        syncSubtasksToFocus(task);
      }
    }
  });

  // 3. Mettre à jour Focus : détacher de parentEventId et passer en événement lié au jour
  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks')) || [];
    if (Array.isArray(focusTasks)) {
      focusTasks.forEach(ft => {
        const matchesId = validSubtaskId && String(ft.id) === String(validSubtaskId);
        if (matchesId) {
          ft.parentEventId = null;
          ft.date = targetDate;
          ft.scheduledDate = targetDate;
          ft.allDay = true;
          ft.time = null;
          ft.scheduledTime = null;
          ft.type = 'event';
        }
      });
      localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
    }
  } catch (err) {}

  syncSubtasksToFocus(sourceParent);

  handleSubtaskDragEnd();

  savePlanState();
  if (typeof syncPlanToCloud === 'function') syncPlanToCloud();

  if (currentSubtasksParentId) {
    if (sourceParent.subtasks.length === 0) {
      closeSubtasksModal();
    } else {
      renderSubtasksModalList();
    }
  }

  if (typeof showToast === 'function') {
    showToast(`Sous-tâche convertie en événement toute la journée (${targetDate})`, 'success');
  }
}

function detachSubtaskToDay(subtaskId) {
  if (!currentSubtasksParentId) return;
  const parent = window.SpanPlanState.tasks.find(t => t.id === currentSubtasksParentId);
  if (!parent || !Array.isArray(parent.subtasks)) return;

  const sub = parent.subtasks.find(s => String(s.id) === String(subtaskId));
  if (!sub) return;

  const targetDate = parent.date || TODAY_STR;
  window.draggedSubtaskInfo = {
    parentId: currentSubtasksParentId,
    subtaskId,
    subtask: { ...sub }
  };
  handleSubtaskDropToDay(targetDate);
}

function handleBatchSubtasksDropOnBlock(e, targetBlockId) {
  if (!window.draggedBatchSubtasksInfo) return;
  const { parentId, subtasks } = window.draggedBatchSubtasksInfo;

  if (parentId === targetBlockId) {
    handleBatchSubtasksDragEnd(e);
    return;
  }

  const allTasks = window.SpanPlanState.tasks;
  const sourceParent = allTasks.find(t => t.id === parentId || (t.focusId && t.focusId === parentId));
  const targetParent = allTasks.find(t => t.id === targetBlockId || (t.focusId && t.focusId === targetBlockId));

  if (!sourceParent || !targetParent) {
    handleBatchSubtasksDragEnd(e);
    return;
  }

  const movedIds = new Set(subtasks.map(s => String(s.id || '')).filter(Boolean));
  const movedTitles = new Set(subtasks.map(s => (s.title || '').trim().toLowerCase()).filter(Boolean));

  // 1. Ajouter au parent cible sans doublon
  if (!Array.isArray(targetParent.subtasks)) {
    targetParent.subtasks = [];
  }
  subtasks.forEach(s => {
    const already = targetParent.subtasks.some(ts => 
      s.id && String(ts.id) === String(s.id)
    );
    if (!already) {
      targetParent.subtasks.push({
        ...s,
        context: targetParent.context || s.context || 'work',
        parentEventId: targetParent.focusId || targetParent.id
      });
    }
  });
  targetParent.updated_at = new Date().toISOString();

  // 2. RETIRER RÉELLEMENT ET DÉFINITIVEMENT de TOUS les autres blocs
  allTasks.forEach(task => {
    if (task.id === targetParent.id) return;
    if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
      const prevCount = task.subtasks.length;
      task.subtasks = task.subtasks.filter(s => {
        if (s.id && movedIds.has(String(s.id))) return false;
        return true;
      });
      if (task.subtasks.length !== prevCount) {
        task.updated_at = new Date().toISOString();
        syncSubtasksToFocus(task);
      }
    }
  });

  // 3. Mettre à jour Focus (span_tasks)
  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks')) || [];
    if (Array.isArray(focusTasks)) {
      focusTasks.forEach(ft => {
        const matchesId = ft.id && movedIds.has(String(ft.id));
        if (matchesId) {
          ft.parentEventId = targetParent.focusId || targetParent.id;
        }
      });
      localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
    }
  } catch (err) {}

  syncSubtasksToFocus(sourceParent);
  syncSubtasksToFocus(targetParent);

  handleBatchSubtasksDragEnd(e);

  savePlanState();
  if (typeof syncPlanToCloud === 'function') syncPlanToCloud();

  if (currentSubtasksParentId) {
    if (sourceParent.subtasks.length === 0) {
      closeSubtasksModal();
    } else {
      renderSubtasksModalList();
    }
  }

  if (typeof showToast === 'function') {
    showToast(`${subtasks.length} sous-tâche${subtasks.length > 1 ? 's' : ''} déplacée${subtasks.length > 1 ? 's' : ''} dans "${targetParent.title}"`, 'success');
  }
}

function handleBatchSubtasksDropToCanvas(e, targetDate) {
  if (!window.draggedBatchSubtasksInfo) return;
  const { parentId, subtasks } = window.draggedBatchSubtasksInfo;

  const allTasks = window.SpanPlanState.tasks;
  const sourceParent = allTasks.find(t => t.id === parentId || (t.focusId && t.focusId === parentId));
  if (!sourceParent) {
    handleBatchSubtasksDragEnd(e);
    return;
  }

  const canvas = e.currentTarget;
  const rect = canvas ? canvas.getBoundingClientRect() : { top: 0 };
  const offsetY = Math.max(0, (e.clientY || 0) - rect.top);
  const hoursFraction = offsetY / HOUR_HEIGHT;
  let totalMinutes = Math.round((START_HOUR * 60) + (hoursFraction * 60));
  totalMinutes = Math.round(totalMinutes / 15) * 15;
  totalMinutes = Math.max(0, Math.min(23 * 60 + 45, totalMinutes));

  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const m = String(totalMinutes % 60).padStart(2, '0');
  const newTime = `${h}:${m}`;

  const movedIds = new Set(subtasks.map(s => String(s.id || '')).filter(Boolean));
  const movedTitles = new Set(subtasks.map(s => (s.title || '').trim().toLowerCase()).filter(Boolean));

  const newTaskId = 'task_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
  const continuationTask = {
    id: newTaskId,
    title: `${sourceParent.title} (suite)`,
    date: targetDate,
    endDate: targetDate,
    time: newTime,
    duration: sourceParent.duration || 60,
    allDay: false,
    type: sourceParent.type || 'task',
    context: sourceParent.context || 'work',
    completed: false,
    subtasks: subtasks.map(s => ({ ...s, completed: false, parentEventId: newTaskId })),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  allTasks.push(continuationTask);

  // Retirer les sous-tâches déplacées de tous les autres blocs
  allTasks.forEach(task => {
    if (task.id === newTaskId) return;
    if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
      const prevCount = task.subtasks.length;
      task.subtasks = task.subtasks.filter(s => {
        if (s.id && movedIds.has(String(s.id))) return false;
        if (s.title && movedTitles.has((s.title || '').trim().toLowerCase())) return false;
        return true;
      });
      if (task.subtasks.length !== prevCount) {
        task.updated_at = new Date().toISOString();
        syncSubtasksToFocus(task);
      }
    }
  });

  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks')) || [];
    if (Array.isArray(focusTasks)) {
      focusTasks.forEach(ft => {
        const matchesId = ft.id && movedIds.has(String(ft.id));
        const matchesTitle = ft.title && movedTitles.has(ft.title.trim().toLowerCase());
        if (matchesId || matchesTitle) {
          ft.parentEventId = continuationTask.id;
          ft.date = targetDate;
          ft.time = newTime;
        }
      });
      localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
    }
  } catch (err) {}

  syncSubtasksToFocus(sourceParent);
  syncSubtasksToFocus(continuationTask);

  handleBatchSubtasksDragEnd(e);

  savePlanState();
  if (typeof syncPlanToCloud === 'function') syncPlanToCloud();

  if (currentSubtasksParentId) {
    closeSubtasksModal();
  }

  if (typeof showToast === 'function') {
    showToast(`Suite créée : "${continuationTask.title}" (${newTime})`, 'success');
  }
}

function handleBatchSubtasksDropToDock(e, targetDate) {
  if (!window.draggedBatchSubtasksInfo) return;
  const { parentId, subtasks } = window.draggedBatchSubtasksInfo;

  const allTasks = window.SpanPlanState.tasks;
  const sourceParent = allTasks.find(t => t.id === parentId || (t.focusId && t.focusId === parentId));
  if (!sourceParent) {
    handleBatchSubtasksDragEnd(e);
    return;
  }

  const movedIds = new Set(subtasks.map(s => String(s.id || '')).filter(Boolean));
  const movedTitles = new Set(subtasks.map(s => (s.title || '').trim().toLowerCase()).filter(Boolean));

  const newTaskId = 'task_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
  const continuationTask = {
    id: newTaskId,
    title: `${sourceParent.title} (suite)`,
    date: targetDate,
    endDate: targetDate,
    time: '',
    allDay: true,
    type: 'task',
    context: sourceParent.context || 'work',
    completed: false,
    subtasks: subtasks.map(s => ({ ...s, completed: false, parentEventId: newTaskId })),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  allTasks.push(continuationTask);

  // Retirer les sous-tâches déplacées de tous les autres blocs
  allTasks.forEach(task => {
    if (task.id === newTaskId) return;
    if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
      const prevCount = task.subtasks.length;
      task.subtasks = task.subtasks.filter(s => {
        if (s.id && movedIds.has(String(s.id))) return false;
        if (s.title && movedTitles.has((s.title || '').trim().toLowerCase())) return false;
        return true;
      });
      if (task.subtasks.length !== prevCount) {
        task.updated_at = new Date().toISOString();
        syncSubtasksToFocus(task);
      }
    }
  });

  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks')) || [];
    if (Array.isArray(focusTasks)) {
      focusTasks.forEach(ft => {
        const matchesId = ft.id && movedIds.has(String(ft.id));
        const matchesTitle = ft.title && movedTitles.has(ft.title.trim().toLowerCase());
        if (matchesId || matchesTitle) {
          ft.parentEventId = continuationTask.id;
          ft.date = targetDate;
          ft.time = null;
          ft.allDay = true;
        }
      });
      localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
    }
  } catch (err) {}

  syncSubtasksToFocus(sourceParent);
  syncSubtasksToFocus(continuationTask);

  handleBatchSubtasksDragEnd(e);

  savePlanState();
  if (typeof syncPlanToCloud === 'function') syncPlanToCloud();

  if (currentSubtasksParentId) {
    closeSubtasksModal();
  }

  if (typeof showToast === 'function') {
    showToast(`Suite toute la journée créée : "${continuationTask.title}" (${targetDate})`, 'success');
  }
}

function handleBatchSubtasksDropToBacklog(e) {
  if (!window.draggedBatchSubtasksInfo) return;
  const { parentId, subtasks } = window.draggedBatchSubtasksInfo;

  const allTasks = window.SpanPlanState.tasks;
  const sourceParent = allTasks.find(t => t.id === parentId || (t.focusId && t.focusId === parentId));
  if (!sourceParent) {
    handleBatchSubtasksDragEnd(e);
    return;
  }

  const movedIds = new Set(subtasks.map(s => String(s.id || '')).filter(Boolean));
  const movedTitles = new Set(subtasks.map(s => (s.title || '').trim().toLowerCase()).filter(Boolean));

  const newTaskId = 'task_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
  const continuationTask = {
    id: newTaskId,
    title: `${sourceParent.title} (suite)`,
    date: null,
    endDate: null,
    time: '',
    allDay: false,
    type: 'task',
    context: sourceParent.context || 'work',
    completed: false,
    subtasks: subtasks.map(s => ({ ...s, completed: false, parentEventId: newTaskId })),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  allTasks.push(continuationTask);

  // Retirer les sous-tâches déplacées de tous les autres blocs
  allTasks.forEach(task => {
    if (task.id === newTaskId) return;
    if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
      const prevCount = task.subtasks.length;
      task.subtasks = task.subtasks.filter(s => {
        if (s.id && movedIds.has(String(s.id))) return false;
        if (s.title && movedTitles.has((s.title || '').trim().toLowerCase())) return false;
        return true;
      });
      if (task.subtasks.length !== prevCount) {
        task.updated_at = new Date().toISOString();
        syncSubtasksToFocus(task);
      }
    }
  });

  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks')) || [];
    if (Array.isArray(focusTasks)) {
      focusTasks.forEach(ft => {
        const matchesId = ft.id && movedIds.has(String(ft.id));
        const matchesTitle = ft.title && movedTitles.has(ft.title.trim().toLowerCase());
        if (matchesId || matchesTitle) {
          ft.parentEventId = continuationTask.id;
          ft.date = null;
          ft.time = null;
        }
      });
      localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
    }
  } catch (err) {}

  syncSubtasksToFocus(sourceParent);
  syncSubtasksToFocus(continuationTask);

  handleBatchSubtasksDragEnd(e);

  savePlanState();
  if (typeof syncPlanToCloud === 'function') syncPlanToCloud();

  if (currentSubtasksParentId) {
    closeSubtasksModal();
  }

  if (typeof showToast === 'function') {
    showToast(`Suite déplacée dans le Backlog : "${continuationTask.title}"`, 'info');
  }
}

function moveSubtaskToBacklog(parentId, subtaskId) {
  if (!parentId || !subtaskId) return false;

  const allTasks = window.SpanPlanState.tasks;
  const parent = allTasks.find(t => t.id === parentId || (t.focusId && t.focusId === parentId));
  if (!parent || !Array.isArray(parent.subtasks)) return false;

  const subIndex = parent.subtasks.findIndex(s => String(s.id) === String(subtaskId));
  if (subIndex === -1) return false;

  const subtask = parent.subtasks[subIndex];
  const targetTitle = (subtask.title || 'Untitled task').trim();
  const validSubtaskId = String(subtask.id || subtaskId);

  // 1. Retirer la sous-tâche du bloc parent
  parent.subtasks.splice(subIndex, 1);
  parent.updated_at = new Date().toISOString();

  // 2. Retirer aussi de tout autre parent au cas où
  allTasks.forEach(task => {
    if (task.id === parent.id) return;
    if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
      task.subtasks = task.subtasks.filter(s => String(s.id) !== validSubtaskId);
    }
  });

  // 3. Créer ou transformer en tâche racine du Backlog (en conservant l'identifiant)
  let existingRoot = allTasks.find(t => String(t.id) === validSubtaskId || (t.focusId && String(t.focusId) === validSubtaskId));
  if (existingRoot) {
    existingRoot.date = null;
    existingRoot.endDate = null;
    existingRoot.time = '';
    existingRoot.allDay = false;
    existingRoot.title = targetTitle;
    existingRoot.context = subtask.context || parent.context || 'work';
    existingRoot.completed = !!subtask.completed;
    existingRoot.updated_at = new Date().toISOString();
  } else {
    const newTask = {
      id: validSubtaskId,
      title: targetTitle,
      date: null,
      endDate: null,
      time: '',
      allDay: false,
      type: 'task',
      context: subtask.context || parent.context || 'work',
      completed: !!subtask.completed,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      subtasks: []
    };
    allTasks.unshift(newTask);
  }

  // 4. Mettre à jour Focus (span_tasks) : délier de parentEventId et passer en tâche Backlog
  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks')) || [];
    if (Array.isArray(focusTasks)) {
      let ftFound = false;
      const catMap = { work: 'Work', life: 'Home', fun: 'Fun' };
      focusTasks.forEach(ft => {
        if (!ft) return;
        const matchesId = (validSubtaskId && String(ft.id) === validSubtaskId) || (ft.planId && String(ft.planId) === validSubtaskId);
        if (matchesId) {
          ft.parentEventId = null;
          ft.date = null;
          ft.scheduledDate = null;
          ft.time = null;
          ft.scheduledTime = null;
          ft.completed = !!subtask.completed;
          if (subtask.context && catMap[subtask.context]) ft.category = catMap[subtask.context];
          ftFound = true;
        }
      });

      if (!ftFound) {
        focusTasks.unshift({
          id: validSubtaskId,
          planId: validSubtaskId,
          title: targetTitle,
          category: (subtask.context === 'life' ? 'Home' : (subtask.context === 'fun' ? 'Fun' : 'Work')),
          estimate: 1,
          duration: 30,
          completed: !!subtask.completed,
          isFavorite: false,
          isEvent: false,
          parentEventId: null,
          scheduledDate: null,
          scheduledTime: null
        });
      }
      localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
    }
  } catch (err) {}

  // 5. Retirer de la liste des identifiants supprimés s'il y figurait
  try {
    const dismissed = JSON.parse(localStorage.getItem('span_plan_dismissed_focus_ids')) || [];
    const updated = dismissed.filter(d => d !== validSubtaskId && d !== ('title:' + targetTitle.toLowerCase()));
    localStorage.setItem('span_plan_dismissed_focus_ids', JSON.stringify(updated));
  } catch (e) {}

  // 6. Synchroniser les sous-tâches du parent avec Focus
  if (typeof syncSubtasksToFocus === 'function') {
    syncSubtasksToFocus(parent);
  }

  // 7. Sauvegarder l'état
  savePlanState();
  if (typeof syncPlanToCloud === 'function') syncPlanToCloud();

  // 8. Mettre à jour la modale de sous-tâches si ouverte
  if (currentSubtasksParentId) {
    if (parent.subtasks.length === 0) {
      closeSubtasksModal();
    } else {
      renderSubtasksModalList();
    }
  }

  if (typeof showToast === 'function') {
    showToast(`Déplacé dans le Backlog : "${targetTitle}"`, 'info');
  }

  return true;
}
window.moveSubtaskToBacklog = moveSubtaskToBacklog;

function handleSubtaskDropToBacklog(e) {
  if (!window.draggedSubtaskInfo) return;
  const { parentId, subtaskId, subtask } = window.draggedSubtaskInfo;
  const targetSubId = subtaskId || (subtask ? subtask.id : null);
  moveSubtaskToBacklog(parentId, targetSubId);
  handleSubtaskDragEnd(e);
}

// ==============================================================
// CANVAS & DOCK DROP TARGETS
// ==============================================================
function allowCanvasDrop(e) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const canvas = e.currentTarget;
  canvas.classList.add('drag-over');

  if (window.draggedSubtaskInfo) {
    const { subtask } = window.draggedSubtaskInfo;
    const rect = canvas.getBoundingClientRect();
    const offsetY = Math.max(0, e.clientY - rect.top);

    const hoursFraction = offsetY / HOUR_HEIGHT;
    let totalMinutes = Math.round((START_HOUR * 60) + (hoursFraction * 60));
    totalMinutes = Math.round(totalMinutes / 15) * 15;
    totalMinutes = Math.max(0, Math.min(23 * 60 + 45, totalMinutes));

    const startH = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const startM = String(totalMinutes % 60).padStart(2, '0');
    const endTotal = totalMinutes + 45;
    const endH = String(Math.floor(endTotal / 60)).padStart(2, '0');
    const endM = String(endTotal % 60).padStart(2, '0');
    const timeRangeStr = `${startH}:${startM} – ${endH}:${endM}`;
    const top = ((totalMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;

    let ghost = document.getElementById('canvasDragGhost');
    if (!ghost) {
      ghost = document.createElement('div');
      ghost.id = 'canvasDragGhost';
      canvas.appendChild(ghost);
    } else if (ghost.parentElement !== canvas) {
      ghost.remove();
      canvas.appendChild(ghost);
    }

    ghost.className = `drag-preview-slot cat-${subtask.context || 'work'}`;
    ghost.style.top = `${top}px`;
    ghost.style.height = `34px`;
    ghost.innerHTML = `
      <div class="ghost-time-label">⏱ ${timeRangeStr} (45m)</div>
      <div class="ghost-title-label">${escapeHtml(subtask.title || 'Nouvelle tâche')}</div>
    `;
    return;
  }

  if (!draggedTaskId) return;
  const task = window.SpanPlanState.tasks.find(t => t.id === draggedTaskId);
  const duration = task ? (task.duration || 30) : 30;
  const context = task ? (task.context || 'work') : 'work';
  const isEvent = task ? (task.type === 'event') : false;

  const rect = canvas.getBoundingClientRect();
  const offsetY = Math.max(0, e.clientY - rect.top);

  const hoursFraction = offsetY / HOUR_HEIGHT;
  let totalMinutes = Math.round((START_HOUR * 60) + (hoursFraction * 60));
  totalMinutes = Math.round(totalMinutes / 15) * 15;
  totalMinutes = Math.max(0, Math.min(23 * 60 + 45, totalMinutes));

  const startH = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const startM = String(totalMinutes % 60).padStart(2, '0');
  const endTotal = totalMinutes + duration;
  const endH = String(Math.floor(endTotal / 60)).padStart(2, '0');
  const endM = String(endTotal % 60).padStart(2, '0');
  const timeRangeStr = `${startH}:${startM} – ${endH}:${endM}`;

  const top = ((totalMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(34, (duration / 60) * HOUR_HEIGHT);

  let ghost = document.getElementById('canvasDragGhost');
  if (!ghost) {
    ghost = document.createElement('div');
    ghost.id = 'canvasDragGhost';
    canvas.appendChild(ghost);
  } else if (ghost.parentElement !== canvas) {
    ghost.remove();
    canvas.appendChild(ghost);
  }

  ghost.className = `drag-preview-slot cat-${context}`;
  ghost.style.top = `${top}px`;
  ghost.style.height = `${height}px`;

  const titleText = task ? task.title : 'Déplacer ici';
  const icon = isEvent ? '📅 ' : '⏱ ';
  ghost.innerHTML = `
    <div class="ghost-time-label">${icon}${timeRangeStr} (${duration}m)</div>
    <div class="ghost-title-label">${titleText}</div>
  `;
}

function removeCanvasDropHighlight(e) {
  if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) {
    return;
  }
  e.currentTarget.classList.remove('drag-over');
  const ghost = document.getElementById('canvasDragGhost');
  if (ghost && ghost.parentElement === e.currentTarget) {
    ghost.remove();
  }
}

function handleBlockDragOver(e, targetBlockId) {
  const isDraggingTask = draggedTaskId && draggedTaskId !== targetBlockId;
  const isDraggingSubtask = window.draggedSubtaskInfo && window.draggedSubtaskInfo.parentId !== targetBlockId;
  const isDraggingBatch = window.draggedBatchSubtasksInfo && window.draggedBatchSubtasksInfo.parentId !== targetBlockId;

  if (!isDraggingTask && !isDraggingSubtask && !isDraggingBatch) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

  const ghost = document.getElementById('canvasDragGhost');
  if (ghost) ghost.remove();

  const blockEl = document.getElementById(`block_${targetBlockId}`);
  if (blockEl && !blockEl.classList.contains('subtask-drop-target')) {
    document.querySelectorAll('.schedule-block-item.subtask-drop-target').forEach(b => {
      if (b !== blockEl) b.classList.remove('subtask-drop-target');
    });
    blockEl.classList.add('subtask-drop-target');
  }
}

function handleBlockDragLeave(e, targetBlockId) {
  if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) {
    return;
  }
  const blockEl = document.getElementById(`block_${targetBlockId}`);
  if (blockEl) {
    blockEl.classList.remove('subtask-drop-target');
  }
}

function attachTaskAsSubtask(draggedId, targetBlockId) {
  if (!draggedId || !targetBlockId || draggedId === targetBlockId) return false;

  const allTasks = window.SpanPlanState.tasks;
  const draggedIndex = allTasks.findIndex(t => t.id === draggedId);
  const targetTask = allTasks.find(t => t.id === targetBlockId);

  if (draggedIndex === -1 || !targetTask) return false;

  const draggedTask = allTasks[draggedIndex];

  if (!Array.isArray(targetTask.subtasks)) {
    targetTask.subtasks = [];
  }

  const draggedTitleClean = (draggedTask.title || 'Untitled subtask').trim();
  const targetParentFocusId = targetTask.focusId || targetTask.id;

  const newSubtask = {
    id: draggedTask.focusId || draggedTask.id,
    title: draggedTitleClean,
    completed: !!draggedTask.completed,
    context: draggedTask.context || targetTask.context || 'work',
    parentEventId: targetParentFocusId
  };

  if (Array.isArray(draggedTask.subtasks) && draggedTask.subtasks.length > 0) {
    targetTask.subtasks.push(newSubtask, ...draggedTask.subtasks);
  } else {
    targetTask.subtasks.push(newSubtask);
  }

  // Mettre à jour Focus pour lier au parent
  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks')) || [];
    if (Array.isArray(focusTasks)) {
      const parentId = String(targetParentFocusId);
      const draggedIdStr = String(draggedTask.id);
      const draggedFocusId = String(draggedTask.focusId || draggedTask.id);
      let ftFound = false;
      focusTasks.forEach(ft => {
        if (!ft) return;
        if (String(ft.id) === draggedFocusId || (ft.planId && String(ft.planId) === draggedIdStr)) {
          ft.parentEventId = parentId;
          ft.scheduledDate = targetTask.date || null;
          ft.scheduledTime = null;
          ftFound = true;
        } else if (String(ft.parentEventId) === draggedFocusId || (draggedTask.planId && String(ft.parentEventId) === String(draggedTask.planId))) {
          ft.parentEventId = parentId;
        }
      });
      if (!ftFound) {
        focusTasks.push({
          id: draggedFocusId,
          planId: draggedTask.id,
          title: draggedTitleClean,
          category: (targetTask.context === 'life' ? 'Home' : (targetTask.context === 'fun' ? 'Fun' : 'Work')),
          estimate: 1,
          duration: 30,
          completed: !!draggedTask.completed,
          isFavorite: false,
          isEvent: false,
          parentEventId: parentId,
          scheduledDate: targetTask.date || null,
          scheduledTime: null
        });
      }
      localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
    }
  } catch (e) {}

  // Mettre à jour l'horodatage du parent
  targetTask.updated_at = new Date().toISOString();

  // Retirer la tâche glissée de la liste racine
  allTasks.splice(draggedIndex, 1);
  return true;
}

function handleBlockDrop(e, targetBlockId) {
  e.preventDefault();
  e.stopPropagation();

  const blockEl = document.getElementById(`block_${targetBlockId}`);
  if (blockEl) {
    blockEl.classList.remove('subtask-drop-target');
  }
  const ghost = document.getElementById('canvasDragGhost');
  if (ghost) ghost.remove();
  document.querySelectorAll('.schedule-block-item.subtask-drop-target').forEach(b => b.classList.remove('subtask-drop-target'));

  if (window.draggedBatchSubtasksInfo) {
    handleBatchSubtasksDropOnBlock(e, targetBlockId);
    return;
  }

  if (window.draggedSubtaskInfo) {
    handleSubtaskDropOnBlock(e, targetBlockId);
    return;
  }

  if (!draggedTaskId || draggedTaskId === targetBlockId) return;

  const targetTask = window.SpanPlanState.tasks.find(t => t.id === targetBlockId);
  const targetTitle = targetTask ? targetTask.title : 'block';
  const success = attachTaskAsSubtask(draggedTaskId, targetBlockId);
  draggedTaskId = null;

  if (success) {
    if (!window.expandedBlockAccordionIds) window.expandedBlockAccordionIds = new Set();
    window.expandedBlockAccordionIds.add(targetBlockId);
    savePlanState();
    if (typeof syncSubtasksToFocus === 'function' && targetTask) {
      syncSubtasksToFocus(targetTask);
    }
    if (typeof syncPlanToCloud === 'function') {
      syncPlanToCloud();
    }
    if (typeof showToast === 'function') {
      showToast(`Added as subtask of "${targetTitle}"`, 'success');
    }
  }
}

function handleSubtaskDropToCanvas(e, targetDate) {
  if (!window.draggedSubtaskInfo) return;
  const { parentId, subtaskId, subtask } = window.draggedSubtaskInfo;

  const allTasks = window.SpanPlanState.tasks;
  const sourceParent = allTasks.find(t => t.id === parentId || (t.focusId && t.focusId === parentId));
  if (!sourceParent) {
    handleSubtaskDragEnd(e);
    return;
  }

  const canvas = e ? e.currentTarget : null;
  let newTime = '09:00';
  if (canvas && e.clientY) {
    const rect = canvas.getBoundingClientRect();
    const offsetY = Math.max(0, e.clientY - rect.top);
    const hoursFraction = offsetY / HOUR_HEIGHT;
    let totalMinutes = Math.round((START_HOUR * 60) + (hoursFraction * 60));
    totalMinutes = Math.round(totalMinutes / 15) * 15;
    totalMinutes = Math.max(0, Math.min(23 * 60 + 45, totalMinutes));
    const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const m = String(totalMinutes % 60).padStart(2, '0');
    newTime = `${h}:${m}`;
  }

  const cleanTargetTitle = (subtask.title || '').trim().toLowerCase();
  const validSubtaskId = subtaskId || subtask.id;

  // 1. Créer le nouveau bloc pour la sous-tâche
  const newTaskId = 'task_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
  const newTask = {
    id: newTaskId,
    title: (subtask.title || 'Untitled task').trim(),
    date: targetDate,
    endDate: targetDate,
    time: newTime,
    duration: 30,
    allDay: false,
    type: 'task',
    context: subtask.context || sourceParent.context || 'work',
    completed: !!subtask.completed,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtasks: []
  };

  allTasks.push(newTask);

  // 2. RETIRER RÉELLEMENT ET DÉFINITIVEMENT de TOUS les blocs parents (y compris sourceParent)
  allTasks.forEach(task => {
    if (task.id === newTaskId) return;
    if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
      const prevCount = task.subtasks.length;
      task.subtasks = task.subtasks.filter(s => {
        if (validSubtaskId && String(s.id) === String(validSubtaskId)) return false;
        return true;
      });
      if (task.subtasks.length !== prevCount) {
        task.updated_at = new Date().toISOString();
        syncSubtasksToFocus(task);
      }
    }
  });

  // 3. Mettre à jour Focus (span_tasks) pour détacher de parentEventId
  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks')) || [];
    if (Array.isArray(focusTasks)) {
      focusTasks.forEach(ft => {
        const matchesId = validSubtaskId && String(ft.id) === String(validSubtaskId);
        if (matchesId) {
          ft.parentEventId = null;
          ft.date = targetDate;
          ft.scheduledDate = targetDate;
          ft.time = newTime;
          ft.scheduledTime = newTime;
        }
      });
      localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
    }
  } catch (err) {}

  syncSubtasksToFocus(sourceParent);

  handleSubtaskDragEnd(e);

  savePlanState();
  if (typeof syncPlanToCloud === 'function') syncPlanToCloud();

  if (currentSubtasksParentId) {
    if (sourceParent.subtasks.length === 0) {
      closeSubtasksModal();
    } else {
      renderSubtasksModalList();
    }
  }

  if (typeof showToast === 'function') {
    showToast(`Sous-tâche planifiée à ${newTime} (${targetDate})`, 'success');
  }
}

function handleCanvasDrop(e, targetDate) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const ghost = document.getElementById('canvasDragGhost');
  if (ghost) ghost.remove();

  if (window.draggedBatchSubtasksInfo) {
    handleBatchSubtasksDropToCanvas(e, targetDate);
    return;
  }

  if (window.draggedSubtaskInfo) {
    handleSubtaskDropToCanvas(e, targetDate);
    return;
  }

  if (!draggedTaskId) return;

  const canvas = e.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const offsetY = Math.max(0, e.clientY - rect.top);

  const hoursFraction = offsetY / HOUR_HEIGHT;
  let totalMinutes = Math.round((START_HOUR * 60) + (hoursFraction * 60));
  totalMinutes = Math.round(totalMinutes / 15) * 15;
  totalMinutes = Math.max(0, Math.min(23 * 60 + 45, totalMinutes));

  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const m = String(totalMinutes % 60).padStart(2, '0');
  const newTime = `${h}:${m}`;

  const task = window.SpanPlanState.tasks.find(t => t.id === draggedTaskId);
  if (task) {
    task.date = targetDate;
    task.endDate = targetDate;
    task.time = newTime;
    task.allDay = false;
    task.isRollover = false;
    task.updated_at = new Date().toISOString();
    savePlanState();
    if (typeof showToast === 'function') {
      const typeLabel = task.type === 'event' ? 'Event scheduled' : 'Task scheduled';
      showToast(`${typeLabel}: ${newTime} (${targetDate})`, 'success');
    }
  }
  draggedTaskId = null;
}

function allowDockDrop(e) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function removeDockDropHighlight(e) {
  if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) {
    return;
  }
  e.currentTarget.classList.remove('drag-over');
}

function handleDropToDock(e, targetDate) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const ghost = document.getElementById('canvasDragGhost');
  if (ghost) ghost.remove();

  if (window.draggedBatchSubtasksInfo) {
    handleBatchSubtasksDropToDock(e, targetDate);
    return;
  }

  if (window.draggedSubtaskInfo) {
    handleSubtaskDropToDay(targetDate);
    return;
  }

  if (!draggedTaskId) return;

  const task = window.SpanPlanState.tasks.find(t => t.id === draggedTaskId);
  if (task) {
    task.date = targetDate;
    task.endDate = targetDate;
    task.time = '';
    task.allDay = true;
    task.isRollover = false;
    task.updated_at = new Date().toISOString();
    savePlanState();
    if (typeof showToast === 'function') {
      const typeLabel = task.type === 'event' ? 'Event moved' : 'Task moved';
      showToast(`${typeLabel} to day's to-do dock (${targetDate})`, 'info');
    }
  }
  draggedTaskId = null;
}

function allowDrop(e) {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move';
  }
  const backlogTarget = e.currentTarget.closest('.sidebar-backlog-section, #backlogDrawer, .btn-backlog-toggle, #mobileNavBacklog') || e.currentTarget;
  if (backlogTarget && !backlogTarget.classList.contains('drag-over')) {
    backlogTarget.classList.add('drag-over');
  }
}
window.allowDrop = allowDrop;

function handleBacklogDragLeave(e) {
  const target = e.currentTarget;
  if (!e.relatedTarget || !target.contains(e.relatedTarget)) {
    target.classList.remove('drag-over');
    const section = target.closest('.sidebar-backlog-section, #backlogDrawer, .btn-backlog-toggle, #mobileNavBacklog');
    if (section) section.classList.remove('drag-over');
  }
}
window.handleBacklogDragLeave = handleBacklogDragLeave;

function handleDropToBacklog(e) {
  e.preventDefault();
  e.stopPropagation();
  const ghost = document.getElementById('canvasDragGhost');
  if (ghost) ghost.remove();

  document.querySelectorAll('.drag-over, .dock-drop-hover').forEach(el => el.classList.remove('drag-over', 'dock-drop-hover'));

  if (window.draggedBatchSubtasksInfo) {
    handleBatchSubtasksDropToBacklog(e);
    return;
  }

  // Vérification de sous-tâche glissée (via état global ou via dataTransfer)
  let subtaskDropInfo = window.draggedSubtaskInfo;
  if (!subtaskDropInfo && e.dataTransfer) {
    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (raw && raw.startsWith('{')) {
        const parsed = JSON.parse(raw);
        if (parsed.type === 'subtask' && parsed.parentId && parsed.subtaskId) {
          subtaskDropInfo = parsed;
        }
      }
    } catch (err) {}
  }

  if (subtaskDropInfo) {
    const { parentId, subtaskId, subtask } = subtaskDropInfo;
    const targetSubId = subtaskId || (subtask ? subtask.id : null);
    moveSubtaskToBacklog(parentId, targetSubId);
    handleSubtaskDragEnd(e);
    return;
  }

  let effectiveTaskId = draggedTaskId;
  if (!effectiveTaskId && e.dataTransfer) {
    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (raw && !raw.startsWith('{')) effectiveTaskId = raw.trim();
    } catch (err) {}
  }

  if (!effectiveTaskId) return;

  const task = window.SpanPlanState.tasks.find(t => t.id === effectiveTaskId);
  if (task) {
    const hasSubtasks = Array.isArray(task.subtasks) && task.subtasks.length > 0;
    if (hasSubtasks) {
      const completedSubtasks = task.subtasks.filter(s => !!s.completed);
      const unfinishedSubtasks = task.subtasks.filter(s => !s.completed);

      if (completedSubtasks.length > 0 && unfinishedSubtasks.length > 0 && task.date) {
        task.subtasks = completedSubtasks;
        task.completed = true;
        task.updated_at = new Date().toISOString();

        const newBlock = {
          id: 'task_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36),
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
          subtasks: unfinishedSubtasks.map(s => ({
            id: String(s.id || ('sub_' + Math.random().toString(36).substr(2, 9))),
            title: (s.title || 'Untitled task').trim(),
            context: s.context || task.context || 'work',
            completed: false
          })),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        window.SpanPlanState.tasks.unshift(newBlock);
        if (typeof syncSubtasksToFocus === 'function') {
          syncSubtasksToFocus(task);
          syncSubtasksToFocus(newBlock);
        }
        savePlanState();
        if (typeof syncPlanToCloud === 'function') syncPlanToCloud();
        if (typeof showToast === 'function') {
          showToast(`Sous-tâches restantes de "${task.title}" déplacées dans le Backlog`, 'info');
        }
        draggedTaskId = null;
        return;
      }
    }

    task.date = null;
    task.endDate = null;
    task.time = '';
    task.allDay = false;
    task.isRollover = false;
    task.updated_at = new Date().toISOString();
    savePlanState();
    if (typeof syncPlanToCloud === 'function') syncPlanToCloud();
    if (typeof showToast === 'function') {
      showToast(`Déplacé dans le Backlog : "${task.title}"`, 'info');
    }
  }
  draggedTaskId = null;
}


window.SpanPlanState = window.SpanPlanState || {};

function getLocalDateString(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const TODAY_STR = getLocalDateString();
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const YESTERDAY_STR = getLocalDateString(yesterday);

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const TOMORROW_STR = getLocalDateString(tomorrow);

// CYCLE COMPLET 24 HEURES (00:00 - 23:59)
const START_HOUR = 0;
const END_HOUR = 23;
const HOUR_HEIGHT = 54;

function normalizePlanContext(cat) {
  if (!cat) return 'work';
  const c = String(cat).toLowerCase();
  if (c === 'work' || c === 'code' || c === 'study' || c === 'write') return 'work';
  if (c === 'life' || c === 'home' || c === 'admin' || c === 'personal') return 'life';
  if (c === 'fun' || c === 'health' || c === 'self') return 'fun';
  return 'work';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderTitleWithTagsHtml(titleStr) {
  if (!titleStr) return 'Untitled';
  return titleStr.replace(/#([\w\-]+)/g, (match, tag) => {
    return `<span class="task-inline-tag" onclick="event.stopPropagation(); filterByTag('${tag}')">#${tag}</span>`;
  });
}

const hasStoredData = localStorage.getItem('span_plan_tasks') !== null;
let rawTasks = [];
try {
  rawTasks = JSON.parse(localStorage.getItem('span_plan_tasks'));
} catch (e) {
  rawTasks = null;
}

function isMockSampleTask(t) {
  if (!t || !t.id) return true;
  const title = (t.title || '').trim().toLowerCase();
  if (t.id === 'p_sample_today_1' || t.id === 'p_sample_today_2' || t.id === 'sub_standup_1') return true;
  if (title === 'team standup meeting #work' || title === 'grocery shopping #life' || title === 'grocery shopping #home' || title === 'préparer mes 3 points clés #work') return true;
  return false;
}

if (!hasStoredData) {
  window.SpanPlanState.tasks = [];
} else {
  const cleanTasks = Array.isArray(rawTasks)
    ? rawTasks.filter(t => !isMockSampleTask(t))
    : [];
  window.SpanPlanState.tasks = cleanTasks.map(t => ({
    id: t.id || ('p_' + Math.random().toString(36).substr(2, 9)),
    title: t.title || 'Untitled',
    type: t.type === 'event' ? 'event' : 'task',
    date: (t.date && t.date.trim() !== '') ? t.date.slice(0, 10) : null,
    time: t.time || '',
    duration: typeof t.duration === 'number' ? t.duration : 45,
    context: normalizePlanContext(t.context || t.category),
    completed: !!t.completed,
    isRollover: !!t.isRollover,
    fromFocus: !!t.fromFocus,
    focusId: t.focusId || null,
    subtasks: Array.isArray(t.subtasks) ? t.subtasks : []
  }));
}

// ==============================================================
// PASSERELLE DE SYNCHRONISATION SPAN FOCUS -> SPAN PLAN BACKLOG
// ==============================================================
function syncFocusTasksToPlanBacklog(shouldSave = true, customFocusTasks = null) {
  let focusTasks = [];
  if (Array.isArray(customFocusTasks)) {
    focusTasks = customFocusTasks;
  } else {
    try {
      focusTasks = JSON.parse(localStorage.getItem('span_tasks')) || [];
    } catch (e) {
      focusTasks = [];
    }
  }

  if (!Array.isArray(focusTasks) || focusTasks.length === 0) return false;

  let dismissedFocusIds = [];
  try {
    dismissedFocusIds = JSON.parse(localStorage.getItem('span_plan_dismissed_focus_ids')) || [];
  } catch (e) {}

  let hasChanges = false;
  if (!window.SpanPlanState.tasks) window.SpanPlanState.tasks = [];
  const planTasks = window.SpanPlanState.tasks;

  // 1. Séparer les tâches racines des sous-tâches (child subtasks)
  const childSubtasks = focusTasks.filter(ft => ft && !!ft.parentEventId);
  const rootFocusTasks = focusTasks.filter(ft => ft && !ft.parentEventId);

  // Nettoyer les éventuelles sous-tâches qui auraient été importées comme tâches racines isolées
  if (childSubtasks.length > 0) {
    const prevCount = planTasks.length;
    window.SpanPlanState.tasks = planTasks.filter(pt => {
      const isAChildSubtask = childSubtasks.some(st => String(st.id) === String(pt.id) || String(st.id) === String(pt.focusId));
      return !isAChildSubtask;
    });
    if (window.SpanPlanState.tasks.length !== prevCount) {
      hasChanges = true;
    }
  }

  rootFocusTasks.forEach(ft => {
    if (!ft || !ft.title) return;
    const titleKey = 'title:' + ft.title.trim().toLowerCase();
    if (ft.id && dismissedFocusIds.includes(ft.id)) return;
    if (ft.focusId && dismissedFocusIds.includes(ft.focusId)) return;
    if (dismissedFocusIds.includes(titleKey)) return;
    
    // Rechercher si cette tâche existe déjà dans Span Plan (qu'elle soit planifiée sur un jour ou en backlog)
    let existing = window.SpanPlanState.tasks.find(pt => 
      pt.id === ft.id || 
      pt.focusId === ft.id ||
      (pt.title && ft.title && pt.title.trim().toLowerCase() === ft.title.trim().toLowerCase())
    );

    // Récupérer et formater les sous-tâches associées à cette tâche/événement
    const mySubtasks = childSubtasks.filter(st => String(st.parentEventId) === String(ft.id) || (ft.planId && String(st.parentEventId) === String(ft.planId)));
    const formattedSubtasks = mySubtasks.map(st => ({
      id: st.id,
      title: st.title,
      context: normalizePlanContext(st.category),
      completed: !!st.completed,
      parentEventId: ft.id
    }));

    if (!existing) {
      // Nouvelle tâche provenant de Span Focus -> Intégration directe
      const cat = ft.category ? String(ft.category).toLowerCase() : 'work';
      const normalizedContext = normalizePlanContext(cat);
      const isEv = !!ft.isEvent || ft.type === 'event';
      
      const newBacklogTask = {
        id: ft.id || ('t_' + Date.now() + Math.random().toString(36).substr(2, 4)),
        focusId: ft.id || null,
        title: ft.title,
        type: isEv ? 'event' : 'task',
        date: ft.scheduledDate || null,
        time: ft.scheduledTime || '',
        duration: ft.duration || (ft.estimate ? ft.estimate * 25 : 45),
        context: normalizedContext,
        completed: !!ft.completed,
        isRollover: false,
        fromFocus: true,
        subtasks: formattedSubtasks
      };
      window.SpanPlanState.tasks.unshift(newBacklogTask);
      hasChanges = true;
    } else {
      // Conserver le lien de provenance Focus
      if (!existing.focusId && ft.id) {
        existing.focusId = ft.id;
      }
      existing.fromFocus = true;

      if (ft.isEvent && existing.type !== 'event') {
        existing.type = 'event';
        hasChanges = true;
      }

      // Synchronisation du statut de complétion
      if (ft.completed && !existing.completed) {
        existing.completed = true;
        hasChanges = true;
      }

      // Synchronisation des sous-tâches
      if (formattedSubtasks.length > 0 || (existing.subtasks && existing.subtasks.length > 0)) {
        existing.subtasks = formattedSubtasks;
        hasChanges = true;
      }
    }
  });

  if (hasChanges && shouldSave) {
    savePlanState();
  }
  return hasChanges;
}

function toggleSubtaskCompletion(parentTaskId, subtaskId) {
  const parentTask = window.SpanPlanState.tasks.find(t => t.id === parentTaskId);
  if (!parentTask || !parentTask.subtasks) return;
  const sub = parentTask.subtasks.find(s => s.id === subtaskId);
  if (!sub) return;
  sub.completed = !sub.completed;

  // Sync to Focus
  syncPlanSubtaskUpdateToFocus(subtaskId, sub.completed);

  savePlanState();
}

function syncPlanSubtaskUpdateToFocus(subtaskId, isCompleted) {
  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks'));
    if (!Array.isArray(focusTasks)) return;

    let modified = false;
    focusTasks.forEach(ft => {
      if (ft.id === subtaskId) {
        if (ft.completed !== isCompleted) {
          ft.completed = isCompleted;
          modified = true;
        }
      }
    });

    if (modified) {
      localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
      if (typeof supabaseClient !== 'undefined' && supabaseClient && typeof SYNC_USER_ID !== 'undefined') {
        supabaseClient.from('user_state').update({
          focus_tasks: focusTasks,
          updated_at: new Date().toISOString()
        }).eq('id', SYNC_USER_ID).then(() => {}).catch(() => {});
      }
    }
  } catch (e) {
    // Non bloquant
  }
}

function syncPlanTaskUpdateToFocus(taskId, isCompleted, title) {
  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks'));
    if (!Array.isArray(focusTasks)) return;

    let modified = false;
    focusTasks.forEach(ft => {
      if (ft.id === taskId || (title && ft.title && ft.title.trim().toLowerCase() === title.trim().toLowerCase())) {
        if (isCompleted !== undefined && ft.completed !== isCompleted) {
          ft.completed = isCompleted;
          modified = true;
        }
      }
    });

    if (modified) {
      localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
      if (typeof supabaseClient !== 'undefined' && supabaseClient && typeof SYNC_USER_ID !== 'undefined') {
        supabaseClient.from('user_state').update({
          focus_tasks: focusTasks,
          updated_at: new Date().toISOString()
        }).eq('id', SYNC_USER_ID).then(() => {}).catch(() => {});
      }
    }
  } catch (e) {
    // Non bloquant
  }
}

// Synchronisation initiale au démarrage
syncFocusTasksToPlanBacklog(false);

// Synchronisation temps réel inter-onglets (si Focus et Plan sont ouverts en parallèle)
window.addEventListener('storage', (e) => {
  if (e.key === 'span_tasks') {
    syncFocusTasksToPlanBacklog(true);
  }
});

let visibleDaysCount = parseInt(localStorage.getItem('span_plan_visible_days')) || 3;
if (visibleDaysCount < 3) visibleDaysCount = 3;

let currentTimelineOffset = 0;
let currentContextFilter = 'all';
let currentTagFilter = null;
let isDrawerPinned = localStorage.getItem('span_plan_drawer_pinned') !== 'false';

let editingTaskId = null;
let editingContext = 'work';
let editingItemType = 'task';
let popoverTargetTaskId = null;

function autoRecoverTodayTasks() {
  let modified = false;
  window.SpanPlanState.tasks.forEach(t => {
    if (t.date === '' || t.date === 'undefined' || t.date === 'null') {
      t.date = TODAY_STR;
      modified = true;
    }
  });
  if (modified) savePlanState();
}

function recoverMissingTasks() {
  let count = 0;
  window.SpanPlanState.tasks.forEach(t => {
    if (!t.date || t.date === '' || t.date < TODAY_STR) {
      t.date = TODAY_STR;
      t.time = '';
      t.completed = false;
      count++;
    }
  });
  savePlanState();
  currentTagFilter = null;
  setContextFilter('all');
  if (typeof closeSettingsModal === 'function') closeSettingsModal();
  if (typeof showToast === 'function') {
    showToast(`${count} task${count > 1 ? 's' : ''} recovered to Today's To-do dock`, 'info');
  } else {
    alert(`${count} task${count > 1 ? 's' : ''} recovered to Today's To-do dock!`);
  }
}

function filterByTag(tag) {
  currentTagFilter = (currentTagFilter === tag) ? null : tag;
  renderPlanGrid();
  renderBacklogDrawer();
}

function executeAutoRollover() {
  let hasChanges = false;
  window.SpanPlanState.tasks.forEach(task => {
    if (task.date && task.date < TODAY_STR && !task.completed) {
      task.date = TODAY_STR;
      task.time = '';
      task.isRollover = true;
      hasChanges = true;
    }
  });

  if (hasChanges) savePlanState();
}

function savePlanState() {
  localStorage.setItem('span_plan_tasks', JSON.stringify(window.SpanPlanState.tasks));
  renderPlanGrid();
  renderBacklogDrawer();
  updateCounters();
  if (typeof syncPlanToCloud === 'function') syncPlanToCloud();
}

function formatMinutesDuration(totalM) {
  if (totalM <= 0) return '0h';
  const h = Math.floor(totalM / 60);
  const m = totalM % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function renderDayCapacityHtml(timedTasks) {
  const workM = timedTasks.filter(t => t.context === 'work').reduce((acc, t) => acc + (t.duration || 45), 0);
  const lifeM = timedTasks.filter(t => t.context === 'life').reduce((acc, t) => acc + (t.duration || 45), 0);
  const funM  = timedTasks.filter(t => t.context === 'fun').reduce((acc, t) => acc + (t.duration || 45), 0);
  const totalM = workM + lifeM + funM;

  const maxBudget = Math.max(480, totalM); // Baseline 8h
  const pctWork = Math.min(100, (workM / maxBudget) * 100);
  const pctLife = Math.min(100, (lifeM / maxBudget) * 100);
  const pctFun  = Math.min(100, (funM  / maxBudget) * 100);

  const breakdownTitle = `${timedTasks.length} item${timedTasks.length > 1 ? 's' : ''} scheduled • Work: ${formatMinutesDuration(workM)} · Life: ${formatMinutesDuration(lifeM)} · Fun: ${formatMinutesDuration(funM)}`;

  return `
    <div class="day-capacity-tracker" title="${breakdownTitle}">
      <div class="day-capacity-bar-bg">
        <div class="day-capacity-seg seg-work" style="width: ${pctWork}%;"></div>
        <div class="day-capacity-seg seg-life" style="width: ${pctLife}%;"></div>
        <div class="day-capacity-seg seg-fun"  style="width: ${pctFun}%;"></div>
      </div>
      <div class="day-capacity-meta">
        <span class="day-capacity-total">${totalM > 0 ? formatMinutesDuration(totalM) : 'Free day'}</span>
      </div>
    </div>
  `;
}

function handleCanvasHoverMove(e) {
  if (isPointerDragging || hasMovedBeyondThreshold || draggedTaskId || isDrawingMarquee) {
    const existing = document.getElementById('gridHoverSlot');
    if (existing) existing.remove();
    return;
  }
  if (e.target.closest('.schedule-block-item') || e.target.closest('.resize-handle') || e.target.closest('.now-timeline-marker')) {
    const existing = document.getElementById('gridHoverSlot');
    if (existing) existing.remove();
    return;
  }

  const canvas = e.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const offsetY = Math.max(0, e.clientY - rect.top);

  let minutes = Math.round((offsetY / HOUR_HEIGHT) * 60);
  minutes = Math.round(minutes / 15) * 15;
  minutes = Math.max(0, Math.min(23 * 60 + 45, minutes));

  const top = ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');

  let slot = document.getElementById('gridHoverSlot');
  if (!slot) {
    slot = document.createElement('div');
    slot.id = 'gridHoverSlot';
    canvas.appendChild(slot);
  } else if (slot.parentElement !== canvas) {
    slot.remove();
    canvas.appendChild(slot);
  }

  slot.className = 'grid-hover-slot';
  slot.style.top = `${top}px`;
  slot.innerHTML = `<span class="hover-slot-icon">+</span><span>${h}:${m} (45m)</span>`;
}

function handleCanvasHoverLeave(e) {
  const slot = document.getElementById('gridHoverSlot');
  if (slot) slot.remove();
}

function isMobileScreen() {
  return window.innerWidth <= 768;
}

function calculateVisibleDates() {
  const dates = [];
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + currentTimelineOffset);

  const count = isMobileScreen() ? 1 : visibleDaysCount;

  for (let i = 0; i < count; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function renderPlanGrid(forceRebuild = false) {
  const grid = document.getElementById('plannerGrid');
  if (!grid) return;

  const visibleDates = calculateVisibleDates();
  const visibleDateStrs = visibleDates.map(d => getLocalDateString(d));
  grid.classList.toggle('view-single', visibleDates.length === 1);

  // Vérifier si les colonnes existantes correspondent exactement aux dates affichées
  const existingCols = Array.from(grid.querySelectorAll('.day-column'));
  const existingDateStrs = existingCols.map(c => c.dataset.date);
  const canUpdateInPlace = !forceRebuild && 
    existingDateStrs.length === visibleDateStrs.length &&
    existingDateStrs.every((d, i) => d === visibleDateStrs[i]);

  if (canUpdateInPlace) {
    // MISE À JOUR IN-PLACE (Zéro rechargement d'écran, conservation totale du scroll)
    visibleDates.forEach((dateObj, idx) => {
      const dateStr = visibleDateStrs[idx];
      const isToday = (dateStr === TODAY_STR);
      const col = existingCols[idx];

      const dayTasks = window.SpanPlanState.tasks.filter(t => {
        const dateMatch = (t.date === dateStr);
        const contextMatch = (currentContextFilter === 'all' || t.context === currentContextFilter);
        const tagMatch = !currentTagFilter || (t.title && t.title.toLowerCase().includes(`#${currentTagFilter.toLowerCase()}`));
        return dateMatch && contextMatch && tagMatch;
      });

      const timedTasks = dayTasks.filter(t => !!t.time);
      const unscheduledTasks = dayTasks.filter(t => !t.time);

      // Jauge de charge dynamique Available-to-Promise
      const trackerEl = col.querySelector('.day-capacity-tracker');
      if (trackerEl) {
        trackerEl.outerHTML = renderDayCapacityHtml(timedTasks);
      }

      // Grille horaire : mémoriser et restaurer instantanément le scroll
      const scrollContainer = col.querySelector('.day-schedule-scroll');
      const prevScroll = scrollContainer ? scrollContainer.scrollTop : null;

      const canvas = col.querySelector('.schedule-grid-canvas');
      if (canvas) {
        canvas.innerHTML = `
          ${renderHourLines()}
          <div class="cal-marquee"></div>
          ${renderTimedBlocks(timedTasks, dateStr)}
          ${isToday ? renderNowLineHtml() : ''}
        `;
      }

      if (scrollContainer) {
        const existingGuidance = scrollContainer.querySelector('.schedule-empty-guidance');
        if (existingGuidance) existingGuidance.remove();
      }

      if (scrollContainer && prevScroll !== null) {
        scrollContainer.scrollTop = prevScroll;
      }

      // Dock inférieur To-do
      const dockEl = col.querySelector('.day-dock');
      if (dockEl) {
        dockEl.classList.toggle('is-empty', unscheduledTasks.length === 0);
      }
      const dockCount = col.querySelector('.dock-count-pill');
      if (dockCount) dockCount.textContent = unscheduledTasks.length;

      const dockList = col.querySelector('.dock-task-list');
      if (dockList) dockList.innerHTML = renderUnscheduledList(unscheduledTasks);
    });

    updateRangeLabel(visibleDates);
    if (typeof renderDateStrip === 'function') renderDateStrip();
    return;
  }

  // RECONSTRUCTION (lors d'un changement de plage de dates ou de mode 3D/5D/7D)
  const savedScrolls = {};
  existingCols.forEach(col => {
    const sc = col.querySelector('.day-schedule-scroll');
    if (sc && col.dataset.date) {
      savedScrolls[col.dataset.date] = sc.scrollTop;
    }
  });

  grid.innerHTML = '';

  visibleDates.forEach(dateObj => {
    const dateStr = getLocalDateString(dateObj);
    const isToday = (dateStr === TODAY_STR);

    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const dayTasks = window.SpanPlanState.tasks.filter(t => {
      const dateMatch = (t.date === dateStr);
      const contextMatch = (currentContextFilter === 'all' || t.context === currentContextFilter);
      const tagMatch = !currentTagFilter || (t.title && t.title.toLowerCase().includes(`#${currentTagFilter.toLowerCase()}`));
      return dateMatch && contextMatch && tagMatch;
    });

    const timedTasks = dayTasks.filter(t => !!t.time);
    const unscheduledTasks = dayTasks.filter(t => !t.time);

    const col = document.createElement('div');
    col.className = `day-column ${isToday ? 'is-today' : ''}`;
    col.dataset.date = dateStr;

    col.innerHTML = `
      <div class="day-header">
        <div class="day-header-top">
          <div class="day-title-wrap">
            <span class="day-name">${isToday ? 'Today' : dayName}</span>
            <span class="day-date">${dayNum}</span>
          </div>
        </div>
        ${renderDayCapacityHtml(timedTasks)}
      </div>

      <div class="day-schedule-scroll" id="scheduleScroll_${dateStr}" data-date="${dateStr}">
        <div class="schedule-grid-canvas" 
             data-date="${dateStr}"
             onpointerdown="handleCanvasPointerDown(event, '${dateStr}')"
             onpointermove="handleCanvasHoverMove(event)"
             onpointerleave="handleCanvasHoverLeave(event)"
             ondragover="allowCanvasDrop(event)" 
             ondragleave="removeCanvasDropHighlight(event)"
             ondrop="handleCanvasDrop(event, '${dateStr}')"
             title="Click to create task or event at this time">
          ${renderHourLines()}
          <div class="cal-marquee"></div>
          ${renderTimedBlocks(timedTasks, dateStr)}
          ${isToday ? renderNowLineHtml() : ''}
        </div>
      </div>

      <div class="day-dock ${unscheduledTasks.length === 0 ? 'is-empty' : ''}" 
           data-date="${dateStr}"
           ondragover="allowDockDrop(event)" 
           ondragleave="removeDockDropHighlight(event)"
           ondrop="handleDropToDock(event, '${dateStr}')">
        <div class="dock-header">
          <span class="dock-title">📋 To-do</span>
          <span class="dock-count-pill">${unscheduledTasks.length}</span>
        </div>
        <div class="dock-inline-add">
          <input type="text" 
                 class="dock-add-input" 
                 placeholder="+ Add to-do..." 
                 onkeydown="if(event.key==='Enter') submitDockInlineAdd(event, '${dateStr}')">
        </div>
        <ul class="dock-task-list">
          ${renderUnscheduledList(unscheduledTasks)}
        </ul>
      </div>
    `;

    grid.appendChild(col);

    // Restaurer le scroll précédent s'il existait pour ce jour
    if (savedScrolls[dateStr] !== undefined) {
      const sc = col.querySelector('.day-schedule-scroll');
      if (sc) sc.scrollTop = savedScrolls[dateStr];
    }
  });

  updateRangeLabel(visibleDates);
  if (typeof renderDateStrip === 'function') renderDateStrip();
}

// ALGORITHME DE RÉSOLUTION DES CHEVAUCHEMENTS D'HORAIRES (MULTI-COLONNES STYLE GOOGLE/APPLE CALENDAR)
function computeOverlapLayout(tasks) {
  if (!tasks || tasks.length === 0) return [];

  const parsed = tasks.map(t => {
    const parts = (t.time || '00:00').split(':');
    const start = parseInt(parts[0], 10) * 60 + (parseInt(parts[1], 10) || 0);
    const duration = t.duration || 45;
    const end = start + duration;
    return { task: t, start, end, duration };
  });

  // Tri par heure de début croissante, puis par durée décroissante
  parsed.sort((a, b) => a.start - b.start || b.duration - a.duration);

  const clusters = [];
  let currentCluster = [];
  let clusterEnd = -1;

  parsed.forEach(item => {
    if (currentCluster.length === 0) {
      currentCluster.push(item);
      clusterEnd = item.end;
    } else {
      if (item.start < clusterEnd) {
        currentCluster.push(item);
        if (item.end > clusterEnd) clusterEnd = item.end;
      } else {
        clusters.push(currentCluster);
        currentCluster = [item];
        clusterEnd = item.end;
      }
    }
  });
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  const results = [];
  clusters.forEach(cluster => {
    const columns = [];
    cluster.forEach(item => {
      let placed = false;
      for (let i = 0; i < columns.length; i++) {
        if (columns[i] <= item.start) {
          item.colIndex = i;
          columns[i] = item.end;
          placed = true;
          break;
        }
      }
      if (!placed) {
        item.colIndex = columns.length;
        columns.push(item.end);
      }
    });

    const totalCols = Math.max(1, columns.length);
    cluster.forEach(item => {
      item.totalCols = totalCols;
      results.push(item);
    });
  });

  return results;
}

// LIGNES D'HEURES DE 00:00 À 23:00 (NUIT ATTÉNUÉE 00h-07h, JOUR & SOIRÉE CLAIRE 07h-23h)
function renderHourLines() {
  let html = '';
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const top = (h - START_HOUR) * HOUR_HEIGHT;
    const label = `${String(h).padStart(2, '0')}:00`;
    const isNight = (h < 7);
    html += `
      <div class="hour-row ${isNight ? 'is-night' : ''}" style="top: ${top}px;">
        <span class="hour-label">${label}</span>
        <div class="hour-line"></div>
      </div>
    `;
  }
  return html;
}

function renderNowLineHtml() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = START_HOUR * 60;
  const endMinutes = (END_HOUR + 1) * 60;

  if (currentMinutes < startMinutes || currentMinutes > endMinutes) return '';

  const top = ((currentMinutes - startMinutes) / 60) * HOUR_HEIGHT;
  const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return `
    <div class="now-timeline-marker" style="top: ${top}px;">
      <span class="now-badge">${timeLabel}</span>
    </div>
  `;
}

function renderEmptyDayGuidanceHtml() {
  return '';
}

function renderTimedBlocks(tasks, dateStr) {
  const layoutItems = computeOverlapLayout(tasks);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return layoutItems.map(({ task, start, duration, colIndex, totalCols }) => {
    const isEvent = task.type === 'event';
    const isSelected = selectedTaskIds.has(task.id);
    const isLiveNow = (dateStr === TODAY_STR && currentMinutes >= start && currentMinutes < (start + duration));
    const startMinutes = START_HOUR * 60;
    let top = ((start - startMinutes) / 60) * HOUR_HEIGHT;
    top = Math.max(0, top);

    const height = Math.max(34, (duration / 60) * HOUR_HEIGHT);

    const endTotal = start + duration;
    const endH = String(Math.floor(endTotal / 60)).padStart(2, '0');
    const endM = String(endTotal % 60).padStart(2, '0');
    const timeRangeStr = `${task.time} – ${endH}:${endM}`;

    const rolloverClass = task.isRollover ? 'rollover' : '';
    const rolloverPrefix = task.isRollover ? '⟳ ' : '';
    const eventClass = isEvent ? 'is-event' : '';
    const selectedClass = isSelected ? 'is-selected' : '';
    const liveClass = isLiveNow ? 'is-live-now' : '';

    // Gestion propre des colonnes de chevauchement
    let positionStyle = `top: ${top}px; height: ${height}px;`;
    if (totalCols > 1) {
      positionStyle += ` left: calc(52px + (100% - 60px) * ${colIndex} / ${totalCols}); width: calc((100% - 60px) / ${totalCols} - 4px);`;
    }

    const childSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const doneSubCount = childSubtasks.filter(s => s.completed).length;
    const progressPillHtml = childSubtasks.length > 0 
      ? `<span class="event-progress-pill" onclick="event.stopPropagation(); openSubtasksModal('${task.id}')" title="Subtasks (${doneSubCount}/${childSubtasks.length})">${doneSubCount}/${childSubtasks.length}</span>` 
      : '';

    let subtasksHtml = '';
    const hasSubtasksRendered = childSubtasks.length > 0 && height >= 50;
    if (hasSubtasksRendered) {
      let maxFit = 1;
      if (height >= 95) {
        maxFit = 3; // Capped at 3 maximum for clean, uncluttered cards
      } else if (height >= 70) {
        maxFit = 2;
      } else {
        maxFit = 1;
      }
      const visibleSubtasks = childSubtasks.slice(0, maxFit);

      subtasksHtml = `
        <div class="block-subtasks-container">
          ${visibleSubtasks.map(sub => `
            <div class="block-subtask-row ${sub.completed ? 'completed' : ''}" 
                 onclick="event.stopPropagation(); toggleSubtaskCompletion('${task.id}', '${sub.id}')"
                 title="${sub.completed ? 'Mark incomplete' : 'Mark completed'}">
              <span class="subtask-cat-indicator cat-${sub.context || task.context || 'work'}"></span>
              <div class="subtask-mini-checkbox ${sub.completed ? 'checked' : ''}">
                ${sub.completed ? '✓' : ''}
              </div>
              <span class="subtask-row-title">${renderTitleWithTagsHtml(sub.title)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    return `
      <div class="schedule-block-item cat-${task.context || 'work'} ${rolloverClass} ${eventClass} ${selectedClass} ${liveClass}" 
           id="block_${task.id}"
           data-task-id="${task.id}"
           data-date="${dateStr}"
           style="${positionStyle}"
           onpointerdown="handleBlockPointerDown(event, '${task.id}', '${dateStr}')"
           ondblclick="event.stopPropagation(); openEditModal('${task.id}')"
           onclick="event.stopPropagation()"
           title="${isEvent ? '📅 Event: ' : '📋 Task: '}${task.title} (${timeRangeStr})">
        <div class="schedule-block-top">
          <div class="block-time-badge" title="${timeRangeStr}">
            <span class="badge-start">${task.time}</span>
            <span class="badge-end">${endH}:${endM}</span>
          </div>
          ${isEvent ? `
            <span class="event-icon" title="Event (non-checkable)">📅</span>
          ` : `
            <div class="checkbox" onclick="event.stopPropagation(); toggleTaskCompletion('${task.id}')" title="Toggle completion">
              ${task.completed ? '✓' : ''}
            </div>
          `}
          <span class="schedule-block-title">${rolloverPrefix}${renderTitleWithTagsHtml(task.title)}</span>
          ${progressPillHtml}
          ${isLiveNow ? '<span class="live-pulse-badge">● LIVE</span>' : ''}
          <button type="button" class="btn-task-menu" onclick="event.stopPropagation(); openTaskPopover(event, '${task.id}')" title="Options">⋮</button>
        </div>
        ${subtasksHtml}
        
        <div class="resize-handle" 
             onmousedown="startResize(event, '${task.id}')"
             ontouchstart="startResize(event, '${task.id}')"
             onclick="event.stopPropagation()"
             title="Drag to resize duration"></div>
      </div>
    `;
  }).join('');
}

function handleTaskRowClick(e, id) {
  e.stopPropagation();
  if (e.metaKey || e.ctrlKey || e.shiftKey) {
    toggleTaskSelection(id);
    return;
  }
  if (selectedTaskIds.has(id)) {
    clearSelection();
  } else {
    selectTaskExclusively(id);
  }
}

function renderUnscheduledList(tasks) {
  if (tasks.length === 0) {
    return '';
  }

  return tasks.map(task => {
    const isEvent = task.type === 'event';
    const rolloverClass = task.isRollover ? 'rollover' : '';
    const rolloverPrefix = task.isRollover ? '⟳ ' : '';
    const eventClass = isEvent ? 'is-event' : '';
    const isSelected = selectedTaskIds.has(task.id);
    const childSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const doneSubCount = childSubtasks.filter(s => s.completed).length;
    const progressPillHtml = childSubtasks.length > 0 
      ? `<span class="event-progress-pill" onclick="event.stopPropagation(); openSubtasksModal('${task.id}')" title="Subtasks (${doneSubCount}/${childSubtasks.length})">${doneSubCount}/${childSubtasks.length}</span>` 
      : '';

    return `
      <li class="task-item cat-${task.context || 'work'} ${rolloverClass} ${eventClass} ${isSelected ? 'is-selected' : ''}"
          draggable="true"
          ondragstart="handleDragStart(event, '${task.id}')"
          ondragend="handleDragEnd(event)">
        <div class="task-row-main" onclick="handleTaskRowClick(event, '${task.id}')" ondblclick="openEditModal('${task.id}')">
          ${isEvent ? `
            <span class="event-icon" title="Event (non-checkable)">📅</span>
          ` : `
            <div class="checkbox" onclick="event.stopPropagation(); toggleTaskCompletion('${task.id}')" title="Toggle completion">
              ${task.completed ? '✓' : ''}
            </div>
          `}
          <span class="task-text">
            ${rolloverPrefix}${renderTitleWithTagsHtml(task.title)}
          </span>
          ${progressPillHtml}
          <button type="button" class="btn-task-menu" onclick="event.stopPropagation(); openTaskPopover(event, '${task.id}')" title="Options">⋮</button>
        </div>
      </li>
    `;
  }).join('');
}

// SMART SCROLL (1H30 AVANT LE 1ER EVENT OU HEURE ACTUELLE)
function applyDynamicScroll(onlyIfUnscrolled = false) {
  const visibleDates = calculateVisibleDates();
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  visibleDates.forEach(dateObj => {
    const dateStr = getLocalDateString(dateObj);
    const scrollContainer = document.getElementById(`scheduleScroll_${dateStr}`);
    if (!scrollContainer) return;

    // Ne pas écraser la position si l'utilisateur a déjà fait défiler cette colonne
    if (onlyIfUnscrolled && scrollContainer.scrollTop > 10) return;

    const isToday = (dateStr === TODAY_STR);
    const dayTasks = window.SpanPlanState.tasks.filter(t => t.date === dateStr && !!t.time);

    let targetMinutes = 9 * 60; // 09:00 par défaut

    if (isToday) {
      targetMinutes = Math.max(0, currentMinutes - 45);
    } else if (dayTasks.length > 0) {
      let earliestMinutes = 24 * 60;
      dayTasks.forEach(t => {
        const parts = t.time.split(':');
        const m = parseInt(parts[0], 10) * 60 + (parseInt(parts[1], 10) || 0);
        if (m < earliestMinutes) earliestMinutes = m;
      });
      targetMinutes = Math.max(0, earliestMinutes - 90);
    } else {
      targetMinutes = 8.5 * 60; // 08:30 par défaut sans tâches
    }

    const scrollPx = Math.max(0, (targetMinutes / 60) * HOUR_HEIGHT);
    scrollContainer.scrollTop = scrollPx;
  });
}

// REDIMENSIONNEMENT INTERACTIF
let resizingTaskId = null;
let resizeStartY = 0;
let resizeStartHeight = 0;

function startResize(e, taskId) {
  e.preventDefault();
  e.stopPropagation();
  resizingTaskId = taskId;
  
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  resizeStartY = clientY;
  
  const blockEl = document.getElementById(`block_${taskId}`);
  if (blockEl) {
    resizeStartHeight = blockEl.offsetHeight;
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
  const newHeight = Math.max(28, resizeStartHeight + deltaY);

  const blockEl = document.getElementById(`block_${resizingTaskId}`);
  if (blockEl) {
    blockEl.style.height = `${newHeight}px`;
  }
}

function handleResizeEnd() {
  if (!resizingTaskId) return;

  const blockEl = document.getElementById(`block_${resizingTaskId}`);
  if (blockEl) {
    blockEl.classList.remove('is-resizing');
    const finalHeight = blockEl.offsetHeight;
    
    let minutes = Math.round((finalHeight / HOUR_HEIGHT) * 60);
    minutes = Math.max(15, Math.round(minutes / 15) * 15);

    const task = window.SpanPlanState.tasks.find(t => t.id === resizingTaskId);
    if (task) {
      task.duration = minutes;
      savePlanState();
    }
  }

  resizingTaskId = null;
  window.removeEventListener('mousemove', handleResizeMove);
  window.removeEventListener('mouseup', handleResizeEnd);
  window.removeEventListener('touchmove', handleResizeMove);
  window.removeEventListener('touchend', handleResizeEnd);
}

// MULTI-SÉLECTION & DÉPLACEMENT DE GROUPE (SYSTÈME EXACT DU PORTFOLIO)
let selectedTaskIds = new Set();
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
        countSpan.textContent = `${selectedTaskIds.size} selected`;
      }
    } else {
      bar.classList.remove('show');
    }
  }
}

// POINTER DOWN SUR UN BLOC (CLIC OU DÉPLACEMENT SIMPLE/GROUPE)
function handleBlockPointerDown(e, taskId, dateStr) {
  if (e.target.closest('.btn-task-menu') || e.target.closest('.checkbox') || e.target.closest('.resize-handle') || e.target.closest('.event-progress-pill')) {
    return;
  }
  if (e.button !== 0) return;

  e.stopPropagation();

  const isModifier = (e.metaKey || e.ctrlKey || e.shiftKey);

  if (isModifier) {
    e.preventDefault();
    toggleTaskSelection(taskId);
    return;
  }

  // Empêcher la sélection de texte intempestive du navigateur
  if (e.pointerType === 'mouse') {
    e.preventDefault();
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

  const anchorEl = document.getElementById(`block_${taskId}`);
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
    const el = document.getElementById(`block_${id}`);
    if (task && el) {
      const parts = (task.time || '00:00').split(':');
      const startM = parseInt(parts[0], 10) * 60 + (parseInt(parts[1], 10) || 0);
      const currentTop = parseFloat(el.style.top) || el.offsetTop;
      dragInitialTops.set(id, {
        task,
        el,
        initialTop: currentTop,
        initialStartMinutes: startM,
        duration: task.duration || 45,
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

    // Détection de la colonne ou du dock sous le curseur
    const targetDock = document.elementFromPoint(e.clientX, e.clientY)?.closest('.day-dock');
    const targetCol = document.elementFromPoint(e.clientX, e.clientY)?.closest('.day-column');

    document.querySelectorAll('.day-dock.dock-drop-hover').forEach(d => {
      if (d !== targetDock) d.classList.remove('dock-drop-hover');
    });

    if (targetDock) {
      targetDock.classList.add('dock-drop-hover');
      document.querySelectorAll('[id^="pointerDragGhost_"]').forEach(g => g.remove());
      return;
    }

    if (targetCol) {
      const targetCanvas = targetCol.querySelector('.schedule-grid-canvas');
      if (targetCanvas) {
        const cRect = targetCanvas.getBoundingClientRect();
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
          const height = Math.max(34, (info.duration / 60) * HOUR_HEIGHT);

          const startH = String(Math.floor(itemStartM / 60)).padStart(2, '0');
          const startM = String(itemStartM % 60).padStart(2, '0');
          const endH = String(Math.floor(itemEndM / 60)).padStart(2, '0');
          const endM = String(itemEndM % 60).padStart(2, '0');

          const ghostId = `pointerDragGhost_${info.task.id}`;
          let ghost = document.getElementById(ghostId);
          if (!ghost) {
            ghost = document.createElement('div');
            ghost.id = ghostId;
            targetCanvas.appendChild(ghost);
          } else if (ghost.parentElement !== targetCanvas) {
            ghost.remove();
            targetCanvas.appendChild(ghost);
          }
          ghost.className = `drag-preview-slot cat-${info.task.context || 'work'}`;
          ghost.style.top = `${snappedTop}px`;
          ghost.style.height = `${height}px`;
          ghost.style.left = '52px';
          ghost.style.right = '8px';
          const isEvent = (info.task.type === 'event');
          ghost.innerHTML = `
            <div class="ghost-time-label">${isEvent ? '📅 ' : '⏱ '}${startH}:${startM} – ${endH}:${endM} (${info.duration}m)</div>
            <div class="ghost-title-label">${info.task.title}</div>
          `;
        });
      }
    } else {
      document.querySelectorAll('[id^="pointerDragGhost_"]').forEach(g => g.remove());
    }
  }
}

function handleBlockPointerUp(e) {
  window.removeEventListener('pointermove', handleBlockPointerMove);
  window.removeEventListener('pointerup', handleBlockPointerUp);
  window.removeEventListener('pointercancel', handleBlockPointerUp);

  document.body.classList.remove('is-card-dragging');
  const avatar = document.getElementById('activeFloatingDragAvatar');
  if (avatar) avatar.remove();

  document.querySelectorAll('[id^="pointerDragGhost_"]').forEach(g => g.remove());
  document.querySelectorAll('.day-dock.dock-drop-hover').forEach(d => d.classList.remove('dock-drop-hover'));

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

  if (wasDragging) {
    const targetDock = document.elementFromPoint(e.clientX, e.clientY)?.closest('.day-dock');
    const targetCol = document.elementFromPoint(e.clientX, e.clientY)?.closest('.day-column');
    const anchorInfo = dragInitialTops.get(anchorId);
    const anchorDate = anchorInfo?.date;

    if (targetDock) {
      const targetDate = targetDock.dataset.date || anchorDate;
      let movedCount = 0;
      dragInitialTops.forEach(info => {
        info.task.date = targetDate;
        info.task.time = '';
        info.task.isRollover = false;
        movedCount++;
      });
      dragInitialTops.clear();
      savePlanState();
      if (typeof showToast === 'function') {
        showToast(`${movedCount} item${movedCount > 1 ? 's' : ''} moved to To-do dock`, 'success');
      }
      return;
    }

    if (targetCol) {
      const targetCanvas = targetCol.querySelector('.schedule-grid-canvas');
      if (targetCanvas) {
        const cRect = targetCanvas.getBoundingClientRect();
        const relY = Math.max(0, (e.clientY - dragGrabOffsetY) - cRect.top);
        let targetStartM = Math.round((relY / HOUR_HEIGHT) * 60);
        targetStartM = Math.round(targetStartM / 15) * 15;
        targetStartM = Math.max(0, Math.min(23 * 60 + 45, targetStartM));

        const anchorStartM = anchorInfo ? anchorInfo.initialStartMinutes : 0;
        const diffM = targetStartM - anchorStartM;
        const targetDateStr = targetCol.dataset.date;

        let movedCount = 0;
        dragInitialTops.forEach(info => {
          const itemStartM = Math.max(0, Math.min(23 * 60 + 45, info.initialStartMinutes + diffM));
          const startH = String(Math.floor(itemStartM / 60)).padStart(2, '0');
          const startM = String(itemStartM % 60).padStart(2, '0');
          info.task.time = `${startH}:${startM}`;
          info.task.date = targetDateStr || info.task.date;
          info.task.isRollover = false;
          movedCount++;
        });

        dragInitialTops.clear();
        savePlanState();

        if (typeof showToast === 'function') {
          const dateObj = new Date(targetDateStr + 'T00:00:00');
          const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          showToast(`${movedCount} item${movedCount > 1 ? 's' : ''} moved to ${dateLabel} (${targetStartM ? `${String(Math.floor(targetStartM / 60)).padStart(2, '0')}:${String(targetStartM % 60).padStart(2, '0')}` : ''})`, 'success');
        }
        return;
      }
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

  // Si clic simple sans glissement -> Création par manipulation directe
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

    openCreateModalWithDefaults(dateStr, clickedTime);
  }
}

// DRAG & DROP HTML5 POUR LE DOCK / BACKLOG
let draggedTaskId = null;

function handleDragStart(e, id) {
  draggedTaskId = id;
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  }
  const blockEl = document.getElementById(`block_${id}`);
  if (blockEl) blockEl.classList.add('dragging');
}

function handleDragEnd(e) {
  if (draggedTaskId) {
    const blockEl = document.getElementById(`block_${draggedTaskId}`);
    if (blockEl) blockEl.classList.remove('dragging');
  }
  const ghost = document.getElementById('canvasDragGhost');
  if (ghost) ghost.remove();
  document.querySelectorAll('.schedule-grid-canvas.drag-over').forEach(c => c.classList.remove('drag-over'));
  document.querySelectorAll('.day-dock.drag-over').forEach(d => d.classList.remove('drag-over'));
  draggedTaskId = null;
}

window.addEventListener('dragend', handleDragEnd);

function allowCanvasDrop(e) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const canvas = e.currentTarget;
  canvas.classList.add('drag-over');

  if (!draggedTaskId) return;
  const task = window.SpanPlanState.tasks.find(t => t.id === draggedTaskId);
  const duration = task ? (task.duration || 45) : 45;
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

function handleCanvasDrop(e, targetDate) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const ghost = document.getElementById('canvasDragGhost');
  if (ghost) ghost.remove();

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
    task.time = newTime;
    task.isRollover = false;
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

  if (!draggedTaskId) return;

  const task = window.SpanPlanState.tasks.find(t => t.id === draggedTaskId);
  if (task) {
    task.date = targetDate;
    task.time = '';
    task.isRollover = false;
    savePlanState();
    if (typeof showToast === 'function') {
      const typeLabel = task.type === 'event' ? 'Event moved' : 'Task moved';
      showToast(`${typeLabel} to day's to-do dock (${targetDate})`, 'info');
    }
  }
  draggedTaskId = null;
}

function handleDropToBacklog(e) {
  e.preventDefault();
  const ghost = document.getElementById('canvasDragGhost');
  if (ghost) ghost.remove();

  if (!draggedTaskId) return;

  const task = window.SpanPlanState.tasks.find(t => t.id === draggedTaskId);
  if (task) {
    task.date = null;
    task.time = '';
    task.isRollover = false;
    savePlanState();
    if (typeof showToast === 'function') {
      showToast(`Déplacé dans le Backlog`, 'info');
    }
  }
  draggedTaskId = null;
}

// POPOVER
function openTaskPopover(e, id) {
  popoverTargetTaskId = id;
  const menu = document.getElementById('taskPopoverMenu');
  if (!menu) return;

  const btnRect = e.currentTarget.getBoundingClientRect();
  menu.style.display = 'flex';
  
  const top = btnRect.bottom + 4;
  const left = Math.min(window.innerWidth - 180, btnRect.left - 130);
  menu.style.top = `${top}px`;
  menu.style.left = `${Math.max(10, left)}px`;
}

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

document.addEventListener('click', (e) => {
  if (!e.target.closest('#taskPopoverMenu') && !e.target.closest('.btn-task-menu')) {
    closeTaskPopover();
  }
});

function popoverAction(action) {
  const id = popoverTargetTaskId;
  closeTaskPopover();
  if (!id) return;

  if (action === 'edit') {
    openEditModal(id);
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

// BACKLOG DRAWER
function renderBacklogDrawer() {
  const list = document.getElementById('backlogTaskList');
  if (!list) return;

  const backlogTasks = window.SpanPlanState.tasks.filter(t => {
    const isUnscheduled = !t.date;
    const contextMatch = (currentContextFilter === 'all' || t.context === currentContextFilter);
    const tagMatch = !currentTagFilter || (t.title && t.title.toLowerCase().includes(`#${currentTagFilter.toLowerCase()}`));
    return isUnscheduled && contextMatch && tagMatch;
  });

  list.innerHTML = '';

  if (backlogTasks.length === 0) {
    list.innerHTML = `<li style="font-size: 12px; color: var(--text-muted); padding: 14px 4px; text-align: center;">No unscheduled tasks</li>`;
    return;
  }

  backlogTasks.forEach(task => {
    const isEvent = task.type === 'event';
    const isSelected = selectedTaskIds.has(task.id);
    const completedClass = task.completed ? 'completed' : '';
    const childSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const doneSubCount = childSubtasks.filter(s => s.completed).length;
    const progressPillHtml = childSubtasks.length > 0 
      ? `<span class="event-progress-pill" onclick="event.stopPropagation(); openSubtasksModal('${task.id}')" title="Subtasks (${doneSubCount}/${childSubtasks.length})">${doneSubCount}/${childSubtasks.length}</span>` 
      : '';

    const li = document.createElement('li');
    li.className = `task-item cat-${task.context || 'work'} ${isEvent ? 'is-event' : ''} ${completedClass} ${isSelected ? 'is-selected' : ''}`;
    li.draggable = true;
    li.ondragstart = (e) => handleDragStart(e, task.id);
    li.ondragend = (e) => handleDragEnd(e);

    li.innerHTML = `
      <div class="task-row-main" onclick="handleTaskRowClick(event, '${task.id}')" ondblclick="openEditModal('${task.id}')">
        ${isEvent ? `
          <span class="event-icon" title="Event (non-checkable)">📅</span>
        ` : `
          <div class="checkbox" onclick="event.stopPropagation(); toggleTaskCompletion('${task.id}')" title="Toggle completion">
            ${task.completed ? '✓' : ''}
          </div>
        `}
        <span class="task-text ${completedClass}">${renderTitleWithTagsHtml(task.title)}</span>
        ${progressPillHtml}
        <button type="button" class="btn-backlog-today" onclick="event.stopPropagation(); scheduleTaskDirectly('${task.id}', '${TODAY_STR}')" title="Schedule for Today">+ Today</button>
        <button type="button" class="btn-task-menu" onclick="event.stopPropagation(); openTaskPopover(event, '${task.id}')" title="Options">⋮</button>
      </div>
    `;
    list.appendChild(li);
  });
}

function updateCounters() {
  const laterCount = window.SpanPlanState.tasks.filter(t => !t.date).length;
  ['globalLaterCount', 'drawerLaterCount', 'mobileLaterCount', 'mobileBacklogCount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = laterCount;
  });
}

function updateRangeLabel(visibleDates) {
  const label = document.getElementById('currentRangeLabel');
  if (!label || visibleDates.length === 0) return;

  const first = visibleDates[0];
  const last = visibleDates[visibleDates.length - 1];

  const firstStr = first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const lastStr = last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  let text = (visibleDates.length === 1) 
    ? `${first.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}`
    : `${firstStr} – ${lastStr}`;

  if (currentTagFilter) {
    text += ` • #${currentTagFilter} (✕)`;
  }
  label.textContent = text;
  label.onclick = currentTagFilter ? () => filterByTag(currentTagFilter) : null;
  label.style.cursor = currentTagFilter ? 'pointer' : 'default';
}

function toggleTaskCompletion(id) {
  const task = window.SpanPlanState.tasks.find(t => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  syncPlanTaskUpdateToFocus(task.focusId || task.id, task.completed, task.title);
  savePlanState();
}

function getDismissedTaskIds() {
  try {
    const list = JSON.parse(localStorage.getItem('span_plan_dismissed_focus_ids')) || [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function addDismissedTaskIds(newIds) {
  if (!Array.isArray(newIds) || newIds.length === 0) return;
  try {
    const current = getDismissedTaskIds();
    const set = new Set(current);
    newIds.forEach(id => { if (id) set.add(id); });
    localStorage.setItem('span_plan_dismissed_focus_ids', JSON.stringify(Array.from(set)));
  } catch (e) {}
}

function deleteTasks(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const idSet = new Set(ids);
  
  // 1. Extraire toutes les clés et identifiants des tâches à supprimer
  const keysToDismiss = [];
  (window.SpanPlanState.tasks || []).forEach(t => {
    if (idSet.has(t.id)) {
      if (t.id) keysToDismiss.push(t.id);
      if (t.focusId) keysToDismiss.push(t.focusId);
      if (t.title) keysToDismiss.push('title:' + t.title.trim().toLowerCase());
    }
  });
  ids.forEach(id => {
    if (!keysToDismiss.includes(id)) keysToDismiss.push(id);
  });

  addDismissedTaskIds(keysToDismiss);

  // 2. Supprimer de l'état local Plan
  window.SpanPlanState.tasks = (window.SpanPlanState.tasks || []).filter(t => !idSet.has(t.id));

  // 3. Purger immédiatement du cache local Focus (span_tasks)
  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks'));
    if (Array.isArray(focusTasks)) {
      const dismissed = getDismissedTaskIds();
      const updatedFocus = focusTasks.filter(ft => {
        if (!ft) return false;
        if (idSet.has(ft.id) || dismissed.includes(ft.id)) return false;
        if (ft.title && dismissed.includes('title:' + ft.title.trim().toLowerCase())) return false;
        if (ft.parentEventId && (idSet.has(ft.parentEventId) || dismissed.includes(ft.parentEventId))) return false;
        return true;
      });
      localStorage.setItem('span_tasks', JSON.stringify(updatedFocus));
    }
  } catch (e) {}

  savePlanState();
}

function deleteTask(id) {
  deleteTasks([id]);
}

function moveToBacklog(id) {
  const task = window.SpanPlanState.tasks.find(t => t.id === id);
  if (!task) return;
  task.date = null;
  task.time = '';
  task.isRollover = false;
  savePlanState();
}

function scheduleTaskDirectly(id, targetDate) {
  const task = window.SpanPlanState.tasks.find(t => t.id === id);
  if (!task) return;
  task.date = targetDate;
  savePlanState();
}

function pushToSpanFocus(id) {
  const task = window.SpanPlanState.tasks.find(t => t.id === id);
  if (!task) return;

  let focusTasks = JSON.parse(localStorage.getItem('span_tasks')) || [];
  focusTasks.unshift({
    id: 't_' + Date.now(),
    title: task.title,
    category: task.context ? (task.context.charAt(0).toUpperCase() + task.context.slice(1)) : 'Work',
    completed: false,
    isFavorite: true
  });
  localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
  if (typeof showToast === 'function') {
    showToast(`"${task.title}" prioritized to Span Focus ⭐`, 'success');
  } else {
    alert(`"${task.title}" queued into Span Focus with priority ⭐!`);
  }
}

// GESTION DU CLIC SUR LA GRILLE (CRÉATION DIRECTE PAR MANIPULATION DIRECTE)
function handleCanvasClick(e, dateStr) {
  // Ignorer si le clic touche un bloc de tâche, le redimensionnement ou la ligne now
  if (e.target.closest('.schedule-block-item') || e.target.closest('.resize-handle') || e.target.closest('.now-timeline-marker')) {
    return;
  }
  const canvas = e.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const offsetY = e.clientY - rect.top;

  const hoursFraction = offsetY / HOUR_HEIGHT;
  let totalMinutes = Math.round((START_HOUR * 60) + (hoursFraction * 60));
  // Snap à 15 minutes
  totalMinutes = Math.round(totalMinutes / 15) * 15;
  totalMinutes = Math.max(0, Math.min(23 * 60 + 45, totalMinutes));

  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const m = String(totalMinutes % 60).padStart(2, '0');
  const clickedTime = `${h}:${m}`;

  openCreateModalWithDefaults(dateStr, clickedTime);
}

// AJOUT RAPIDE INLINE DIRECTEMENT DANS LE DOCK DU JOUR
function submitDockInlineAdd(e, dateStr) {
  const input = e.target;
  let rawText = input ? input.value.trim() : '';
  if (!rawText) return;

  let extractedContext = currentContextFilter === 'all' ? 'work' : normalizePlanContext(currentContextFilter);
  if (/#(work|code|boulot)\b/i.test(rawText)) extractedContext = 'work';
  else if (/#(life|perso|home)\b/i.test(rawText)) extractedContext = 'life';
  else if (/#(fun|sport)\b/i.test(rawText)) extractedContext = 'fun';

  const newTask = {
    id: 'p_' + Date.now(),
    title: rawText,
    date: dateStr,
    time: '',
    duration: 30,
    context: extractedContext,
    completed: false,
    isRollover: false
  };

  window.SpanPlanState.tasks.unshift(newTask);
  if (input) input.value = '';
  savePlanState();
  if (typeof showToast === 'function') {
    showToast(`Ajouté à faire : "${newTask.title}"`, 'success');
  }
}

// AJOUT RAPIDE INTELLIGENT (NLP NATUREL)
function submitQuickAdd() {
  const input = document.getElementById('quickTaskInput');
  const targetSelect = document.getElementById('quickTargetDate');
  const contextSelect = document.getElementById('quickContextSelect');
  const typeSelect = document.getElementById('quickTypeSelect');

  let rawText = input ? input.value.trim() : '';
  if (!rawText) return;

  let targetDate = TODAY_STR;
  if (targetSelect && targetSelect.value === 'tomorrow') targetDate = TOMORROW_STR;
  else if (targetSelect && targetSelect.value === 'later') targetDate = null;

  let extractedType = typeSelect ? typeSelect.value : 'task';

  // Reconnaissance naturelle de "demain" / "tomorrow" ou "later" / "plus tard"
  if (/\b(demain|tomorrow)\b/i.test(rawText)) {
    targetDate = TOMORROW_STR;
    rawText = rawText.replace(/\b(demain|tomorrow)\b/gi, '').trim();
  } else if (/\b(later|backlog|plus tard)\b/i.test(rawText)) {
    targetDate = null;
    rawText = rawText.replace(/\b(later|backlog|plus tard)\b/gi, '').trim();
  }

  // Détection du type d'élément (Événement vs Tâche) par mots-clés ou tags
  if (/#(event|rdv|meeting|call)\b/i.test(rawText) || /\b(meeting|rdv|call|zoom|rendez-vous|d[iî]ner|d[eé]jeuner)\b/i.test(rawText)) {
    extractedType = 'event';
    rawText = rawText.replace(/#(event|rdv|meeting|call)\b/gi, '').trim();
  } else if (/#(task|todo)\b/i.test(rawText)) {
    extractedType = 'task';
    rawText = rawText.replace(/#(task|todo)\b/gi, '').trim();
  }

  // Détection du contexte (#work, #life, #fun)
  let extractedContext = contextSelect ? normalizePlanContext(contextSelect.value) : 'work';
  if (/#(work|code|study|boulot|travail)\b/i.test(rawText)) {
    extractedContext = 'work';
  } else if (/#(life|perso|home|maison)\b/i.test(rawText)) {
    extractedContext = 'life';
  } else if (/#(fun|sport|sant[eé]|loisir)\b/i.test(rawText)) {
    extractedContext = 'fun';
  }

  // Détection de la durée (ex: 30m, 45m, 1h, 1h30, 2h)
  let extractedDuration = 45;
  const durMatch = rawText.match(/\b(\d+)\s*(m|min|h|hour|heure)(?:(\d+))?\b/i);
  if (durMatch) {
    const val = parseInt(durMatch[1], 10);
    const unit = durMatch[2].toLowerCase();
    const extraMin = durMatch[3] ? parseInt(durMatch[3], 10) : 0;
    if (unit.startsWith('h')) {
      extractedDuration = val * 60 + extraMin;
    } else {
      extractedDuration = val;
    }
    rawText = rawText.replace(durMatch[0], '').trim();
  }

  // Détection de l'heure (14:30, 14h30, 14h, 2pm, 9am)
  let extractedTime = '';
  const timeRegex = /\b([0-1]?[0-9]|2[0-3])(?::([0-5][0-9])|h([0-5][0-9])?)\b|\b([1-9]|1[0-2])(?::([0-5][0-9]))?\s*(am|pm)\b/i;
  const match = rawText.match(timeRegex);
  if (match) {
    const rawMatch = match[0];
    if (match[6]) { // Format 12h AM/PM
      let h = parseInt(match[4], 10);
      const m = match[5] || '00';
      const meridiem = match[6].toLowerCase();
      if (meridiem === 'pm' && h < 12) h += 12;
      if (meridiem === 'am' && h === 12) h = 0;
      extractedTime = `${String(h).padStart(2, '0')}:${m}`;
    } else { // Format 24h
      const h = String(parseInt(match[1], 10)).padStart(2, '0');
      const m = String(match[2] || match[3] || '00').padStart(2, '0');
      extractedTime = `${h}:${m}`;
    }
    rawText = rawText.replace(rawMatch, '').trim();
  }

  rawText = rawText.replace(/\s+/g, ' ').trim();
  if (!rawText) rawText = extractedType === 'event' ? 'Untitled Event' : 'Untitled Task';

  const newTask = {
    id: 'p_' + Date.now(),
    title: rawText,
    type: extractedType,
    date: targetDate,
    time: extractedTime,
    duration: extractedDuration,
    context: extractedContext,
    completed: false,
    isRollover: false
  };

  window.SpanPlanState.tasks.unshift(newTask);
  if (input) input.value = '';
  savePlanState();

  if (typeof showToast === 'function') {
    const timeLabel = extractedTime ? ` (${extractedTime})` : '';
    const typeLabel = extractedType === 'event' ? 'Event added' : 'Task added';
    showToast(`${typeLabel}: "${newTask.title}"${timeLabel}`, 'success');
  }
}

function addBacklogTask() {
  const input = document.getElementById('backlogQuickInput');
  const text = input ? input.value.trim() : '';
  if (!text) return;

  const newTask = {
    id: 'p_' + Date.now(),
    title: text,
    type: 'task',
    date: null,
    time: '',
    duration: 45,
    context: currentContextFilter === 'all' ? 'work' : normalizePlanContext(currentContextFilter),
    completed: false,
    isRollover: false
  };

  window.SpanPlanState.tasks.unshift(newTask);
  if (input) input.value = '';
  savePlanState();
  if (typeof showToast === 'function') {
    showToast(`Added to Backlog: "${newTask.title}"`, 'info');
  }
}

// ==============================================================
// MODALE INTERACTIVE D'APERÇU DES SOUS-TÂCHES
// ==============================================================
let currentSubtasksParentId = null;

function openSubtasksModal(taskId) {
  const task = window.SpanPlanState.tasks.find(t => t.id === taskId);
  if (!task) return;

  currentSubtasksParentId = taskId;
  const overlay = document.getElementById('subtasksModalOverlay');
  const typeBadge = document.getElementById('subtasksTypeBadge');
  const titleText = document.getElementById('subtasksTitleText');

  if (typeBadge) typeBadge.textContent = task.type === 'event' ? 'Event' : 'Task';
  if (titleText) titleText.textContent = task.title;

  renderSubtasksModalList();
  if (overlay) overlay.style.display = 'flex';
}

function closeSubtasksModal() {
  const overlay = document.getElementById('subtasksModalOverlay');
  if (overlay) overlay.style.display = 'none';
  currentSubtasksParentId = null;
}

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

  if (textEl) textEl.textContent = `${completedCount} of ${totalCount} completed`;
  if (pctEl) pctEl.textContent = `${pct}%`;
  if (fillEl) fillEl.style.width = `${pct}%`;

  if (subtasks.length === 0) {
    listEl.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 18px 0;">No subtasks yet</div>`;
    return;
  }

  listEl.innerHTML = subtasks.map(sub => `
    <div class="subtask-interactive-row ${sub.completed ? 'completed' : ''}" data-subtask-id="${sub.id}">
      <button type="button" 
              class="subtask-cat-btn cat-${sub.context || parent.context || 'work'}" 
              onclick="event.stopPropagation(); cycleSubtaskContext('${sub.id}')" 
              title="Category: ${sub.context || parent.context || 'work'} (click to change)">
      </button>
      <div class="subtask-checkbox ${sub.completed ? 'checked' : ''}" 
           onclick="event.stopPropagation(); handleSubtaskModalToggle('${sub.id}')"
           title="Toggle completed">
        ${sub.completed ? '✓' : ''}
      </div>
      <input type="text" 
             class="subtask-title-input ${sub.completed ? 'completed' : ''}" 
             value="${escapeHtml(sub.title)}" 
             placeholder="Subtask name..."
             onclick="event.stopPropagation()"
             onchange="updateSubtaskTitle('${sub.id}', this.value)"
             onkeydown="if(event.key==='Enter') { this.blur(); }">
      <button type="button" 
              class="subtask-delete-btn" 
              onclick="event.stopPropagation(); deleteSubtask('${sub.id}')" 
              title="Delete subtask">✕</button>
    </div>
  `).join('');
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

function deleteSubtask(subtaskId) {
  if (!currentSubtasksParentId) return;
  const parent = window.SpanPlanState.tasks.find(t => t.id === currentSubtasksParentId);
  if (!parent || !Array.isArray(parent.subtasks)) return;

  parent.subtasks = parent.subtasks.filter(s => String(s.id) !== String(subtaskId));
  savePlanState();
  syncSubtasksToFocus(parent);
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

    (parent.subtasks || []).forEach(st => {
      focusTasks.push({
        id: st.id,
        title: st.title,
        completed: !!st.completed,
        category: st.context || parent.context || 'work',
        parentEventId: parentId
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

  if (!Array.isArray(parent.subtasks)) parent.subtasks = [];
  const newSub = {
    id: 'sub_' + Date.now(),
    title: title,
    completed: false,
    context: parent.context || 'work'
  };
  parent.subtasks.push(newSub);
  input.value = '';
  savePlanState();
  syncSubtasksToFocus(parent);
  renderSubtasksModalList();
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

function openCreateModalWithDefaults(dateStr = TODAY_STR, timeStr = '') {
  editingTaskId = null;
  editingContext = currentContextFilter === 'all' ? 'work' : normalizePlanContext(currentContextFilter);

  selectModalType('task');

  const titleEl = document.getElementById('editTaskTitle');
  if (titleEl) titleEl.value = '';
  const dateEl = document.getElementById('editTaskDate');
  if (dateEl) dateEl.value = dateStr || TODAY_STR;
  const timeEl = document.getElementById('editTaskTime');
  if (timeEl) timeEl.value = timeStr || '';
  const durEl = document.getElementById('editTaskDuration');
  if (durEl) durEl.value = 45;

  const headerSpan = document.getElementById('modalHeaderTitle') || document.querySelector('#editModalOverlay .modal-header span');
  if (headerSpan) headerSpan.textContent = timeStr ? `New Event (${timeStr})` : 'New Task';

  const deleteBtn = document.getElementById('btnModalDeleteTask');
  if (deleteBtn) deleteBtn.style.display = 'none';

  document.querySelectorAll('#modalContextPills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.context === editingContext);
  });

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
  const dateEl = document.getElementById('editTaskDate');
  if (dateEl) dateEl.value = task.date || '';
  const timeEl = document.getElementById('editTaskTime');
  if (timeEl) timeEl.value = task.time || '';
  const durEl = document.getElementById('editTaskDuration');
  if (durEl) durEl.value = task.duration || 45;

  const deleteBtn = document.getElementById('btnModalDeleteTask');
  if (deleteBtn) deleteBtn.style.display = 'inline-block';

  document.querySelectorAll('#modalContextPills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.context === editingContext);
  });

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

  const dateVal = document.getElementById('editTaskDate').value || null;
  const timeVal = document.getElementById('editTaskTime').value || '';
  const durEl = document.getElementById('editTaskDuration');
  const durationVal = durEl ? (parseInt(durEl.value, 10) || 45) : 45;

  if (editingTaskId) {
    const task = window.SpanPlanState.tasks.find(t => t.id === editingTaskId);
    if (task) {
      task.title = title;
      task.type = editingItemType;
      task.date = dateVal;
      task.time = timeVal;
      task.duration = durationVal;
      task.context = editingContext;
    }
    if (typeof showToast === 'function') {
      const label = editingItemType === 'event' ? 'Event updated' : 'Task updated';
      showToast(label, 'info');
    }
  } else {
    const newTask = {
      id: 'p_' + Date.now(),
      title: title,
      type: editingItemType,
      date: dateVal,
      time: timeVal,
      duration: durationVal,
      context: editingContext,
      completed: false,
      isRollover: false
    };
    window.SpanPlanState.tasks.unshift(newTask);
    if (typeof showToast === 'function') {
      const timeTxt = timeVal ? ` at ${timeVal}` : '';
      const label = editingItemType === 'event' ? 'Event created' : 'Task created';
      showToast(`${label}: "${newTask.title}"${timeTxt}`, 'success');
    }
  }

  closeEditModal();
  savePlanState();
}

// NAVIGATION
function navigateTimeline(direction) {
  const step = isMobileScreen() ? 1 : visibleDaysCount;
  currentTimelineOffset += (direction * step);
  renderPlanGrid(true);
  if (typeof renderDateStrip === 'function') renderDateStrip();
  applyDynamicScroll();
}

function jumpToToday() {
  currentTimelineOffset = 0;
  if (isMobileScreen()) {
    setMobileDayView('agenda');
  }
  renderPlanGrid(true);
  if (typeof renderDateStrip === 'function') renderDateStrip();
  applyDynamicScroll();
}

function setVisibleDays(num) {
  num = Math.max(3, parseInt(num, 10) || 3);
  visibleDaysCount = num;
  localStorage.setItem('span_plan_visible_days', num);
  document.querySelectorAll('#daysSelectorGroup .pill-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.days, 10) === num);
  });
  renderPlanGrid(true);
  applyDynamicScroll();
}

function setContextFilter(ctx) {
  currentContextFilter = ctx;
  document.querySelectorAll('.context-menu-item, #contextSwitch .context-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.context === ctx);
  });
  
  const labelEl = document.getElementById('activeContextText');
  const indEl = document.getElementById('activeContextIndicator');
  const triggerBtn = document.getElementById('contextFilterTrigger');
  
  if (labelEl) labelEl.textContent = ctx === 'all' ? 'All' : (ctx.charAt(0).toUpperCase() + ctx.slice(1));
  if (indEl) {
    indEl.className = `context-indicator dot-${ctx}`;
  }
  if (triggerBtn) {
    triggerBtn.setAttribute('data-active-context', ctx);
  }
  
  closeContextDropdown();
  renderPlanGrid(true);
  renderBacklogDrawer();
}

function toggleContextDropdown(e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const wrap = document.getElementById('contextDropdownWrap');
  if (wrap) wrap.classList.toggle('open');
}

function closeContextDropdown() {
  const wrap = document.getElementById('contextDropdownWrap');
  if (wrap) wrap.classList.remove('open');
}

// Close context dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('#contextDropdownWrap')) {
    closeContextDropdown();
  }
});

function toggleBacklogDrawer() {
  if (isMobileScreen()) {
    if (currentMobileDayView === 'backlog') {
      setMobileDayView('agenda');
    } else {
      setMobileDayView('backlog');
    }
    return;
  }
  const drawer = document.getElementById('backlogDrawer');
  const toggleBtn = document.getElementById('btnToggleDrawer');
  if (drawer) {
    const isOpening = !drawer.classList.contains('open');
    drawer.classList.toggle('open');
    if (toggleBtn) {
      toggleBtn.classList.toggle('active', drawer.classList.contains('open') || isDrawerPinned);
    }
    if (isOpening) {
      syncFocusTasksToPlanBacklog(true);
      renderBacklogDrawer();
      updateCounters();
    }
  }
}

function togglePinDrawer() {
  isDrawerPinned = !isDrawerPinned;
  localStorage.setItem('span_plan_drawer_pinned', isDrawerPinned);
  applyPinState();
}

function applyPinState() {
  const drawer = document.getElementById('backlogDrawer');
  const btn = document.getElementById('btnPinDrawer');
  const toggleBtn = document.getElementById('btnToggleDrawer');
  if (drawer) {
    drawer.classList.toggle('pinned', isDrawerPinned);
    if (isDrawerPinned && !isMobileScreen()) {
      drawer.classList.add('open');
    }
  }
  if (btn) {
    btn.style.background = isDrawerPinned ? 'rgba(255, 255, 255, 0.15)' : '';
    btn.style.borderColor = isDrawerPinned ? 'var(--streak)' : 'var(--card-border)';
  }
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', isDrawerPinned || (drawer && drawer.classList.contains('open')));
  }
}

// ==============================================================
// EXPÉRIENCE MOBILE-FIRST (IPHONE 13 MINI & SMARTPHONES)
// ==============================================================
let currentMobileDayView = 'agenda'; // 'agenda' | 'todo' | 'backlog'

function setMobileDayView(mode) {
  currentMobileDayView = mode;
  const shell = document.getElementById('appShell');
  if (shell) {
    shell.classList.toggle('mobile-mode-agenda', mode === 'agenda');
    shell.classList.toggle('mobile-mode-todo', mode === 'todo');
    shell.classList.toggle('mobile-mode-backlog', mode === 'backlog');
  }

  const btnA = document.getElementById('segBtnAgenda');
  const btnT = document.getElementById('segBtnTodo');
  if (btnA) btnA.classList.toggle('active', mode === 'agenda');
  if (btnT) btnT.classList.toggle('active', mode === 'todo');

  const navBtnToday = document.getElementById('mobileNavToday');
  const navBtnBacklog = document.getElementById('mobileNavBacklog');
  if (navBtnToday) navBtnToday.classList.toggle('active', (mode === 'agenda' || mode === 'todo') && currentTimelineOffset === 0);
  if (navBtnBacklog) navBtnBacklog.classList.toggle('active', mode === 'backlog');

  if (mode === 'backlog') {
    syncFocusTasksToPlanBacklog(true);
    renderBacklogDrawer();
    updateCounters();
  }
}

function renderDateStrip() {
  const strip = document.getElementById('mobileDateStrip');
  if (!strip) return;

  const centerOffset = currentTimelineOffset;
  let html = '';

  for (let i = -3; i <= 3; i++) {
    const offset = centerOffset + i;
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const dateStr = getLocalDateString(d);
    const isToday = (dateStr === TODAY_STR);
    const isSelected = (offset === currentTimelineOffset);

    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const dayNum = d.getDate();

    const dayTasks = (window.SpanPlanState && window.SpanPlanState.tasks) 
      ? window.SpanPlanState.tasks.filter(t => t.date === dateStr) 
      : [];
    const hasTasks = dayTasks.length > 0;

    html += `
      <button type="button" 
              class="date-strip-item ${isToday ? 'is-today' : ''} ${isSelected ? 'active' : ''}" 
              onclick="selectDateFromStrip(${offset})"
              title="${dateStr}">
        <span class="strip-day-name">${dayName}</span>
        <span class="strip-day-num">${dayNum}</span>
        ${hasTasks ? '<span class="strip-task-dot"></span>' : ''}
      </button>
    `;
  }

  strip.innerHTML = html;

  // Mise à jour du compteur To-do dans le switch segmenté
  const visibleDates = calculateVisibleDates();
  if (visibleDates.length > 0) {
    const currentDateStr = getLocalDateString(visibleDates[0]);
    const unscheduledCount = (window.SpanPlanState && window.SpanPlanState.tasks)
      ? window.SpanPlanState.tasks.filter(t => t.date === currentDateStr && !t.time).length
      : 0;
    const todoCountEl = document.getElementById('mobileTodoCount');
    if (todoCountEl) todoCountEl.textContent = unscheduledCount;
  }

  // Mise à jour de l'état actif dans la barre inférieure
  const navBtnToday = document.getElementById('mobileNavToday');
  if (navBtnToday) {
    navBtnToday.classList.toggle('active', currentTimelineOffset === 0);
  }
}

function selectDateFromStrip(targetOffset) {
  currentTimelineOffset = targetOffset;
  if (currentMobileDayView === 'backlog') {
    setMobileDayView('agenda');
  }
  renderPlanGrid(true);
  renderDateStrip();
  applyDynamicScroll();
}

// SWIPE TACTILE FLUIDE ENTRE LES JOURS SUR MOBILE
let touchStartX = 0;
let touchStartY = 0;

window.addEventListener('touchstart', (e) => {
  if (window.innerWidth > 768) return;
  if (e.target.closest('#backlogDrawer') || e.target.closest('.modal-card')) return;
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

window.addEventListener('touchend', (e) => {
  if (window.innerWidth > 768) return;
  if (!touchStartX) return;
  const touch = e.changedTouches[0];
  const diffX = touch.clientX - touchStartX;
  const diffY = touch.clientY - touchStartY;

  // Seuil horizontal de 50px
  if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.4) {
    if (diffX < 0) {
      navigateTimeline(1);
    } else {
      navigateTimeline(-1);
    }
  }
  touchStartX = 0;
  touchStartY = 0;
}, { passive: true });

let lastIsMobile = isMobileScreen();
window.addEventListener('resize', () => {
  const nowMobile = isMobileScreen();
  if (nowMobile !== lastIsMobile) {
    lastIsMobile = nowMobile;
    renderPlanGrid(true);
    renderDateStrip();
  }
});

// INITIALISATION AU DÉMARRAGE
window.addEventListener('DOMContentLoaded', () => {
  autoRecoverTodayTasks();
  executeAutoRollover();
  setVisibleDays(visibleDaysCount);
  setMobileDayView('agenda');
  applyPinState();
  renderBacklogDrawer();
  updateCounters();
  renderDateStrip();

  setTimeout(applyDynamicScroll, 120);

  setInterval(() => {
    if (currentTimelineOffset === 0) {
      renderPlanGrid();
    }
  }, 60000);
});

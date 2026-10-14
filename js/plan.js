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

const START_HOUR = 7;
const END_HOUR = 22;
const HOUR_HEIGHT = 54;

function normalizePlanContext(cat) {
  if (!cat) return 'work';
  const c = String(cat).toLowerCase();
  if (c === 'work' || c === 'code' || c === 'study' || c === 'write') return 'work';
  if (c === 'home' || c === 'admin' || c === 'personal') return 'home';
  if (c === 'fun' || c === 'health' || c === 'self') return 'fun';
  return 'work';
}

function renderTitleWithTagsHtml(titleStr) {
  if (!titleStr) return 'Untitled';
  return titleStr.replace(/#([\w\-]+)/g, (match, tag) => {
    return `<span class="task-inline-tag" onclick="event.stopPropagation(); filterByTag('${tag}')">#${tag}</span>`;
  });
}

// Données initiales par défaut
const defaultInitialTasks = [
  {
    id: 'p_sample_today_1',
    title: 'Team standup meeting #work',
    date: TODAY_STR,
    time: '09:30',
    duration: 60,
    context: 'work',
    completed: false,
    isRollover: false
  },
  {
    id: 'p_sample_today_2',
    title: 'Grocery shopping #home',
    date: TODAY_STR,
    time: '',
    duration: 30,
    context: 'home',
    completed: false,
    isRollover: false
  },
  {
    id: 'p_sample_tomorrow_1',
    title: 'Review quarterly report',
    date: TOMORROW_STR,
    time: '',
    duration: 45,
    context: 'work',
    completed: false,
    isRollover: false
  }
];

let rawTasks = [];
try {
  rawTasks = JSON.parse(localStorage.getItem('span_plan_tasks'));
} catch (e) {
  rawTasks = null;
}

if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
  window.SpanPlanState.tasks = defaultInitialTasks;
} else {
  window.SpanPlanState.tasks = rawTasks.map(t => ({
    id: t.id || ('p_' + Math.random().toString(36).substr(2, 9)),
    title: t.title || 'Untitled',
    date: t.date || null,
    time: t.time || '',
    duration: typeof t.duration === 'number' ? t.duration : 45,
    context: normalizePlanContext(t.context || t.category),
    completed: !!t.completed,
    isRollover: !!t.isRollover
  }));
}

let visibleDaysCount = parseInt(localStorage.getItem('span_plan_visible_days')) || 3;
let currentTimelineOffset = 0;
let currentContextFilter = 'all';
let currentTagFilter = null;
let isDrawerPinned = localStorage.getItem('span_plan_drawer_pinned') === 'true';

let editingTaskId = null;
let editingContext = 'work';
let popoverTargetTaskId = null;

// Filtre tags
function filterByTag(tag) {
  currentTagFilter = (currentTagFilter === tag) ? null : tag;
  renderPlanGrid();
  renderBacklogDrawer();
}

// Auto-rollover des tâches passées incomplètes vers Today (dans le dock)
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

function calculateVisibleDates() {
  const dates = [];
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + currentTimelineOffset);

  for (let i = 0; i < visibleDaysCount; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    dates.push(d);
  }
  return dates;
}

// RENDU PRINCIPAL
function renderPlanGrid() {
  const grid = document.getElementById('plannerGrid');
  if (!grid) return;

  const visibleDates = calculateVisibleDates();
  grid.classList.toggle('view-single', visibleDates.length === 1);
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
        <div class="day-title-wrap">
          <span class="day-name">${isToday ? 'Today' : dayName}</span>
          <span class="day-date">${dayNum}</span>
        </div>
        <span class="day-meta-est">${dayTasks.length} items</span>
      </div>

      <!-- CANEVAS HORAIRE VERTICAL (UPPER AREA) -->
      <div class="day-schedule-scroll" id="scheduleScroll_${dateStr}">
        <div class="schedule-grid-canvas" 
             data-date="${dateStr}"
             ondragover="allowCanvasDrop(event)" 
             ondragleave="removeCanvasDropHighlight(event)"
             ondrop="handleCanvasDrop(event, '${dateStr}')">
          ${renderHourLines()}
          ${isToday ? renderNowLineHtml() : ''}
          ${renderTimedBlocks(timedTasks, dateStr)}
        </div>
      </div>

      <!-- DOCK DU BAS POUR TÂCHES NON PLANIFIÉES DU JOUR -->
      <div class="day-dock" 
           data-date="${dateStr}"
           ondragover="allowDockDrop(event)" 
           ondragleave="removeDockDropHighlight(event)"
           ondrop="handleDropToDock(event, '${dateStr}')">
        <div class="dock-header">
          <span class="dock-title">📋 To-do</span>
          <span class="dock-count-pill">${unscheduledTasks.length}</span>
        </div>
        <ul class="dock-task-list">
          ${renderUnscheduledList(unscheduledTasks)}
        </ul>
      </div>
    `;

    grid.appendChild(col);
  });

  updateRangeLabel(visibleDates);
}

function renderHourLines() {
  let html = '';
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const top = (h - START_HOUR) * HOUR_HEIGHT;
    const label = `${String(h).padStart(2, '0')}:00`;
    html += `
      <div class="hour-row" style="top: ${top}px;">
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
  const endMinutes = END_HOUR * 60;

  if (currentMinutes < startMinutes || currentMinutes > endMinutes) return '';

  const top = ((currentMinutes - startMinutes) / 60) * HOUR_HEIGHT;
  const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return `
    <div class="now-timeline-marker" style="top: ${top}px;">
      <span class="now-badge">${timeLabel}</span>
    </div>
  `;
}

// RENDU BLOCS HORAIRES AVEC POIGNÉE DE REDIMENSIONNEMENT
function renderTimedBlocks(tasks, dateStr) {
  return tasks.map(task => {
    const parts = task.time.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) || 0;
    const totalMinutes = h * 60 + m;
    const startMinutes = START_HOUR * 60;

    let top = ((totalMinutes - startMinutes) / 60) * HOUR_HEIGHT;
    top = Math.max(0, top);

    const durationMin = task.duration || 45;
    const height = Math.max(34, (durationMin / 60) * HOUR_HEIGHT);

    // Calcul de l'heure de fin
    const endTotal = totalMinutes + durationMin;
    const endH = String(Math.floor(endTotal / 60)).padStart(2, '0');
    const endM = String(endTotal % 60).padStart(2, '0');
    const timeRangeStr = `${task.time} - ${endH}:${endM}`;

    const rolloverClass = task.isRollover ? 'rollover' : '';
    const rolloverPrefix = task.isRollover ? '⟳ ' : '';

    return `
      <div class="schedule-block-item cat-${task.context || 'work'} ${rolloverClass}" 
           id="block_${task.id}"
           style="top: ${top}px; height: ${height}px;"
           draggable="true" 
           ondragstart="handleDragStart(event, '${task.id}')"
           onclick="openEditModal('${task.id}')">
        <div class="schedule-block-top">
          <div class="checkbox" onclick="event.stopPropagation(); toggleTaskCompletion('${task.id}')">
            ${task.completed ? '✓' : ''}
          </div>
          <span class="schedule-block-title">${rolloverPrefix}${renderTitleWithTagsHtml(task.title)}</span>
          <span class="schedule-block-time">${task.time}</span>
          <button type="button" class="btn-task-menu" onclick="event.stopPropagation(); openTaskPopover(event, '${task.id}')">⋮</button>
        </div>
        ${height >= 48 ? `<div class="schedule-block-sub">${timeRangeStr} •${durationMin}m</div>` : ''}
        
        <!-- POIGNÉE DE REDIMENSIONNEMENT -->
        <div class="resize-handle" 
             onmousedown="startResize(event, '${task.id}')"
             ontouchstart="startResize(event, '${task.id}')"
             onclick="event.stopPropagation()"></div>
      </div>
    `;
  }).join('');
}

// TÂCHES DU DOCK (EN BAS DE CHAQUE JOUR)
function renderUnscheduledList(tasks) {
  if (tasks.length === 0) {
    return `<li style="font-size: 11px; color: rgba(255,255,255,0.2); padding: 8px 4px; text-align: center;">No unscheduled tasks</li>`;
  }

  return tasks.map(task => {
    const rolloverClass = task.isRollover ? 'rollover' : '';
    const rolloverPrefix = task.isRollover ? '⟳ ' : '';

    return `
      <li class="task-item cat-${task.context || 'work'} ${rolloverClass}"
          draggable="true"
          ondragstart="handleDragStart(event, '${task.id}')">
        <div class="task-row-main">
          <div class="checkbox" onclick="event.stopPropagation(); toggleTaskCompletion('${task.id}')">
            ${task.completed ? '✓' : ''}
          </div>
          <span class="task-text" onclick="openEditModal('${task.id}')">
            ${rolloverPrefix}${renderTitleWithTagsHtml(task.title)}
          </span>
          <button type="button" class="btn-task-menu" onclick="event.stopPropagation(); openTaskPopover(event, '${task.id}')">⋮</button>
        </div>
      </li>
    `;
  }).join('');
}

// ==============================================================
// REDIMENSIONNEMENT INTERACTIF (RESIZE)
// ==============================================================
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
    
    // Calcul de la nouvelle durée arrondie au quart d'heure (15 min)
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

// ==============================================================
// GLISSER-DÉPOSER (DRAG & DROP SUR HORAIRES ET DOCKS)
// ==============================================================
let draggedTaskId = null;

function handleDragStart(e, id) {
  draggedTaskId = id;
  e.dataTransfer.setData('text/plain', id);
  const blockEl = document.getElementById(`block_${id}`);
  if (blockEl) blockEl.classList.add('dragging');
}

function allowCanvasDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function removeCanvasDropHighlight(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleCanvasDrop(e, targetDate) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!draggedTaskId) return;

  const canvas = e.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const offsetY = e.clientY - rect.top;

  // Calcul de l'heure arrondie au quart d'heure
  const hoursFraction = offsetY / HOUR_HEIGHT;
  let totalMinutes = Math.round((START_HOUR * 60) + (hoursFraction * 60));
  totalMinutes = Math.round(totalMinutes / 15) * 15;
  totalMinutes = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, totalMinutes));

  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const m = String(totalMinutes % 60).padStart(2, '0');
  const newTime = `${h}:${m}`;

  const task = window.SpanPlanState.tasks.find(t => t.id === draggedTaskId);
  if (task) {
    task.date = targetDate;
    task.time = newTime;
    task.isRollover = false;
    savePlanState();
  }
  draggedTaskId = null;
}

function allowDockDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function removeDockDropHighlight(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleDropToDock(e, targetDate) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!draggedTaskId) return;

  const task = window.SpanPlanState.tasks.find(t => t.id === draggedTaskId);
  if (task) {
    task.date = targetDate;
    task.time = ''; // Enlevée de l'agenda horaire et placée dans le dock
    task.isRollover = false;
    savePlanState();
  }
  draggedTaskId = null;
}

function handleDropToBacklog(e) {
  e.preventDefault();
  if (!draggedTaskId) return;

  const task = window.SpanPlanState.tasks.find(t => t.id === draggedTaskId);
  if (task) {
    task.date = null;
    task.time = '';
    task.isRollover = false;
    savePlanState();
  }
  draggedTaskId = null;
}

// POPOVER ACTIONS (⋮)
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

  if (action === 'focus') pushToSpanFocus(id);
  else if (action === 'backlog') moveToBacklog(id);
  else if (action === 'delete') deleteTask(id);
}

// TIROIR BACKLOG (LATER)
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
    const li = document.createElement('li');
    li.className = `task-item cat-${task.context || 'work'}`;
    li.draggable = true;
    li.ondragstart = (e) => handleDragStart(e, task.id);

    li.innerHTML = `
      <div class="task-row-main">
        <span class="task-text" onclick="openEditModal('${task.id}')">${renderTitleWithTagsHtml(task.title)}</span>
        <button class="btn-task-action" onclick="scheduleTaskDirectly('${task.id}', '${TODAY_STR}')" title="Schedule Today">☀️</button>
        <button class="btn-task-action" onclick="deleteTask('${task.id}')" title="Delete">✕</button>
      </div>
    `;
    list.appendChild(li);
  });
}

function updateCounters() {
  const laterCount = window.SpanPlanState.tasks.filter(t => !t.date).length;
  ['globalLaterCount', 'drawerLaterCount', 'mobileLaterCount'].forEach(id => {
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
  savePlanState();
}

function deleteTask(id) {
  window.SpanPlanState.tasks = window.SpanPlanState.tasks.filter(t => t.id !== id);
  savePlanState();
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
  alert(`"${task.title}" queued into Span Focus with priority ⭐!`);
}

// AJOUT RAPIDE
function submitQuickAdd() {
  const input = document.getElementById('quickTaskInput');
  const targetSelect = document.getElementById('quickTargetDate');
  const contextSelect = document.getElementById('quickContextSelect');

  let rawText = input ? input.value.trim() : '';
  if (!rawText) return;

  let targetDate = TODAY_STR;
  if (targetSelect && targetSelect.value === 'tomorrow') targetDate = TOMORROW_STR;
  else if (targetSelect && targetSelect.value === 'later') targetDate = null;

  let extractedTime = '';
  const timeRegex = /\b([0-1]?[0-9]|2[0-3]):([0-5][0-9])\b/;
  const match = rawText.match(timeRegex);
  if (match) {
    extractedTime = match[0];
    rawText = rawText.replace(match[0], '').trim();
  }

  const newTask = {
    id: 'p_' + Date.now(),
    title: rawText,
    date: targetDate,
    time: extractedTime,
    duration: 45,
    context: contextSelect ? contextSelect.value : 'work',
    completed: false,
    isRollover: false
  };

  window.SpanPlanState.tasks.unshift(newTask);
  if (input) input.value = '';
  savePlanState();
}

function addBacklogTask() {
  const input = document.getElementById('backlogQuickInput');
  const text = input ? input.value.trim() : '';
  if (!text) return;

  const newTask = {
    id: 'p_' + Date.now(),
    title: text,
    date: null,
    time: '',
    duration: 45,
    context: currentContextFilter === 'all' ? 'work' : currentContextFilter,
    completed: false,
    isRollover: false
  };

  window.SpanPlanState.tasks.unshift(newTask);
  if (input) input.value = '';
  savePlanState();
}

// ÉDITION
function openEditModal(id) {
  const task = window.SpanPlanState.tasks.find(t => t.id === id);
  if (!task) return;

  editingTaskId = id;
  editingContext = task.context || 'work';

  document.getElementById('editTaskTitle').value = task.title;
  document.getElementById('editTaskDate').value = task.date || '';
  document.getElementById('editTaskTime').value = task.time || '';

  document.querySelectorAll('#modalContextPills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.context === editingContext);
  });

  document.getElementById('editModalOverlay').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editModalOverlay').style.display = 'none';
  editingTaskId = null;
}

function selectEditContext(ctx) {
  editingContext = ctx;
  document.querySelectorAll('#modalContextPills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.context === ctx);
  });
}

function saveTaskModal() {
  const title = document.getElementById('editTaskTitle').value.trim();
  if (!title) return;

  const dateVal = document.getElementById('editTaskDate').value || null;
  const timeVal = document.getElementById('editTaskTime').value || '';

  const task = window.SpanPlanState.tasks.find(t => t.id === editingTaskId);
  if (task) {
    task.title = title;
    task.date = dateVal;
    task.time = timeVal;
    task.context = editingContext;
  }
  closeEditModal();
  savePlanState();
}

function navigateTimeline(direction) {
  currentTimelineOffset += (direction * visibleDaysCount);
  renderPlanGrid();
}

function jumpToToday() {
  currentTimelineOffset = 0;
  renderPlanGrid();
}

function setVisibleDays(num) {
  visibleDaysCount = parseInt(num);
  localStorage.setItem('span_plan_visible_days', num);
  document.querySelectorAll('#daysSelectorGroup .pill-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.days) === num);
  });
  renderPlanGrid();
}

function setContextFilter(ctx) {
  currentContextFilter = ctx;
  document.querySelectorAll('#contextSwitch .context-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.context === ctx);
  });
  renderPlanGrid();
  renderBacklogDrawer();
}

function toggleBacklogDrawer() {
  const drawer = document.getElementById('backlogDrawer');
  if (drawer) drawer.classList.toggle('open');
}

function togglePinDrawer() {
  isDrawerPinned = !isDrawerPinned;
  localStorage.setItem('span_plan_drawer_pinned', isDrawerPinned);
  applyPinState();
}

function applyPinState() {
  const drawer = document.getElementById('backlogDrawer');
  const btn = document.getElementById('btnPinDrawer');
  if (drawer && btn) {
    drawer.classList.toggle('pinned', isDrawerPinned);
    btn.style.borderColor = isDrawerPinned ? 'var(--streak)' : 'var(--card-border)';
  }
}

function scrollToNow() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = START_HOUR * 60;
  if (currentMinutes >= startMinutes && currentMinutes <= END_HOUR * 60) {
    const targetScroll = (((currentMinutes - startMinutes) / 60) * HOUR_HEIGHT) - 100;
    document.querySelectorAll('.day-schedule-scroll').forEach(el => {
      el.scrollTop = Math.max(0, targetScroll);
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  executeAutoRollover();
  setVisibleDays(visibleDaysCount);
  applyPinState();
  renderBacklogDrawer();
  updateCounters();

  setTimeout(scrollToNow, 150);

  setInterval(() => {
    if (currentTimelineOffset === 0) {
      renderPlanGrid();
    }
  }, 60000);
});

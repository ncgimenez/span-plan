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

// Données d'exemple avec la tâche d'hier (Rollover)
const defaultInitialTasks = [
  {
    id: 'p_yesterday_sample',
    title: 'Finalize quarterly review notes',
    date: YESTERDAY_STR,
    slot: 'morning',
    time: '14:30',
    context: 'work',
    estimate: 2,
    completed: false,
    isRollover: false
  },
  {
    id: 'p_sample_today_1',
    title: 'Team standup meeting',
    date: TODAY_STR,
    slot: 'morning',
    time: '09:30',
    context: 'work',
    estimate: 1,
    completed: false,
    isRollover: false
  },
  {
    id: 'p_sample_today_2',
    title: 'Grocery shopping',
    date: TODAY_STR,
    slot: 'evening',
    time: '18:30',
    context: 'home',
    estimate: 1,
    completed: false,
    isRollover: false
  },
  {
    id: 'p_sample_tomorrow_1',
    title: 'Study architecture patterns',
    date: TOMORROW_STR,
    slot: 'morning',
    time: '',
    context: 'fun',
    estimate: 2,
    completed: false,
    isRollover: false
  },
  {
    id: 'p_sample_backlog_1',
    title: 'Refactor database indexing',
    date: null,
    slot: null,
    time: '',
    context: 'work',
    estimate: 3,
    completed: false,
    isRollover: false
  }
];

window.SpanPlanState.tasks = JSON.parse(localStorage.getItem('span_plan_tasks')) || defaultInitialTasks;

let visibleDaysCount = parseInt(localStorage.getItem('span_plan_visible_days')) || 3;
let currentTimelineOffset = 0; // Mode glissant naturel toujours actif
let currentContextFilter = 'all';
let isDrawerPinned = localStorage.getItem('span_plan_drawer_pinned') === 'true';

// Variables modale & popover
let editingTaskId = null;
let editingSlot = 'morning';
let editingContext = 'work';
let editingEstimate = 1;
let popoverTargetTaskId = null;

// 1. ROLLOVER UNIVERSEL (Tâches antérieures non faites basculées à aujourd'hui)
function executeAutoRollover() {
  let hasChanges = false;
  window.SpanPlanState.tasks.forEach(task => {
    if (task.date && task.date < TODAY_STR && !task.completed) {
      task.date = TODAY_STR;
      task.slot = 'morning';
      task.isRollover = true;
      hasChanges = true;
    }
  });

  if (hasChanges) {
    savePlanState();
  }
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

// 2. RENDU EN COLONNES
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
      return dateMatch && contextMatch;
    });

    const totalEst = dayTasks.reduce((acc, t) => acc + (t.estimate || 1), 0);

    const col = document.createElement('div');
    col.className = `day-column ${isToday ? 'is-today' : ''}`;
    col.dataset.date = dateStr;

    col.innerHTML = `
      <div class="day-header">
        <div class="day-title-wrap">
          <span class="day-name">${isToday ? 'Today' : dayName}</span>
          <span class="day-date">${dayNum}</span>
        </div>
        <span class="day-meta-est">⏱ ${totalEst * 25}m</span>
      </div>
      <div class="day-body">
        ${renderDaySlot(dateStr, 'morning', '🌅 Morning', dayTasks)}
        ${renderDaySlot(dateStr, 'afternoon', '☀️ Afternoon', dayTasks)}
        ${renderDaySlot(dateStr, 'evening', '🌙 Evening', dayTasks)}
      </div>
    `;

    grid.appendChild(col);
  });

  updateRangeLabel(visibleDates);
}

function renderDaySlot(dateStr, slotName, slotLabel, dayTasks) {
  const slotTasks = dayTasks.filter(t => (t.slot === slotName || (!t.slot && slotName === 'morning')));

  slotTasks.sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return 0;
  });

  let contentHtml = slotTasks.length > 0 
    ? slotTasks.map(t => createTaskCardHtml(t)).join('')
    : `<div class="slot-empty-notice">No tasks</div>`;

  return `
    <div class="day-section">
      <span class="section-label">${slotLabel}</span>
      <div class="section-slot-dropzone" 
           data-date="${dateStr}" 
           data-slot="${slotName}"
           ondragover="allowDrop(event)" 
           ondragleave="removeDropHighlight(event)"
           ondrop="handleDropToSlot(event, '${dateStr}', '${slotName}')">
        ${contentHtml}
      </div>
    </div>
  `;
}

// 3. CARTE DE TÂCHE AVEC TITRE EN HAUT ET DÉTAILS EN RETRAIT
function createTaskCardHtml(task) {
  const isRollover = !!task.isRollover;
  const contextClass = task.context ? `cat-${task.context}` : '';
  const rolloverPrefix = isRollover ? '⟳ ' : '';

  // Construction des détails sous le titre
  const detailItems = [];
  if (task.time) {
    detailItems.push(`<span class="task-detail-item">🕒 ${task.time}</span>`);
  }
  if (task.estimate) {
    detailItems.push(`<span class="task-detail-item">⏱ ${task.estimate * 25}m</span>`);
  }

  const detailsHtml = detailItems.length > 0 
    ? `<div class="task-row-details">${detailItems.join('<span class="task-detail-bullet">•</span>')}</div>`
    : '';

  return `
    <div class="task-item ${task.completed ? 'completed' : ''} ${isRollover ? 'rollover' : ''} ${contextClass}" 
         draggable="true" 
         ondragstart="handleDragStart(event, '${task.id}')"
         id="task_${task.id}">
      <div class="task-row-main">
        <div class="checkbox" onclick="event.stopPropagation(); toggleTaskCompletion('${task.id}')">
          ${task.completed ? '✓' : ''}
        </div>
        <span class="task-text" onclick="openEditModal('${task.id}')">${rolloverPrefix}${task.title}</span>
        <button type="button" class="btn-task-menu" onclick="event.stopPropagation(); openTaskPopover(event, '${task.id}')" title="Actions">⋮</button>
      </div>
      ${detailsHtml}
    </div>
  `;
}

// 4. MENU POPOVER ACTIONS (⋮)
function openTaskPopover(e, id) {
  popoverTargetTaskId = id;
  const menu = document.getElementById('taskPopoverMenu');
  if (!menu) return;

  const btnRect = e.currentTarget.getBoundingClientRect();
  menu.style.display = 'flex';
  
  // Positionnement dynamique
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

// 5. TIROIR BACKLOG
function renderBacklogDrawer() {
  const list = document.getElementById('backlogTaskList');
  if (!list) return;

  const backlogTasks = window.SpanPlanState.tasks.filter(t => !t.date && (currentContextFilter === 'all' || t.context === currentContextFilter));
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
        <span class="task-text" onclick="openEditModal('${task.id}')">${task.title}</span>
        <button class="btn-task-action" onclick="scheduleTaskDirectly('${task.id}', '${TODAY_STR}', 'morning')" title="Schedule Today">☀️</button>
        <button class="btn-task-action" onclick="deleteTask('${task.id}')" title="Delete">✕</button>
      </div>
      <div class="task-row-details" style="padding-left: 0;">
        <span class="task-detail-item">⏱ ${task.estimate ? task.estimate * 25 : 25}m</span>
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

  label.textContent = (visibleDates.length === 1) 
    ? `${first.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}`
    : `${firstStr} – ${lastStr}`;
}

// 6. ACTIONS TÂCHES
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
  task.slot = null;
  task.isRollover = false;
  savePlanState();
}

function scheduleTaskDirectly(id, targetDate, targetSlot) {
  const task = window.SpanPlanState.tasks.find(t => t.id === id);
  if (!task) return;
  task.date = targetDate;
  task.slot = targetSlot;
  savePlanState();
}

function pushToSpanFocus(id) {
  const task = window.SpanPlanState.tasks.find(t => t.id === id);
  if (!task) return;

  let focusTasks = JSON.parse(localStorage.getItem('span_tasks')) || [];
  focusTasks.unshift({
    id: 't_' + Date.now(),
    title: task.title,
    category: task.context === 'work' ? 'Code' : 'Admin',
    estimate: task.estimate || 1,
    completed: false,
    isFavorite: true
  });
  localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
  alert(`"${task.title}" queued into Span Focus with priority ⭐!`);
}

// 7. DRAG & DROP
let draggedTaskId = null;

function handleDragStart(e, id) {
  draggedTaskId = id;
  e.dataTransfer.setData('text/plain', id);
}

function allowDrop(e) {
  e.preventDefault();
  const zone = e.currentTarget;
  if (zone.classList.contains('section-slot-dropzone')) {
    zone.classList.add('drag-over');
  }
}

function removeDropHighlight(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleDropToSlot(e, dateStr, slotName) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!draggedTaskId) return;

  const task = window.SpanPlanState.tasks.find(t => t.id === draggedTaskId);
  if (task) {
    task.date = dateStr;
    task.slot = slotName;
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
    task.slot = null;
    task.isRollover = false;
    savePlanState();
  }
  draggedTaskId = null;
}

// 8. PARSING ET AJOUT RAPIDE
function submitQuickAdd() {
  const input = document.getElementById('quickTaskInput');
  const targetSelect = document.getElementById('quickTargetDate');
  const contextSelect = document.getElementById('quickContextSelect');

  let rawText = input ? input.value.trim() : '';
  if (!rawText) return;

  let assignedSlot = 'morning';
  let targetDate = TODAY_STR;

  if (targetSelect.value === 'tomorrow') targetDate = TOMORROW_STR;
  else if (targetSelect.value === 'later') targetDate = null;

  if (rawText.includes('!m') || rawText.includes('/m') || rawText.toUpperCase().includes('AM')) {
    assignedSlot = 'morning';
    rawText = rawText.replace(/!m|\/m|\bAM\b/gi, '').trim();
  } else if (rawText.includes('!a') || rawText.includes('/a') || rawText.toUpperCase().includes('MD')) {
    assignedSlot = 'afternoon';
    rawText = rawText.replace(/!a|\/a|\bMD\b/gi, '').trim();
  } else if (rawText.includes('!e') || rawText.includes('/e') || rawText.toUpperCase().includes('PM')) {
    assignedSlot = 'evening';
    rawText = rawText.replace(/!e|\/e|\bPM\b/gi, '').trim();
  }

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
    slot: targetDate ? assignedSlot : null,
    time: extractedTime,
    context: contextSelect ? contextSelect.value : 'work',
    estimate: 1,
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
    slot: null,
    time: '',
    context: currentContextFilter === 'all' ? 'work' : currentContextFilter,
    estimate: 1,
    completed: false,
    isRollover: false
  };

  window.SpanPlanState.tasks.unshift(newTask);
  if (input) input.value = '';
  savePlanState();
}

// 9. MODALE D'ÉDITION
function openEditModal(id) {
  const task = window.SpanPlanState.tasks.find(t => t.id === id);
  if (!task) return;

  editingTaskId = id;
  editingSlot = task.slot || 'morning';
  editingContext = task.context || 'work';
  editingEstimate = task.estimate || 1;

  document.getElementById('editTaskTitle').value = task.title;
  document.getElementById('editTaskDate').value = task.date || '';
  document.getElementById('editTaskTime').value = task.time || '';
  document.getElementById('editPomodoroEstimate').textContent = editingEstimate;
  document.getElementById('editEstMinutes').textContent = editingEstimate * 25;

  document.querySelectorAll('#modalSlotPills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.slot === editingSlot);
  });

  document.querySelectorAll('#modalContextPills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.context === editingContext);
  });

  document.getElementById('editModalOverlay').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editModalOverlay').style.display = 'none';
  editingTaskId = null;
}

function selectEditSlot(slot) {
  editingSlot = slot;
  document.querySelectorAll('#modalSlotPills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.slot === slot);
  });
}

function selectEditContext(ctx) {
  editingContext = ctx;
  document.querySelectorAll('#modalContextPills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.context === ctx);
  });
}

function stepEstimate(delta) {
  editingEstimate = Math.max(1, Math.min(12, editingEstimate + delta));
  document.getElementById('editPomodoroEstimate').textContent = editingEstimate;
  document.getElementById('editEstMinutes').textContent = editingEstimate * 25;
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
    task.slot = dateVal ? editingSlot : null;
    task.context = editingContext;
    task.estimate = editingEstimate;
  }
  closeEditModal();
  savePlanState();
}

// 10. NAVIGATION
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

window.addEventListener('DOMContentLoaded', () => {
  executeAutoRollover();
  setVisibleDays(visibleDaysCount);
  applyPinState();
  renderBacklogDrawer();
  updateCounters();
});

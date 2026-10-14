window.SpanPlanState = window.SpanPlanState || {};

// Format ISO standardisé YYYY-MM-DD
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

// Données initiales incluant explicitement l'exemple de la tâche non complétée d'hier
const defaultInitialTasks = [
  {
    id: 'p_yesterday_sample',
    title: 'Finalize quarterly review notes',
    date: YESTERDAY_STR,
    slot: 'afternoon',
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

// Configuration de la vue
let visibleDaysCount = parseInt(localStorage.getItem('span_plan_visible_days')) || 3;
let weekMode = localStorage.getItem('span_plan_week_mode') || 'rolling'; // 'rolling' | 'calendar'
let currentTimelineOffset = 0; // en jours
let currentContextFilter = 'all'; // 'all' | 'work' | 'home' | 'fun'
let isDrawerPinned = localStorage.getItem('span_plan_drawer_pinned') === 'true';

// Variables d'édition modale
let editingTaskId = null;
let editingSlot = 'morning';
let editingContext = 'work';
let editingEstimate = 1;

// 1. GESTION DU ROLLOVER AUTOMATIQUE
function executeAutoRollover() {
  let hasChanges = false;
  window.SpanPlanState.tasks.forEach(task => {
    if (task.date && task.date < TODAY_STR && !task.completed) {
      task.date = TODAY_STR;
      task.slot = 'morning'; // Replacé automatiquement le matin
      task.isRollover = true;
      hasChanges = true;
    }
  });

  if (hasChanges) {
    savePlanState();
  }
}

// 2. SAUVEGARDE & PERSISTANCE
function savePlanState() {
  localStorage.setItem('span_plan_tasks', JSON.stringify(window.SpanPlanState.tasks));
  renderPlanGrid();
  renderBacklogDrawer();
  updateCounters();
  if (typeof syncPlanToCloud === 'function') syncPlanToCloud();
}

// 3. CALCUL DES DATES VISIBLES
function calculateVisibleDates() {
  const dates = [];
  const baseDate = new Date();

  if (weekMode === 'calendar') {
    // Calcul du début de la semaine (Lundi)
    const dayOfWeek = baseDate.getDay(); // 0 = Dimanche
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    baseDate.setDate(baseDate.getDate() + diffToMonday + currentTimelineOffset);
  } else {
    // Mode glissant (Rolling)
    baseDate.setDate(baseDate.getDate() + currentTimelineOffset);
  }

  for (let i = 0; i < visibleDaysCount; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    dates.push(d);
  }
  return dates;
}

// 4. RENDU DE LA GRILLE
function renderPlanGrid() {
  const grid = document.getElementById('plannerGrid');
  if (!grid) return;

  const visibleDates = calculateVisibleDates();
  grid.style.gridTemplateColumns = `repeat(${visibleDates.length}, minmax(${visibleDates.length > 3 ? '220px' : '1fr'}, 1fr))`;

  grid.innerHTML = '';

  visibleDates.forEach(dateObj => {
    const dateStr = getLocalDateString(dateObj);
    const isToday = (dateStr === TODAY_STR);

    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Filtrer les tâches de la journée selon le contexte
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

  // Tri par heure si présente
  slotTasks.sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return 0;
  });

  let taskHtml = slotTasks.map(t => createTaskCardHtml(t)).join('');

  return `
    <div class="day-section">
      <span class="section-label">${slotLabel}</span>
      <div class="section-slot-dropzone" 
           data-date="${dateStr}" 
           data-slot="${slotName}"
           ondragover="allowDrop(event)" 
           ondragleave="removeDropHighlight(event)"
           ondrop="handleDropToSlot(event, '${dateStr}', '${slotName}')">
        ${taskHtml}
      </div>
    </div>
  `;
}

function createTaskCardHtml(task) {
  const isRollover = !!task.isRollover;
  const timeHtml = task.time ? `<span class="task-time-badge">${task.time}</span>` : '';
  const rolloverHtml = isRollover ? `<span class="rollover-badge" title="Rolled over from yesterday">⟳ Rollover</span>` : '';
  const contextHtml = task.context ? `<span class="task-context-badge ${task.context}">${task.context}</span>` : '';

  return `
    <div class="task-item ${task.completed ? 'completed' : ''} ${isRollover ? 'rollover' : ''}" 
         draggable="true" 
         ondragstart="handleDragStart(event, '${task.id}')"
         id="task_${task.id}">
      <div class="task-left" onclick="openEditModal('${task.id}')">
        <div class="checkbox" onclick="event.stopPropagation(); toggleTaskCompletion('${task.id}')">
          ${task.completed ? '✓' : ''}
        </div>
        <span class="task-text">${task.title}</span>
        ${timeHtml}
        ${rolloverHtml}
        ${contextHtml}
      </div>
      <div class="task-actions">
        ${task.date === TODAY_STR ? `<button class="btn-task-action" onclick="event.stopPropagation(); pushToSpanFocus('${task.id}')" title="Send to Focus Spotlight">🎯</button>` : ''}
        <button class="btn-task-action" onclick="event.stopPropagation(); moveToBacklog('${task.id}')" title="Move to Later">📥</button>
        <button class="btn-task-action" onclick="event.stopPropagation(); deleteTask('${task.id}')" title="Delete">✕</button>
      </div>
    </div>
  `;
}

// 5. BACKLOG DRAWER
function renderBacklogDrawer() {
  const list = document.getElementById('backlogTaskList');
  if (!list) return;

  const backlogTasks = window.SpanPlanState.tasks.filter(t => !t.date && (currentContextFilter === 'all' || t.context === currentContextFilter));
  list.innerHTML = '';

  if (backlogTasks.length === 0) {
    list.innerHTML = `<li style="font-size: 12px; color: var(--text-muted); padding: 12px 4px; text-align: center;">No unscheduled tasks</li>`;
    return;
  }

  backlogTasks.forEach(task => {
    const li = document.createElement('li');
    li.className = 'task-item';
    li.draggable = true;
    li.ondragstart = (e) => handleDragStart(e, task.id);

    li.innerHTML = `
      <div class="task-left" onclick="openEditModal('${task.id}')">
        <span class="task-text">${task.title}</span>
        <span class="task-context-badge ${task.context || 'work'}">${task.context || 'work'}</span>
        <span class="day-meta-est">⏱ ${task.estimate || 1}</span>
      </div>
      <div class="task-actions">
        <button class="btn-task-action" onclick="scheduleTaskDirectly('${task.id}', '${TODAY_STR}', 'morning')" title="Schedule Today Morning">☀️</button>
        <button class="btn-task-action" onclick="deleteTask('${task.id}')" title="Delete">✕</button>
      </div>
    `;
    list.appendChild(li);
  });
}

function updateCounters() {
  const laterCount = window.SpanPlanState.tasks.filter(t => !t.date).length;
  const ids = ['globalLaterCount', 'drawerLaterCount', 'mobileLaterCount'];
  ids.forEach(id => {
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

  label.textContent = `${firstStr} – ${lastStr}`;
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

// Envoi direct dans Span Focus avec marquage Priorité ⭐
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

// 7. DRAG AND DROP
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

// 8. PARSING ET AJOUT RAPIDE (!m, !a, !e)
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

  // Détection des raccourcis de créneaux
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

  // Détection optionnelle d'une heure précise (ex: 14:30 ou 9h00)
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

// 10. CONTRÔLE TIMELINE & FILTRES
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

function setWeekMode(mode) {
  weekMode = mode;
  localStorage.setItem('span_plan_week_mode', mode);
  document.getElementById('modeRollingBtn').classList.toggle('active', mode === 'rolling');
  document.getElementById('modeCalendarBtn').classList.toggle('active', mode === 'calendar');
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

// 11. GESTION DU TIROIR LATÉRAL
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

// INITIALISATION DU MODULE PLAN
window.addEventListener('DOMContentLoaded', () => {
  executeAutoRollover();
  setVisibleDays(visibleDaysCount);
  setWeekMode(weekMode);
  applyPinState();
  renderBacklogDrawer();
  updateCounters();
});

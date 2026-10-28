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
const HOUR_HEIGHT = 64;

function normalizePlanContext(cat) {
  if (!cat) return 'work';
  const c = String(cat).toLowerCase();
  if (c === 'work' || c === 'code' || c === 'study' || c === 'write') return 'work';
  if (c === 'life' || c === 'home' || c === 'admin' || c === 'personal') return 'life';
  if (c === 'fun' || c === 'health' || c === 'self') return 'fun';
  return 'work';
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
}

function minutesToTime(totalM) {
  totalM = Math.max(0, Math.min(23 * 60 + 59, totalM));
  const h = String(Math.floor(totalM / 60)).padStart(2, '0');
  const m = String(totalM % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function getNextDateString(dateStr) {
  if (!dateStr) return TODAY_STR;
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return getLocalDateString(d);
}

function getPrevDateString(dateStr) {
  if (!dateStr) return TODAY_STR;
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return getLocalDateString(d);
}

function getEndTimeFromDuration(startTime, durationMinutes) {
  if (!startTime) return '10:00';
  const startM = timeToMinutes(startTime);
  const endTotal = startM + (durationMinutes || 45);
  const endM = endTotal % (24 * 60);
  return minutesToTime(endM);
}

function getDurationFromTimes(startTime, endTime) {
  if (!startTime || !endTime) return 45;
  const startM = timeToMinutes(startTime);
  const endM = timeToMinutes(endTime);
  if (endM < startM) {
    // Événement nocturne dépassant minuit (ex: 22:00 à 02:00 -> 4h)
    return (24 * 60 - startM) + endM;
  }
  if (endM === startM) return 24 * 60; // 24h
  return endM - startM;
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
  window.SpanPlanState.tasks = cleanTasks.map(t => {
    const isAllDay = t.allDay !== undefined ? !!t.allDay : (!t.time && !!t.date);
    const dateVal = (t.date && t.date.trim() !== '') ? t.date.slice(0, 10) : null;
    let endDateVal = (t.endDate && t.endDate.trim() !== '') ? t.endDate.slice(0, 10) : null;
    // Pour une tâche ou événement avec horaire précis sans récurrence, endDate ne doit jamais être différente de date
    if (!isAllDay && t.time && (!t.recurrence || t.recurrence === 'none')) {
      endDateVal = dateVal;
    }
    return {
      id: t.id || ('p_' + Math.random().toString(36).substr(2, 9)),
      title: t.title || 'Untitled',
      type: t.type === 'event' ? 'event' : 'task',
      allDay: isAllDay,
      date: dateVal,
      endDate: endDateVal,
      recurrence: t.recurrence || 'none',
      recurrenceExceptions: Array.isArray(t.recurrenceExceptions) ? t.recurrenceExceptions : [],
      time: t.time || '',
      endTime: t.endTime || '',
      duration: typeof t.duration === 'number' ? t.duration : 45,
      context: normalizePlanContext(t.context || t.category),
      completed: !!t.completed,
      isRollover: !!t.isRollover,
      fromFocus: !!t.fromFocus,
      focusId: t.focusId || null,
      subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
      created_at: t.created_at || new Date().toISOString(),
      updated_at: t.updated_at || new Date().toISOString()
    };
  });
}

// ==============================================================
// MOTEUR DE RÉCURRENCE D'ÉVÉNEMENTS & TÂCHES (HEBDO, JOUR, ETC.)
// ==============================================================
function isTaskOccurringOnDate(task, targetDateStr) {
  if (!task || !targetDateStr) return false;
  if (!task.date) return false; // Les tâches non planifiées du backlog ne récurrent pas

  // Vérifier les exceptions (occurrences supprimées spécifiquement)
  if (Array.isArray(task.recurrenceExceptions) && task.recurrenceExceptions.includes(targetDateStr)) {
    return false;
  }

  const rec = task.recurrence || 'none';
  if (rec === 'none') {
    // Les plages multi-jours (endDate > date) sont réservées aux événements ALL-DAY
    const isMultiDaySpan = !!(task.allDay || !task.time);
    if (isMultiDaySpan && task.endDate && task.endDate >= task.date) {
      return task.date <= targetDateStr && targetDateStr <= task.endDate;
    }
    // Événements avec heure qui dépassent minuit (overnight / glissement sur le jour suivant)
    if (!isMultiDaySpan && task.time) {
      const startM = timeToMinutes(task.time);
      const dur = task.duration || 45;
      if (startM + dur > 1440) {
        const nextDay = getNextDateString(task.date);
        if (targetDateStr === nextDay) return true;
      }
    }
    return task.date === targetDateStr;
  }

  // Ne pas afficher avant la date initiale de création de l'événement
  if (targetDateStr < task.date) return false;

  const [sy, sm, sd] = task.date.split('-').map(Number);
  const [ty, tm, td] = targetDateStr.split('-').map(Number);
  const startD = new Date(sy, sm - 1, sd, 12, 0, 0);
  const targetD = new Date(ty, tm - 1, td, 12, 0, 0);

  if (rec === 'daily') {
    return true;
  }

  if (rec === 'weekly') {
    return startD.getDay() === targetD.getDay();
  }

  if (rec === 'biweekly') {
    if (startD.getDay() !== targetD.getDay()) return false;
    const diffTime = targetD.getTime() - startD.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    return diffWeeks % 2 === 0;
  }

  if (rec === 'monthly') {
    return startD.getDate() === targetD.getDate();
  }

  return false;
}

function updateRecurrenceWeeklyLabel(dateStr) {
  const opt = document.getElementById('optRecurrenceWeekly');
  if (!opt) return;
  if (!dateStr) {
    opt.textContent = 'Every week (Chaque semaine)';
    return;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d, 12, 0, 0);
  const weekdayNamesEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekdayNamesFr = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const dayIdx = dateObj.getDay();
  opt.textContent = `Every week on ${weekdayNamesEn[dayIdx]} (Chaque ${weekdayNamesFr[dayIdx]})`;
}

window.isTaskOccurringOnDate = isTaskOccurringOnDate;
window.updateRecurrenceWeeklyLabel = updateRecurrenceWeeklyLabel;

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

  // Nettoyer les tâches racines isolées qui sont déjà devenues des sous-tâches d'un bloc parent
  const existingSubtaskTitles = new Set();
  window.SpanPlanState.tasks.forEach(pt => {
    if (Array.isArray(pt.subtasks)) {
      pt.subtasks.forEach(st => {
        if (st.title) existingSubtaskTitles.add(st.title.trim().toLowerCase());
        if (st.id) existingSubtaskTitles.add(st.id);
      });
    }
  });

  if (existingSubtaskTitles.size > 0) {
    const prevLen = window.SpanPlanState.tasks.length;
    window.SpanPlanState.tasks = window.SpanPlanState.tasks.filter(pt => {
      if (pt.type !== 'event' && (!pt.subtasks || pt.subtasks.length === 0)) {
        if (existingSubtaskTitles.has(pt.id)) return false;
        if (pt.title && existingSubtaskTitles.has(pt.title.trim().toLowerCase())) return false;
      }
      return true;
    });
    if (window.SpanPlanState.tasks.length !== prevLen) {
      hasChanges = true;
    }
  }

  rootFocusTasks.forEach(ft => {
    if (!ft || !ft.title) return;
    if (ft.id && dismissedFocusIds.includes(String(ft.id))) return;
    if (ft.focusId && dismissedFocusIds.includes(String(ft.focusId))) return;
    
    // Vérifier strictement par ID si cette tâche est déjà imbriquée comme sous-tâche d'un bloc existant
    const isAlreadySubtask = window.SpanPlanState.tasks.some(pt => 
      Array.isArray(pt.subtasks) && pt.subtasks.some(st => 
        st.id && (String(st.id) === String(ft.id) || String(st.id) === String(ft.focusId))
      )
    );
    if (isAlreadySubtask) {
      return; // Ne pas réimporter dans le dock du jour !
    }

    // Rechercher si cette tâche existe déjà dans Span Plan STRICTEMENT par ID (aucun match par titre)
    let existing = window.SpanPlanState.tasks.find(pt => 
      (ft.id && (String(pt.id) === String(ft.id) || String(pt.focusId) === String(ft.id))) ||
      (ft.planId && String(pt.id) === String(ft.planId))
    );

    // Récupérer et formater les sous-tâches associées à cette tâche/événement par ID parent
    const mySubtasks = childSubtasks.filter(st => {
      const pid = String(st.parentEventId);
      if (ft.id && pid === String(ft.id)) return true;
      if (ft.planId && pid === String(ft.planId)) return true;
      if (ft.focusId && pid === String(ft.focusId)) return true;
      if (existing) {
        if (pid === String(existing.id)) return true;
        if (existing.focusId && pid === String(existing.focusId)) return true;
      }
      return false;
    });

    const formattedSubtasks = mySubtasks.map(st => {
      let subCtx = 'work';
      if (/#(life|perso|home)\b/i.test(st.title)) subCtx = 'life';
      else if (/#(fun|sport)\b/i.test(st.title)) subCtx = 'fun';
      else if (st.context) subCtx = normalizePlanContext(st.context);
      else if (st.category) subCtx = normalizePlanContext(st.category);
      return {
        id: st.id,
        title: st.title,
        context: subCtx,
        completed: !!st.completed,
        parentEventId: ft.id,
        actionType: st.actionType || null
      };
    });

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
        actionType: ft.actionType || null,
        date: ft.scheduledDate || null,
        time: ft.scheduledTime || '',
        duration: ft.duration || (ft.estimate ? ft.estimate * 30 : 30),
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

      // Synchronisation du titre
      if (ft.title && existing.title !== ft.title) {
        existing.title = ft.title;
        hasChanges = true;
      }

      // Synchronisation du type d'action
      if (ft.actionType !== undefined && existing.actionType !== ft.actionType) {
        existing.actionType = ft.actionType;
        hasChanges = true;
      }

      // Synchronisation de la date et de l'heure
      const targetDate = ft.scheduledDate !== undefined ? (ft.scheduledDate || null) : existing.date;
      if (existing.date !== targetDate) {
        existing.date = targetDate;
        existing.endDate = targetDate;
        hasChanges = true;
      }

      const targetTime = ft.scheduledTime !== undefined ? (ft.scheduledTime || '') : existing.time;
      if (existing.time !== targetTime) {
        existing.time = targetTime;
        existing.allDay = !targetTime;
        hasChanges = true;
      }

      // Synchronisation de la durée
      const targetDuration = ft.duration || (ft.estimate ? ft.estimate * 30 : existing.duration || 30);
      if (existing.duration !== targetDuration) {
        existing.duration = targetDuration;
        if (existing.time) {
          existing.endTime = getEndTimeFromDuration(existing.time, targetDuration);
        }
        hasChanges = true;
      }

      // Type (Événement vs Tâche)
      const isEv = !!ft.isEvent || ft.type === 'event';
      if (isEv && existing.type !== 'event') {
        existing.type = 'event';
        hasChanges = true;
      } else if (!isEv && existing.type === 'event' && ft.isEvent !== undefined) {
        existing.type = 'task';
        hasChanges = true;
      }

      // Synchronisation bidirectionnelle du statut de complétion
      if (typeof ft.completed === 'boolean' && existing.completed !== ft.completed) {
        existing.completed = ft.completed;
        hasChanges = true;
      }

      // Synchronisation du contexte
      if (ft.category) {
        const normCtx = normalizePlanContext(ft.category);
        if (existing.context !== normCtx) {
          existing.context = normCtx;
          hasChanges = true;
        }
      }

      // Synchronisation des sous-tâches STRICTEMENT par ID (aucun match par titre)
      if (formattedSubtasks.length > 0) {
        const existingSubs = Array.isArray(existing.subtasks) ? existing.subtasks : [];
        const merged = formattedSubtasks.map(fs => {
          const es = existingSubs.find(e => String(e.id) === String(fs.id));
          if (es) {
            return {
              ...es,
              title: fs.title,
              actionType: fs.actionType !== undefined ? fs.actionType : es.actionType,
              completed: (typeof fs.completed === 'boolean') ? fs.completed : es.completed
            };
          }
          return fs;
        });

        existingSubs.forEach(es => {
          if (!merged.some(m => String(m.id) === String(es.id))) {
            merged.push(es);
          }
        });

        existing.subtasks = merged;
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
  const parentTask = window.SpanPlanState.tasks.find(t => String(t.id) === String(parentTaskId));
  if (!parentTask || !parentTask.subtasks) return;
  const sub = parentTask.subtasks.find(s => String(s.id) === String(subtaskId));
  if (!sub) return;
  sub.completed = !sub.completed;
  parentTask.updated_at = new Date().toISOString();

  // Sync bidirectionnelle infaillible vers Focus
  syncPlanSubtaskUpdateToFocus(subtaskId, sub.completed, sub.title);
  if (typeof syncSubtasksToFocus === 'function') {
    syncSubtasksToFocus(parentTask);
  }

  savePlanState();
}

function syncPlanSubtaskUpdateToFocus(subtaskId, isCompleted, subTitle = '') {
  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks'));
    if (!Array.isArray(focusTasks)) return;

    let modified = false;
    const normTitle = (subTitle || '').trim().toLowerCase();
    focusTasks.forEach(ft => {
      const idMatch = ft.id && (String(ft.id) === String(subtaskId));
      if (idMatch) {
        if (ft.completed !== isCompleted) {
          ft.completed = isCompleted;
          ft.updated_at = new Date().toISOString();
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

function syncPlanTaskUpdateToFocus(taskId, isCompleted) {
  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks'));
    if (!Array.isArray(focusTasks)) return;

    let modified = false;
    focusTasks.forEach(ft => {
      if (ft.id && (String(ft.id) === String(taskId) || (ft.planId && String(ft.planId) === String(taskId)))) {
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

// Synchronisation temps réel inter-onglets & inter-apps
const suiteBridge = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('span_suite_bridge') : null;
if (suiteBridge) {
  suiteBridge.onmessage = (e) => {
    if (e.data && (e.data.type === 'FOCUS_UPDATED' || e.data.type === 'FOCUS_TASKS_SAVED')) {
      const changed = syncFocusTasksToPlanBacklog(false);
      if (changed) {
        if (typeof renderPlanGrid === 'function') renderPlanGrid(true);
        if (typeof renderBacklogDrawer === 'function') renderBacklogDrawer();
        if (typeof updateCounters === 'function') updateCounters();
      }
    }
  };
}

window.addEventListener('storage', (e) => {
  if (e.key === 'span_tasks' || e.key === 'span_plan_tasks') {
    const changed = syncFocusTasksToPlanBacklog(false);
    if (changed) {
      if (typeof renderPlanGrid === 'function') renderPlanGrid(true);
      if (typeof renderBacklogDrawer === 'function') renderBacklogDrawer();
      if (typeof updateCounters === 'function') updateCounters();
    }
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
let editingPlanActionType = 'auto';
let popoverTargetTaskId = null;

function selectEditPlanAction(action) {
  editingPlanActionType = action || 'auto';
  document.querySelectorAll('#modalPlanActionPills .action-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.action === editingPlanActionType);
  });
}
window.selectEditPlanAction = selectEditPlanAction;

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
  const currentToday = getLocalDateString();
  let hasChanges = false;
  const allTasks = window.SpanPlanState.tasks || [];
  const extractedSubtasks = [];

  allTasks.forEach(task => {
    if (!task || !task.date) return;
    if (task.recurrence && task.recurrence !== 'none') return;

    // 1. Tâches seules du passé non réalisées -> Déplacées directement dans le Backlog (Inbox sans date)
    if (task.type !== 'event' && task.date < currentToday && !task.completed) {
      task.date = null;
      task.time = '';
      task.endDate = null;
      task.isRollover = false;
      task.updated_at = new Date().toISOString();
      hasChanges = true;
    }

    // 2. Sous-tâches non faites restées dans des blocs/événements passés -> Extraites vers le Backlog
    if (task.date < currentToday && Array.isArray(task.subtasks) && task.subtasks.length > 0) {
      const unfinished = task.subtasks.filter(s => !s.completed);
      if (unfinished.length > 0) {
        // Le bloc passé conserve uniquement ses sous-tâches terminées (pour l'historique de l'agenda)
        task.subtasks = task.subtasks.filter(s => !!s.completed);
        task.updated_at = new Date().toISOString();
        hasChanges = true;

        unfinished.forEach(sub => {
          extractedSubtasks.push({
            id: String(sub.id || ('sub_' + Math.random().toString(36).substr(2, 9))),
            title: (sub.title || 'Untitled task').trim(),
            context: sub.context || task.context || 'work',
            completed: false
          });
        });
      }
    }
  });

  // Insérer ou mettre à jour les sous-tâches extraites comme tâches racines du Backlog
  if (extractedSubtasks.length > 0) {
    extractedSubtasks.forEach(sub => {
      let existingRoot = allTasks.find(t => String(t.id) === sub.id || (t.focusId && String(t.focusId) === sub.id));
      if (existingRoot) {
        existingRoot.date = null;
        existingRoot.endDate = null;
        existingRoot.time = '';
        existingRoot.allDay = false;
        existingRoot.completed = false;
        existingRoot.title = sub.title;
        existingRoot.context = sub.context;
        existingRoot.updated_at = new Date().toISOString();
      } else {
        const newBacklogTask = {
          id: sub.id,
          title: sub.title,
          date: null,
          endDate: null,
          time: '',
          allDay: false,
          type: 'task',
          context: sub.context,
          completed: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          subtasks: []
        };
        allTasks.unshift(newBacklogTask);
      }
    });
    hasChanges = true;
  }

  if (hasChanges) {
    savePlanState();
    renderPlanGrid();
    renderBacklogDrawer();
    if (typeof showToast === 'function' && extractedSubtasks.length > 0) {
      showToast(`${extractedSubtasks.length} tâche${extractedSubtasks.length > 1 ? 's' : ''} d'hier déplacée${extractedSubtasks.length > 1 ? 's' : ''} dans le Backlog`, 'info');
    }
  }
}

function syncPlanTasksToFocusStorage() {
  try {
    let focusTasks = [];
    try {
      focusTasks = JSON.parse(localStorage.getItem('span_tasks')) || [];
    } catch (e) {
      focusTasks = [];
    }
    if (!Array.isArray(focusTasks)) focusTasks = [];

    let modified = false;
    const catMap = { work: 'Work', life: 'Home', fun: 'Fun' };

    (window.SpanPlanState.tasks || []).forEach(pt => {
      if (!pt || !pt.id) return;
      const isEv = pt.type === 'event' || !!pt.isEvent;
      let existing = focusTasks.find(ft => 
        (ft && ft.id && (String(ft.id) === String(pt.id) || String(ft.id) === String(pt.focusId))) ||
        (ft && ft.planId && String(ft.planId) === String(pt.id))
      );

      const targetFocusId = existing ? existing.id : (pt.focusId || pt.id);

      if (existing) {
        if (!existing.planId) existing.planId = pt.id;
        if (pt.focusId && !existing.focusId) existing.focusId = pt.focusId;

        const targetCat = catMap[pt.context] || 'Work';
        if (existing.category !== targetCat) {
          existing.category = targetCat;
          modified = true;
        }

        const targetDate = pt.date || null;
        if (existing.scheduledDate !== targetDate) {
          existing.scheduledDate = targetDate;
          modified = true;
        }

        const targetTime = pt.time || null;
        if (existing.scheduledTime !== targetTime) {
          existing.scheduledTime = targetTime;
          modified = true;
        }

        if (pt.title && existing.title !== pt.title) {
          existing.title = pt.title;
          modified = true;
        }

        if (typeof pt.duration === 'number' && existing.duration !== pt.duration) {
          existing.duration = pt.duration;
          existing.estimate = Math.max(1, Math.round(pt.duration / 30));
          modified = true;
        }

        if (existing.isEvent !== isEv) {
          existing.isEvent = isEv;
          modified = true;
        }

        if (!existing.isEvent && typeof pt.completed === 'boolean' && existing.completed !== pt.completed) {
          existing.completed = pt.completed;
          modified = true;
        }

        if (pt.actionType !== undefined && existing.actionType !== pt.actionType) {
          existing.actionType = pt.actionType;
          modified = true;
        }
      } else {
        focusTasks.push({
          id: targetFocusId,
          planId: pt.id,
          title: pt.title || 'Untitled',
          category: catMap[pt.context] || 'Work',
          actionType: pt.actionType || null,
          estimate: Math.max(1, Math.round((pt.duration || 30) / 30)),
          duration: pt.duration || 30,
          completed: !isEv && !!pt.completed,
          isFavorite: false,
          isEvent: isEv,
          parentEventId: null,
          scheduledDate: pt.date || null,
          scheduledTime: pt.time || null
        });
        modified = true;
      }

      // Synchroniser les sous-tâches imbriquées STRICTEMENT par ID
      const validSubIds = new Set((pt.subtasks || []).map(s => String(s.id)));
      // Supprimer les sous-tâches qui n'appartiennent plus à ce bloc
      const prevSubLen = focusTasks.length;
      focusTasks = focusTasks.filter(ft => {
        if (!ft || !ft.parentEventId) return true;
        const isChildOfThis = String(ft.parentEventId) === String(targetFocusId) || String(ft.parentEventId) === String(pt.id);
        if (isChildOfThis) {
          return validSubIds.has(String(ft.id));
        }
        return true;
      });
      if (focusTasks.length !== prevSubLen) modified = true;

      if (Array.isArray(pt.subtasks) && pt.subtasks.length > 0) {
        pt.subtasks.forEach(st => {
          if (!st || !st.id) return;
          let existingSub = focusTasks.find(ft => ft && ft.id && String(ft.id) === String(st.id));
          if (existingSub) {
            if (existingSub.completed !== !!st.completed) {
              existingSub.completed = !!st.completed;
              modified = true;
            }
            if (st.title && existingSub.title !== st.title) {
              existingSub.title = st.title;
              modified = true;
            }
            if (st.actionType !== undefined && existingSub.actionType !== st.actionType) {
              existingSub.actionType = st.actionType;
              modified = true;
            }
            if (existingSub.parentEventId !== String(targetFocusId)) {
              existingSub.parentEventId = String(targetFocusId);
              modified = true;
            }
          } else {
            focusTasks.push({
              id: st.id,
              title: st.title || 'Subtask',
              category: catMap[st.context] || catMap[pt.context] || 'Work',
              actionType: st.actionType || null,
              estimate: 1,
              duration: 30,
              completed: !!st.completed,
              isFavorite: false,
              isEvent: false,
              parentEventId: String(targetFocusId),
              scheduledDate: pt.date || null,
              scheduledTime: null
            });
            modified = true;
          }
        });
      }
    });

    if (modified) {
      localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
    }
  } catch (e) {
    // Non bloquant
  }
}

function savePlanState() {
  syncPlanTasksToFocusStorage();
  localStorage.setItem('span_plan_tasks', JSON.stringify(window.SpanPlanState.tasks));
  renderPlanGrid();
  renderBacklogDrawer();
  updateCounters();
  if (suiteBridge) {
    try {
      suiteBridge.postMessage({ type: 'PLAN_UPDATED', timestamp: Date.now() });
    } catch (e) {}
  }
  if (typeof syncPlanToCloud === 'function') syncPlanToCloud();
}


function formatMinutesDuration(totalM) {
  if (totalM <= 0) return '0h';
  const h = Math.floor(totalM / 60);
  const m = totalM % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function getTaskDurationOnDate(t, dateStr) {
  const dur = t.duration || 45;
  if (!t.time || !dateStr) return dur;
  const startM = timeToMinutes(t.time);
  if (startM + dur > 1440) {
    if (dateStr === t.date) return Math.max(0, 1440 - startM);
    if (dateStr > t.date) return Math.max(0, Math.min(1440, (startM + dur) - 1440));
  }
  return dur;
}

function renderDayCapacityHtml(timedTasks, dateStr = null) {
  const workM = timedTasks.filter(t => t.context === 'work').reduce((acc, t) => acc + getTaskDurationOnDate(t, dateStr), 0);
  const lifeM = timedTasks.filter(t => t.context === 'life').reduce((acc, t) => acc + getTaskDurationOnDate(t, dateStr), 0);
  const funM  = timedTasks.filter(t => t.context === 'fun').reduce((acc, t) => acc + getTaskDurationOnDate(t, dateStr), 0);
  const totalM = workM + lifeM + funM;

  if (totalM <= 0) return ''; // Pas de texte encombrant ni de barre inutile si journée libre

  const maxBudget = Math.max(480, totalM); // Baseline 8h
  const pctWork = Math.min(100, (workM / maxBudget) * 100);
  const pctLife = Math.min(100, (lifeM / maxBudget) * 100);
  const pctFun  = Math.min(100, (funM  / maxBudget) * 100);

  const breakdownTitle = `${timedTasks.length} item${timedTasks.length > 1 ? 's' : ''} scheduled • Work: ${formatMinutesDuration(workM)} · Life: ${formatMinutesDuration(lifeM)} · Fun: ${formatMinutesDuration(funM)}`;

  return `
    <div class="cal-day-capacity-pill" title="${breakdownTitle}">
      <span class="capacity-total-txt">${formatMinutesDuration(totalM)}</span>
      <div class="capacity-mini-bar">
        <span class="cap-bar-seg seg-work" style="width: ${pctWork}%;"></span>
        <span class="cap-bar-seg seg-life" style="width: ${pctLife}%;"></span>
        <span class="cap-bar-seg seg-fun"  style="width: ${pctFun}%;"></span>
      </div>
    </div>
  `;
}

function handleCanvasHoverMove(e) {
  if (isPointerDragging || hasMovedBeyondThreshold || draggedTaskId || window.draggedSubtaskInfo || window.draggedBatchSubtasksInfo || isDrawingMarquee) {
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

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function calculateVisibleDates() {
  const dates = [];
  const count = isMobileScreen() ? 1 : visibleDaysCount;
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + currentTimelineOffset);

  if (count === 7 || count === 5) {
    const monday = getMonday(baseDate);
    for (let i = 0; i < count; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d);
    }
  } else {
    for (let i = 0; i < count; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      dates.push(d);
    }
  }
  return dates;
}

function renderTimeRulerHtml(visibleDates = []) {
  let html = '';
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const top = (h - START_HOUR) * HOUR_HEIGHT;
    const label = `${String(h).padStart(2, '0')}:00`;
    const isNight = (h < 7);
    html += `
      <div class="cal-time-label-row ${isNight ? 'is-night' : ''}" style="top: ${top}px;">
        <span>${label}</span>
      </div>
    `;
  }

  const hasToday = visibleDates.some(d => getLocalDateString(d) === TODAY_STR);
  if (hasToday) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = START_HOUR * 60;
    const endMinutes = (END_HOUR + 1) * 60;
    if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
      const nowTop = Math.round(((currentMinutes - startMinutes) / 60) * HOUR_HEIGHT);
      const currH = String(now.getHours()).padStart(2, '0');
      const currM = String(now.getMinutes()).padStart(2, '0');
      html += `
        <div class="cal-time-now-badge" style="top: ${nowTop}px;" title="Current time: ${currH}:${currM}">
          <span>${currH}:${currM}</span>
        </div>
      `;
    }
  }

  return html;
}

function renderColumnHourLines() {
  let html = '';
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const top = (h - START_HOUR) * HOUR_HEIGHT;
    const isNight = (h < 7);
    html += `
      <div class="cal-hour-line ${isNight ? 'is-night' : ''}" style="top: ${top}px;"></div>
    `;
  }
  return html;
}

function quickAddAllDayPrompt(dateStr) {
  openCreateModalWithDefaults(dateStr, '');
}

function renderAllDayContinuousRibbonHtml(visibleDates) {
  if (!visibleDates || visibleDates.length === 0) return '';
  const visibleDateStrs = visibleDates.map(d => getLocalDateString(d));
  const visStartStr = visibleDateStrs[0];
  const visEndStr = visibleDateStrs[visibleDateStrs.length - 1];

  const allTasks = window.SpanPlanState.tasks || [];
  const items = [];

  allTasks.forEach(task => {
    const isMultiDay = !!(task.date && task.endDate && task.endDate > task.date);
    const isAllDay = !!task.allDay || (!task.time && !!task.date) || isMultiDay;
    if (!isAllDay) return;

    const contextMatch = (currentContextFilter === 'all' || task.context === currentContextFilter);
    const tagMatch = !currentTagFilter || (task.title && task.title.toLowerCase().includes(`#${currentTagFilter.toLowerCase()}`));
    if (!contextMatch || !tagMatch) return;

    const rec = task.recurrence || 'none';

    if (rec === 'none') {
      const tStart = task.date || visStartStr;
      const tEnd = (task.endDate && task.endDate >= tStart) ? task.endDate : tStart;
      if (tEnd < visStartStr || tStart > visEndStr) return;

      let colStart = visibleDateStrs.indexOf(tStart);
      const startsBefore = (colStart === -1);
      if (startsBefore) colStart = 0;

      let colEnd = visibleDateStrs.indexOf(tEnd);
      const endsAfter = (colEnd === -1);
      if (endsAfter) colEnd = visibleDateStrs.length - 1;

      items.push({
        task,
        colStart,
        colEnd,
        spanCols: (colEnd - colStart + 1),
        isMultiDay: isMultiDay || (colEnd > colStart) || startsBefore || endsAfter,
        startsBefore,
        endsAfter
      });
    } else {
      visibleDateStrs.forEach((ds, cIdx) => {
        if (isTaskOccurringOnDate(task, ds)) {
          items.push({
            task,
            colStart: cIdx,
            colEnd: cIdx,
            spanCols: 1,
            isMultiDay: false,
            startsBefore: false,
            endsAfter: false
          });
        }
      });
    }
  });

  // Tri : bannières multi-jours les plus longues en haut, puis par colonne de départ
  items.sort((a, b) => {
    if (b.spanCols !== a.spanCols) return b.spanCols - a.spanCols;
    if (a.colStart !== b.colStart) return a.colStart - b.colStart;
    return (a.task.title || '').localeCompare(b.task.title || '');
  });

  // Algorithme glouton d'affectation des pistes (lignes horizontales)
  const tracks = [];
  items.forEach(item => {
    let assigned = -1;
    for (let r = 0; r < tracks.length; r++) {
      const collision = tracks[r].some(occ => !(item.colEnd < occ.start || item.colStart > occ.end));
      if (!collision) {
        assigned = r;
        tracks[r].push({ start: item.colStart, end: item.colEnd });
        break;
      }
    }
    if (assigned === -1) {
      assigned = tracks.length;
      tracks.push([{ start: item.colStart, end: item.colEnd }]);
    }
    item.track = assigned;
  });

  const totalTracks = Math.max(1, tracks.length);

  const dropCellsHtml = visibleDates.map((dateObj, c) => {
    const dateStr = getLocalDateString(dateObj);
    return `
      <div class="cal-allday-drop-cell" 
           style="grid-column: ${c + 1}; grid-row: 1 / -1;"
           data-date="${dateStr}"
           ondragover="allowDockDrop(event)" 
           ondragleave="removeDockDropHighlight(event)"
           ondrop="handleDropToDock(event, '${dateStr}')"
           onclick="quickAddAllDayPrompt('${dateStr}')"
           title="Click or drop to add all-day event on ${dateStr}">
      </div>
    `;
  }).join('');

  const ribbonsHtml = items.map(item => {
    const { task, colStart, colEnd, isMultiDay, startsBefore, endsAfter, track } = item;
    const isEvent = task.type === 'event';
    const recIcon = (task.recurrence && task.recurrence !== 'none') ? '<span class="recurrence-badge" title="Repeats: ' + task.recurrence + '">🔁</span> ' : '';
    const childSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const doneSubCount = childSubtasks.filter(s => s.completed).length;
    const progressPillHtml = childSubtasks.length > 0 
      ? `<span class="event-progress-pill" onclick="event.stopPropagation(); openSubtasksModal('${task.id}')" title="Subtasks (${doneSubCount}/${childSubtasks.length})">${doneSubCount}/${childSubtasks.length}</span>` 
      : '';

    const rangeTooltip = (task.date && task.endDate && task.endDate > task.date) ? ` • ${task.date} → ${task.endDate}` : '';
    const dateRangeLabel = isMultiDay ? `<span class="ribbon-date-range">${task.date.slice(5)} → ${task.endDate ? task.endDate.slice(5) : ''}</span>` : '';

    const multiDayClasses = [
      isMultiDay ? 'is-multiday-span' : '',
      startsBefore ? 'starts-before' : '',
      endsAfter ? 'ends-after' : ''
    ].filter(Boolean).join(' ');

    let alldayLocHtml = '';
    if (task.location && task.location.trim()) {
      const locRaw = task.location.trim();
      const isUrl = /^https?:\/\//i.test(locRaw) || /^www\./i.test(locRaw) || locRaw.includes('meet.google.com') || locRaw.includes('zoom.us');
      const safeHref = /^https?:\/\//i.test(locRaw) ? locRaw : `https://${locRaw}`;
      if (isUrl) {
        alldayLocHtml = `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="ribbon-link-pill" onclick="event.stopPropagation()" title="Ouvrir : ${escapeHtml(locRaw)}">🔗</a>`;
      } else {
        alldayLocHtml = `<span class="ribbon-location-pill" title="Lieu : ${escapeHtml(locRaw)}">📍</span>`;
      }
    }

    return `
      <div class="cal-allday-ribbon cat-${task.context || 'work'} ${task.completed ? 'completed' : ''} ${multiDayClasses}"
           id="allday_${task.id}"
           style="grid-column: ${colStart + 1} / ${colEnd + 2}; grid-row: ${track + 1}; z-index: 2;"
           draggable="true"
           ondragstart="handleDragStart(event, '${task.id}')"
           ondragend="handleDragEnd(event)"
           onclick="event.stopPropagation(); openEditModal('${task.id}')"
           title="${escapeHtml(task.title)}${rangeTooltip}">
        <div class="ribbon-content">
          ${!isEvent ? `
            <div class="subtask-mini-checkbox ${task.completed ? 'checked' : ''}" 
                 onclick="event.stopPropagation(); toggleTaskCompletion('${task.id}')">
              ${task.completed ? '✓' : ''}
            </div>
          ` : '<span style="font-size:10.5px; flex-shrink:0;">📅</span>'}
          <span class="ribbon-title">${recIcon}${renderTitleWithTagsHtml(task.title)}</span>
          ${dateRangeLabel}
          ${alldayLocHtml}
          ${progressPillHtml}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="cal-allday-section">
      <div class="cal-gutter-allday">
        <span class="allday-label">ALL-DAY</span>
      </div>
      <div class="cal-allday-grid" style="grid-template-columns: repeat(${visibleDates.length}, 1fr); grid-template-rows: repeat(${totalTracks}, auto);">
        ${dropCellsHtml}
        ${ribbonsHtml}
      </div>
    </div>
  `;
}

function renderPlanGrid(forceRebuild = false) {
  const grid = document.getElementById('plannerGrid');
  if (!grid) return;

  const visibleDates = calculateVisibleDates();
  const visibleDateStrs = visibleDates.map(d => getLocalDateString(d));

  // Sauvegarder le scroll global du viewport actuel
  const viewport = document.getElementById('calScrollViewport');
  const prevScroll = viewport ? viewport.scrollTop : null;

  // Calculer les données par jour (avec support des récurrences et multi-jours)
  const dayDataMap = new Map();
  visibleDates.forEach(dateObj => {
    const dateStr = getLocalDateString(dateObj);
    const dayTasks = (window.SpanPlanState.tasks || []).filter(t => {
      const occurs = isTaskOccurringOnDate(t, dateStr);
      const contextMatch = (currentContextFilter === 'all' || t.context === currentContextFilter);
      const tagMatch = !currentTagFilter || (t.title && t.title.toLowerCase().includes(`#${currentTagFilter.toLowerCase()}`));
      return occurs && contextMatch && tagMatch;
    });
    dayDataMap.set(dateStr, {
      dateObj,
      timedTasks: dayTasks.filter(t => !t.allDay && !!t.time),
      unscheduledTasks: dayTasks.filter(t => t.allDay || !t.time)
    });
  });

  // Construction des en-têtes de colonnes (Badge jour + Capacité horaire)
  const headerCellsHtml = visibleDates.map(dateObj => {
    const dateStr = getLocalDateString(dateObj);
    const isToday = (dateStr === TODAY_STR);
    const weekdayShort = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const dayNumber = dateObj.getDate();
    const { timedTasks } = dayDataMap.get(dateStr);

    const capacityHtml = renderDayCapacityHtml(timedTasks, dateStr);

    return `
      <div class="cal-day-header-cell ${isToday ? 'is-today' : ''}" data-date="${dateStr}">
        <div class="cal-day-title-row">
          <div class="cal-day-left-badge">
            <span class="cal-day-name">${isToday ? 'TODAY' : weekdayShort}</span>
            <div class="cal-day-disc ${isToday ? 'is-today-disc' : ''}">
              <span class="cal-day-date-number">${dayNumber}</span>
            </div>
          </div>
          ${capacityHtml}
        </div>
      </div>
    `;
  }).join('');

  const hourLinesTemplate = renderColumnHourLines();

  const gridColumnsHtml = visibleDates.map(dateObj => {
    const dateStr = getLocalDateString(dateObj);
    const isToday = (dateStr === TODAY_STR);
    const { timedTasks } = dayDataMap.get(dateStr);

    return `
      <div class="cal-day-column ${isToday ? 'is-today' : ''}" data-date="${dateStr}">
        <div class="cal-day-hour-lines">
          ${hourLinesTemplate}
        </div>
        <div class="schedule-grid-canvas" 
             id="canvas_${dateStr}" 
             data-date="${dateStr}"
             onpointerdown="handleCanvasPointerDown(event, '${dateStr}')"
             onpointermove="handleCanvasHoverMove(event)"
             onpointerleave="handleCanvasHoverLeave(event)"
             ondragover="allowCanvasDrop(event)" 
             ondragleave="removeCanvasDropHighlight(event)"
             ondrop="handleCanvasDrop(event, '${dateStr}')">
          <div class="cal-marquee"></div>
          ${renderTimedBlocks(timedTasks, dateStr)}
          ${isToday ? renderNowLineHtml() : ''}
        </div>
      </div>
    `;
  }).join('');

  grid.innerHTML = `
    <div class="cal-unified-container">
      <div class="cal-sticky-header">
        <div class="cal-header-top-row">
          <div class="cal-gutter-header">
            <span class="cal-tz-label">TIME</span>
          </div>
          <div class="cal-columns-header" style="grid-template-columns: repeat(${visibleDates.length}, 1fr);">
            ${headerCellsHtml}
          </div>
        </div>
        ${renderAllDayContinuousRibbonHtml(visibleDates)}
      </div>

      <div class="cal-scroll-viewport" id="calScrollViewport">
        <div class="cal-scroll-content">
          <div class="cal-time-ruler">
            ${renderTimeRulerHtml(visibleDates)}
          </div>
          <div class="cal-grid-columns" style="grid-template-columns: repeat(${visibleDates.length}, 1fr);">
            ${gridColumnsHtml}
          </div>
        </div>
      </div>
    </div>
  `;

  // Restaurer le scroll fluide
  const newViewport = document.getElementById('calScrollViewport');
  if (newViewport && prevScroll !== null) {
    newViewport.scrollTop = prevScroll;
  }

  updateRangeLabel(visibleDates);
  if (typeof renderDateStrip === 'function') renderDateStrip();
  if (typeof renderMiniMonthCalendar === 'function') renderMiniMonthCalendar();
}

// ==============================================================
// MINI MONTH CALENDAR (DATEPICKER & RANGE INDICATOR)
// ==============================================================
let miniCalYear = (new Date()).getFullYear();
let miniCalMonth = (new Date()).getMonth(); // 0-indexed
let isMiniCalCollapsed = localStorage.getItem('span_plan_mini_cal_collapsed') === 'true';

function updateMiniCalCollapseUI() {
  const widget = document.getElementById('miniCalendarWidget');
  const icon = document.getElementById('miniCalCollapseIcon');
  if (widget) {
    widget.classList.toggle('is-collapsed', isMiniCalCollapsed);
  }
  if (icon) {
    icon.textContent = isMiniCalCollapsed ? '▸' : '▾';
  }
}
window.updateMiniCalCollapseUI = updateMiniCalCollapseUI;

function toggleMiniCalCollapse() {
  isMiniCalCollapsed = !isMiniCalCollapsed;
  localStorage.setItem('span_plan_mini_cal_collapsed', isMiniCalCollapsed ? 'true' : 'false');
  updateMiniCalCollapseUI();
}
window.toggleMiniCalCollapse = toggleMiniCalCollapse;

function navigateMiniCal(deltaMonth) {
  miniCalMonth += deltaMonth;
  if (miniCalMonth < 0) {
    miniCalMonth = 11;
    miniCalYear--;
  } else if (miniCalMonth > 11) {
    miniCalMonth = 0;
    miniCalYear++;
  }
  renderMiniMonthCalendar();
}

function selectDateFromMiniCal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetDate = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const count = isMobileScreen() ? 1 : visibleDaysCount;
  if (count === 7 || count === 5) {
    const targetMonday = getMonday(targetDate);
    const todayMonday = getMonday(today);
    const diffTime = targetMonday.getTime() - todayMonday.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    currentTimelineOffset = diffDays;
  } else {
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    currentTimelineOffset = diffDays;
  }

  renderPlanGrid(true);
  applyDynamicScroll();
}

function renderMiniMonthCalendar() {
  updateMiniCalCollapseUI();
  const widget = document.getElementById('miniCalendarWidget');
  if (!widget) return;

  const displayDate = new Date(miniCalYear, miniCalMonth, 1);
  const monthName = displayDate.toLocaleDateString('en-US', { month: 'short' });

  let gridEl = document.getElementById('miniCalGrid');
  if (!gridEl) {
    widget.innerHTML = `
      <div class="mini-cal-header" onclick="toggleMiniCalCollapse()" title="Cliquer pour plier / déplier le calendrier">
        <div class="mini-cal-title-wrap">
          <span class="mini-cal-collapse-icon" id="miniCalCollapseIcon">${isMiniCalCollapsed ? '▸' : '▾'}</span>
          <span class="mini-cal-title" id="miniCalMonthYear">${monthName} ${miniCalYear}</span>
        </div>
        <div class="mini-cal-nav" onclick="event.stopPropagation()">
          <button type="button" class="mini-nav-btn" onclick="navigateMiniCal(-1)" title="Previous month">‹</button>
          <button type="button" class="mini-nav-btn" onclick="navigateMiniCal(1)" title="Next month">›</button>
        </div>
      </div>
      <div class="mini-cal-body" id="miniCalBody">
        <div class="mini-cal-weekdays">
          <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
        </div>
        <div class="mini-cal-grid" id="miniCalGrid"></div>
      </div>
    `;
    gridEl = document.getElementById('miniCalGrid');
  }
  if (!gridEl) return;

  const titleEl = document.getElementById('miniCalMonthYear');
  if (titleEl) {
    titleEl.textContent = `${monthName} ${miniCalYear}`;
  }

  // Obtenir les dates de la vue principale actuellement affichées
  const visibleDates = calculateVisibleDates();
  const visibleDateStrs = new Set(visibleDates.map(d => getLocalDateString(d)));
  const firstVisibleStr = visibleDates.length > 0 ? getLocalDateString(visibleDates[0]) : null;

  // Calculer l'ensemble des dates ayant des événements/tâches (incluant récurrences et multi-jours)
  const datesWithTasks = new Set();
  const allTasks = window.SpanPlanState.tasks || [];
  const checkCur = new Date(miniCalYear, miniCalMonth - 1, 20);
  const checkEnd = new Date(miniCalYear, miniCalMonth + 1, 15);
  while (checkCur <= checkEnd) {
    const ds = getLocalDateString(checkCur);
    if (allTasks.some(t => isTaskOccurringOnDate(t, ds))) {
      datesWithTasks.add(ds);
    }
    checkCur.setDate(checkCur.getDate() + 1);
  }

  // Premier jour du mois
  const firstDay = new Date(miniCalYear, miniCalMonth, 1);
  let startDayOfWeek = firstDay.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6;

  // Dernier jour du mois courant
  const lastDay = new Date(miniCalYear, miniCalMonth + 1, 0);
  const totalDaysInMonth = lastDay.getDate();

  // Dernier jour du mois précédent
  const prevMonthLastDay = new Date(miniCalYear, miniCalMonth, 0).getDate();

  let cellsHtml = '';

  // Jours du mois précédent
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dNum = prevMonthLastDay - i;
    const prevMonthDate = new Date(miniCalYear, miniCalMonth - 1, dNum);
    const dateStr = getLocalDateString(prevMonthDate);
    const isInRange = visibleDateStrs.has(dateStr);
    const isRangeStart = (dateStr === firstVisibleStr);
    const hasEvents = datesWithTasks.has(dateStr);
    cellsHtml += `
      <div class="mini-cal-day other-month ${isInRange ? 'is-in-range' : ''} ${isRangeStart ? 'is-range-start' : ''} ${hasEvents ? 'has-events' : ''}" 
           onclick="selectDateFromMiniCal('${dateStr}')">
        ${dNum}
      </div>
    `;
  }

  // Jours du mois courant
  for (let d = 1; d <= totalDaysInMonth; d++) {
    const curDate = new Date(miniCalYear, miniCalMonth, d);
    const dateStr = getLocalDateString(curDate);
    const isToday = (dateStr === TODAY_STR);
    const isInRange = visibleDateStrs.has(dateStr);
    const isRangeStart = (dateStr === firstVisibleStr);
    const hasEvents = datesWithTasks.has(dateStr);

    cellsHtml += `
      <div class="mini-cal-day ${isToday ? 'is-today' : ''} ${isInRange ? 'is-in-range' : ''} ${isRangeStart ? 'is-range-start' : ''} ${hasEvents ? 'has-events' : ''}" 
           onclick="selectDateFromMiniCal('${dateStr}')"
           title="${dateStr}">
        ${d}
      </div>
    `;
  }

  // Jours du mois suivant
  const totalRenderedSoFar = startDayOfWeek + totalDaysInMonth;
  const remainingCells = (totalRenderedSoFar % 7 === 0) ? 0 : 7 - (totalRenderedSoFar % 7);
  for (let nextD = 1; nextD <= remainingCells; nextD++) {
    const nextDate = new Date(miniCalYear, miniCalMonth + 1, nextD);
    const dateStr = getLocalDateString(nextDate);
    const isInRange = visibleDateStrs.has(dateStr);
    const isRangeStart = (dateStr === firstVisibleStr);
    const hasEvents = datesWithTasks.has(dateStr);

    cellsHtml += `
      <div class="mini-cal-day other-month ${isInRange ? 'is-in-range' : ''} ${isRangeStart ? 'is-range-start' : ''} ${hasEvents ? 'has-events' : ''}" 
           onclick="selectDateFromMiniCal('${dateStr}')">
        ${nextD}
      </div>
    `;
  }

  gridEl.innerHTML = cellsHtml;
}

// TOGGLE SIDEBAR (⌘B / [)
function toggleSidebar(forceOpen = null) {
  const shell = document.getElementById('appShell');
  if (!shell) return;
  const isCurrentlyCollapsed = shell.classList.contains('sidebar-collapsed');
  let shouldOpen;
  if (forceOpen !== null) {
    shouldOpen = !!forceOpen;
  } else {
    shouldOpen = isCurrentlyCollapsed;
  }
  shell.classList.toggle('sidebar-collapsed', !shouldOpen);
  localStorage.setItem('span_plan_sidebar_collapsed', !shouldOpen ? '1' : '0');
}

// ALGORITHME DE RÉSOLUTION DES CHEVAUCHEMENTS D'HORAIRES (MULTI-COLONNES STYLE GOOGLE/APPLE CALENDAR)
function computeOverlapLayout(tasks, dateStr = null) {
  if (!tasks || tasks.length === 0) return [];

  const parsed = tasks.map(t => {
    const taskStartM = timeToMinutes(t.time || '00:00');
    const totalDuration = t.duration || 45;
    const isOvernight = (taskStartM + totalDuration > 1440);

    let start = taskStartM;
    let duration = totalDuration;
    let isContinuation = false;

    if (isOvernight && dateStr) {
      if (dateStr === t.date) {
        // Premier jour de l'événement nocturne : s'arrête exactement à minuit (1440)
        start = taskStartM;
        duration = 1440 - taskStartM;
      } else if (dateStr > t.date) {
        // Jour suivant (glissement sur le début du jour suivant) : de 00:00 jusqu'au restant
        start = 0;
        duration = Math.min(1440, (taskStartM + totalDuration) - 1440);
        isContinuation = true;
      }
    }

    const end = start + duration;
    return { task: t, start, end, duration, isContinuation, isOvernight, totalDuration };
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

  return `
    <div class="now-timeline-marker" style="top: ${top}px;">
      <span class="now-dot"></span>
    </div>
  `;
}

function renderEmptyDayGuidanceHtml() {
  return '';
}

function renderTimedBlocks(tasks, dateStr) {
  const layoutItems = computeOverlapLayout(tasks, dateStr);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return layoutItems.map(({ task, start, duration, colIndex, totalCols, isContinuation, isOvernight, totalDuration }) => {
    const isEvent = task.type === 'event';
    const isSelected = selectedTaskIds.has(task.id);
    const isLiveNow = (dateStr === TODAY_STR && currentMinutes >= start && currentMinutes < (start + duration));
    const startMinutes = START_HOUR * 60;
    let top = Math.round(((start - startMinutes) / 60) * HOUR_HEIGHT) + 1;
    top = Math.max(0, top);

    const height = Math.max(22, Math.round((duration / 60) * HOUR_HEIGHT) - 2);

    const endTotal = start + duration;
    const endH = String(Math.floor(endTotal / 60)).padStart(2, '0');
    const endM = String(endTotal % 60).padStart(2, '0');

    let timeRangeStr = '';
    if (isContinuation) {
      timeRangeStr = `00:00 – ${endH}:${endM} (suite)`;
    } else if (isOvernight) {
      const fullEndM = (timeToMinutes(task.time) + totalDuration) % 1440;
      const fullEndH = String(Math.floor(fullEndM / 60)).padStart(2, '0');
      const fullEndMin = String(fullEndM % 60).padStart(2, '0');
      timeRangeStr = `${task.time} – ${fullEndH}:${fullEndMin} (+1j)`;
    } else {
      timeRangeStr = `${task.time} – ${endH}:${endM}`;
    }

    const continuationPrefix = isContinuation ? '<span class="overnight-continuation-badge" title="Suite de la veille">↳ </span>' : '';
    const overnightClass = isContinuation ? 'is-overnight-continuation' : (isOvernight ? 'is-overnight-start' : '');

    const rolloverClass = task.isRollover ? 'rollover' : '';
    const rolloverPrefix = task.isRollover ? '⟳ ' : '';
    const recPrefix = (task.recurrence && task.recurrence !== 'none') ? '<span class="recurrence-badge" title="Repeats: ' + task.recurrence + '">🔁</span> ' : '';
    const eventClass = isEvent ? 'is-event' : '';
    const selectedClass = isSelected ? 'is-selected' : '';
    const liveClass = isLiveNow ? 'is-live-now' : '';
    const completedClass = task.completed ? 'is-completed' : '';
    const isCompact = height < 38;

    // Gestion propre des colonnes de chevauchement pleine largeur
    let positionStyle = `top: ${top}px; height: ${height}px;`;
    if (totalCols > 1) {
      positionStyle += ` left: calc(4px + (100% - 8px) * ${colIndex} / ${totalCols}); width: calc((100% - 8px) / ${totalCols} - 3px);`;
    }
    const narrowColClass = totalCols >= 3 ? 'is-narrow-col' : (totalCols === 2 ? 'is-semi-narrow-col' : '');

    const childSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const doneSubCount = childSubtasks.filter(s => s.completed).length;
    const isExpanded = window.expandedBlockAccordionIds && window.expandedBlockAccordionIds.has(task.id);
    const expandedClass = isExpanded ? 'is-expanded' : '';
    const progressPillHtml = childSubtasks.length > 0 
      ? `<span class="event-progress-pill clickable-pill" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); toggleBlockAccordion(event, '${task.id}')" title="Sous-tâches (${doneSubCount}/${childSubtasks.length}) - Cliquer pour ${isExpanded ? 'replier' : 'déplier'}">☑ ${doneSubCount}/${childSubtasks.length} ${isExpanded ? '▴' : '▾'}</span>` 
      : '';

    const remainingMinutes = Math.max(0, endTotal - currentMinutes);

    let subtasksHtml = '';
    const baseVisibleLimit = height >= 95 ? 2 : (height >= 75 ? 1 : 0);
    const overflowCount = Math.max(0, childSubtasks.length - baseVisibleLimit);
    const hasOverflow = overflowCount > 0;

    if (childSubtasks.length > 0) {
      const sortedSubtasks = [...childSubtasks].sort((a, b) => (a.completed ? 1 : 0) - (b.completed ? 1 : 0));

      subtasksHtml = `
        <div class="block-subtasks-container accordion-subtasks" data-count="${sortedSubtasks.length}" onpointerdown="event.stopPropagation()">
          ${sortedSubtasks.map((sub, idx) => {
            const subAction = getTaskActionType(sub);
            let subActionBadge = '';
            if (subAction === 'call') subActionBadge = '<span class="subtask-action-mini-badge" title="Call">📞</span>';
            else if (subAction === 'mail') subActionBadge = '<span class="subtask-action-mini-badge" title="Mail">✉️</span>';
            else if (subAction === 'pay') subActionBadge = '<span class="subtask-action-mini-badge" title="Paiement">💳</span>';

            return `
            <div class="block-subtask-row subtask-cat-${sub.context || 'work'} ${sub.completed ? 'completed' : ''} ${idx >= baseVisibleLimit ? 'subtask-overflow-item' : ''}" 
                 draggable="true"
                 onpointerdown="event.stopPropagation()"
                 ondragstart="handleSubtaskDragStart(event, '${task.id}', '${sub.id}')"
                 ondragend="handleSubtaskDragEnd(event)"
                 ondblclick="event.stopPropagation(); openSubtasksModal('${task.id}', false, '${sub.id}')"
                 title="${sub.completed ? 'Marquer comme non fait' : 'Marquer comme fait'} (double-cliquer pour modifier, glisser pour déplacer)">
              <div class="subtask-mini-checkbox ${sub.completed ? 'checked' : ''}"
                   onclick="event.stopPropagation(); toggleSubtaskCompletion('${task.id}', '${sub.id}')"
                   title="${sub.completed ? 'Marquer comme non fait' : 'Marquer comme fait'}">
                ${sub.completed ? '✓' : ''}
              </div>
              ${subActionBadge}
              <span class="subtask-row-title" 
                    onclick="event.stopPropagation(); openSubtasksModal('${task.id}', false, '${sub.id}')"
                    ondblclick="event.stopPropagation(); openSubtasksModal('${task.id}', false, '${sub.id}')"
                    title="Cliquer pour modifier">${renderTitleWithTagsHtml(sub.title)}</span>
              <button type="button" 
                      class="btn-subtask-quick-backlog" 
                      onpointerdown="event.stopPropagation()" 
                      onclick="event.stopPropagation(); moveSubtaskToBacklog('${task.id}', '${sub.id}')" 
                      title="Déplacer vers le Backlog">📥</button>
            </div>
          `;}).join('')}
          ${isExpanded ? `
            <button type="button" 
                    class="block-subtask-add-btn" 
                    onpointerdown="event.stopPropagation()"
                    onclick="event.stopPropagation(); quickAddSubtaskFromBlock('${task.id}')"
                    title="Ajouter une sous-tâche">
              + Ajouter sous-tâche
            </button>
          ` : ''}
          ${hasOverflow ? `
            <button type="button" 
                    class="subtasks-unfold-btn" 
                    onpointerdown="event.stopPropagation()"
                    onclick="toggleBlockAccordion(event, '${task.id}')"
                    title="${isExpanded ? 'Replier les sous-tâches' : 'Déplier toutes les sous-tâches'}">
              <span class="unfold-btn-text">${isExpanded ? 'Moins' : `+${overflowCount} autre${overflowCount > 1 ? 's' : ''}`}</span>
              <span class="unfold-btn-arrow">${isExpanded ? '▴' : '▾'}</span>
            </button>
          ` : ''}
        </div>
      `;
    }

    let locationHtml = '';
    if (task.location && task.location.trim()) {
      const locRaw = task.location.trim();
      const isUrl = /^https?:\/\//i.test(locRaw) || /^www\./i.test(locRaw) || locRaw.includes('meet.google.com') || locRaw.includes('zoom.us') || locRaw.includes('teams.microsoft.com');
      const safeHref = /^https?:\/\//i.test(locRaw) ? locRaw : `https://${locRaw}`;

      if (isUrl) {
        let linkLabel = 'Lien';
        if (locRaw.includes('meet.google.com')) linkLabel = 'Meet';
        else if (locRaw.includes('zoom.us')) linkLabel = 'Zoom';
        else if (locRaw.includes('teams.microsoft.com')) linkLabel = 'Teams';
        else {
          try {
            const domain = new URL(safeHref).hostname.replace(/^www\./, '');
            linkLabel = domain.length > 14 ? domain.slice(0, 12) + '…' : domain;
          } catch (e) {
            linkLabel = 'Lien';
          }
        }
        locationHtml = `
          <a href="${safeHref}" target="_blank" rel="noopener noreferrer" 
             class="block-link-pill" 
             onpointerdown="event.stopPropagation()"
             onclick="event.stopPropagation()" 
             title="Ouvrir le lien (${escapeHtml(locRaw)})">
            🔗 ${escapeHtml(linkLabel)} ↗
          </a>
        `;
      } else {
        locationHtml = `
          <span class="block-location-pill" 
                onpointerdown="event.stopPropagation()"
                onclick="event.stopPropagation(); openEditModal('${task.id}')" 
                title="Lieu : ${escapeHtml(locRaw)}">
            📍 ${escapeHtml(locRaw)}
          </span>
        `;
      }
    }

    let notesHtml = '';
    if (task.notes && task.notes.trim()) {
      const cleanNotesPreview = task.notes.trim().slice(0, 150);
      notesHtml = `
        <span class="block-notes-pill" 
              onpointerdown="event.stopPropagation()"
              onclick="event.stopPropagation(); openEditModal('${task.id}')" 
              title="Notes : ${escapeHtml(cleanNotesPreview)}">
          📝
        </span>
      `;
    }

    const actionType = getTaskActionType(task);
    let blockActionTagHtml = '';
    if (actionType === 'call') {
      blockActionTagHtml = `<span class="plan-action-tag-badge action-call" onclick="event.stopPropagation(); cyclePlanTaskAction('${task.id}')" title="Action: Call (cliquer pour changer)">📞 Call</span>`;
    } else if (actionType === 'mail') {
      blockActionTagHtml = `<span class="plan-action-tag-badge action-mail" onclick="event.stopPropagation(); cyclePlanTaskAction('${task.id}')" title="Action: Mail (cliquer pour changer)">✉️ Mail</span>`;
    } else if (actionType === 'pay') {
      blockActionTagHtml = `<span class="plan-action-tag-badge action-pay" onclick="event.stopPropagation(); cyclePlanTaskAction('${task.id}')" title="Action: Paiement (cliquer pour changer)">💳 Pay</span>`;
    }

    let innerContentHtml = '';
    if (isCompact) {
      innerContentHtml = `
        <div class="schedule-block-compact-row">
          ${!isEvent ? `
            <div class="checkbox ${task.completed ? 'checked' : ''}" 
                 onclick="event.stopPropagation(); toggleTaskCompletion('${task.id}')" 
                 title="${task.completed ? 'Mark incomplete' : 'Mark completed'}">
              ${task.completed ? '✓' : ''}
            </div>
          ` : ''}
          <span class="compact-time">${isContinuation ? `00:00 – ${endH}:${endM}` : task.time}</span>
          <span class="schedule-block-title">${continuationPrefix}${rolloverPrefix}${recPrefix}${renderTitleWithTagsHtml(task.title)}${blockActionTagHtml ? ' ' + blockActionTagHtml : ''}</span>
          ${locationHtml}
          ${notesHtml}
          ${isLiveNow ? `
            <span class="live-status-pill mini"><span class="live-status-dot"></span>LIVE</span>
            <span class="live-meta-remaining">${remainingMinutes}m</span>
          ` : ''}
          <div class="schedule-block-top-actions">
            ${progressPillHtml}
            <button type="button" class="btn-block-quick-add-subtask" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); quickAddSubtaskFromBlock('${task.id}')" title="Ajouter une sous-tâche">➕</button>
            <button type="button" class="btn-task-menu" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); openTaskPopover(event, '${task.id}')" title="Options">⋮</button>
          </div>
        </div>
        ${subtasksHtml}
      `;
    } else {
      innerContentHtml = `
        <div class="schedule-block-top">
          ${!isEvent ? `
            <div class="checkbox ${task.completed ? 'checked' : ''}" 
                 onclick="event.stopPropagation(); toggleTaskCompletion('${task.id}')" 
                 title="${task.completed ? 'Mark incomplete' : 'Mark completed'}">
              ${task.completed ? '✓' : ''}
            </div>
          ` : ''}
          <span class="schedule-block-title">${continuationPrefix}${rolloverPrefix}${recPrefix}${renderTitleWithTagsHtml(task.title)}${blockActionTagHtml ? ' ' + blockActionTagHtml : ''}</span>
          <div class="schedule-block-top-actions">
            ${progressPillHtml}
            <button type="button" class="btn-block-quick-add-subtask" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); quickAddSubtaskFromBlock('${task.id}')" title="Ajouter une sous-tâche">➕</button>
            <button type="button" class="btn-task-menu" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); openTaskPopover(event, '${task.id}')" title="Options">⋮</button>
          </div>
        </div>
        <div class="schedule-block-meta">
          <span class="schedule-block-time">${timeRangeStr}</span>
          ${isLiveNow ? `
            <span class="live-meta-divider">•</span>
            <span class="live-status-pill mini"><span class="live-status-dot"></span>LIVE</span>
            <span class="live-meta-remaining">${remainingMinutes}m</span>
          ` : ''}
          ${locationHtml}
          ${notesHtml}
        </div>
        ${subtasksHtml}
      `;
    }

    const hasSubtasksClass = childSubtasks.length > 0 ? 'has-subtasks' : '';
    const shortBlockClass = height < 75 ? 'is-short-block' : '';
    const overflowAttr = childSubtasks.length > 0 ? `data-overflow-count="${overflowCount}"` : '';
    const notesTooltip = (task.notes && task.notes.trim()) ? `\n📝 ${task.notes.trim().slice(0, 100)}` : '';
    const locTooltip = (task.location && task.location.trim()) ? `\n📍 ${task.location.trim()}` : '';

    return `
      <div class="schedule-block-item cat-${task.context || 'work'} ${rolloverClass} ${eventClass} ${selectedClass} ${liveClass} ${completedClass} ${isCompact ? 'is-compact' : ''} ${hasSubtasksClass} ${shortBlockClass} ${expandedClass} ${narrowColClass} ${overnightClass}" 
           id="block_${task.id}${isContinuation ? '_cont' : ''}"
           data-task-id="${task.id}"
           data-date="${dateStr}"
           data-is-continuation="${isContinuation ? 'true' : 'false'}"
           ${overflowAttr}
           style="--block-height: ${height}px; ${positionStyle}"
           onpointerdown="handleBlockPointerDown(event, '${task.id}', '${dateStr}')"
           ondblclick="event.stopPropagation(); openEditModal('${task.id}')"
           onclick="event.stopPropagation()"
           ondragover="handleBlockDragOver(event, '${task.id}')"
           ondragleave="handleBlockDragLeave(event, '${task.id}')"
           ondrop="handleBlockDrop(event, '${task.id}')"
           title="${isEvent ? '📅 Event: ' : '📋 Task: '}${escapeHtml(task.title)} (${timeRangeStr})${locTooltip}${notesTooltip}">
        ${innerContentHtml}
        <div class="resize-handle" 
             onmousedown="startResize(event, '${task.id}')"
             ontouchstart="startResize(event, '${task.id}')"
             onclick="event.stopPropagation()"
             title="Drag to resize duration"></div>
      </div>
    `;
  }).join('');
}

window.expandedBlockAccordionIds = window.expandedBlockAccordionIds || new Set();

function toggleBlockAccordion(event, taskId) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (!window.expandedBlockAccordionIds) {
    window.expandedBlockAccordionIds = new Set();
  }
  const blockEl = document.getElementById(`block_${taskId}`) || document.getElementById(`block_${taskId}_cont`);
  const isExpanded = window.expandedBlockAccordionIds.has(taskId);
  if (isExpanded) {
    window.expandedBlockAccordionIds.delete(taskId);
    if (blockEl) {
      blockEl.classList.remove('is-expanded');
      const btn = blockEl.querySelector('.subtasks-unfold-btn');
      if (btn) {
        const remaining = parseInt(blockEl.dataset.overflowCount || '1', 10);
        btn.innerHTML = `<span class="unfold-btn-text">+${remaining} autre${remaining > 1 ? 's' : ''}</span><span class="unfold-btn-arrow">▾</span>`;
        btn.title = 'Déplier toutes les sous-tâches';
      }
      const miniBtn = blockEl.querySelector('.subtasks-mini-unfold-btn');
      if (miniBtn) {
        miniBtn.textContent = '▾';
        miniBtn.title = 'Déplier sous-tâches';
      }
    }
  } else {
    window.expandedBlockAccordionIds.add(taskId);
    if (blockEl) {
      blockEl.classList.add('is-expanded');
      const btn = blockEl.querySelector('.subtasks-unfold-btn');
      if (btn) {
        btn.innerHTML = `<span class="unfold-btn-text">Moins</span><span class="unfold-btn-arrow">▴</span>`;
        btn.title = 'Replier les sous-tâches';
      }
      const miniBtn = blockEl.querySelector('.subtasks-mini-unfold-btn');
      if (miniBtn) {
        miniBtn.textContent = '▴';
        miniBtn.title = 'Replier';
      }
    }
  }
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
          <div class="schedule-block-top-actions">
            ${progressPillHtml}
            <button type="button" class="btn-block-quick-add-subtask" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); quickAddSubtaskFromBlock('${task.id}')" title="Ajouter une sous-tâche">➕</button>
            <button type="button" class="btn-task-menu" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); openTaskPopover(event, '${task.id}')" title="Options">⋮</button>
          </div>
        </div>
      </li>
    `;
  }).join('');
}

// SMART SCROLL (1H30 AVANT LE 1ER EVENT OU HEURE ACTUELLE)
function applyDynamicScroll(onlyIfUnscrolled = false) {
  const viewport = document.getElementById('calScrollViewport');
  if (!viewport) return;

  if (onlyIfUnscrolled && viewport.scrollTop > 10) return;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const visibleDates = calculateVisibleDates();
  const visibleDateStrs = new Set(visibleDates.map(d => getLocalDateString(d)));
  const visibleTimedTasks = (window.SpanPlanState.tasks || []).filter(t => visibleDateStrs.has(t.date) && !!t.time);

  let targetMinutes = 8.5 * 60; // 08:30 par défaut

  if (visibleDateStrs.has(TODAY_STR)) {
    targetMinutes = Math.max(0, currentMinutes - 60);
  } else if (visibleTimedTasks.length > 0) {
    let earliestMinutes = 24 * 60;
    visibleTimedTasks.forEach(t => {
      const parts = (t.time || '00:00').split(':');
      const m = parseInt(parts[0], 10) * 60 + (parseInt(parts[1], 10) || 0);
      if (m < earliestMinutes) earliestMinutes = m;
    });
    targetMinutes = Math.max(0, earliestMinutes - 60);
  }

  const scrollPx = Math.max(0, (targetMinutes / 60) * HOUR_HEIGHT);
  viewport.scrollTop = scrollPx;
}

// REDIMENSIONNEMENT INTERACTIF (AVEC GESTION PROPRE DU DÉPASSEMENT NOCTURNE & OVERNIGHT)
let resizingTaskId = null;
let resizeStartY = 0;
let resizeStartDuration = 45;
let resizeIsContinuation = false;
let resizingProposedMinutes = 45;

function startResize(e, taskId) {
  e.preventDefault();
  e.stopPropagation();
  resizingTaskId = taskId;
  
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  resizeStartY = clientY;
  
  const blockEl = e.target.closest('.schedule-block-item') || document.getElementById(`block_${taskId}`) || document.getElementById(`block_${taskId}_cont`);
  resizeIsContinuation = Boolean(blockEl && blockEl.dataset.isContinuation === 'true');

  const task = window.SpanPlanState.tasks.find(t => t.id === taskId);
  resizeStartDuration = task ? (task.duration || 45) : 45;
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
        const height = Math.max(30, (info.duration / 60) * HOUR_HEIGHT);

        const startH = String(Math.floor(itemStartM / 60)).padStart(2, '0');
        const startM = String(itemStartM % 60).padStart(2, '0');
        const endH = String(Math.floor(itemEndM / 60)).padStart(2, '0');
        const endM = String(itemEndM % 60).padStart(2, '0');

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
        ghost.className = `drag-preview-slot cat-${info.task.context || 'work'}`;
        ghost.style.top = `${snappedTop}px`;
        ghost.style.height = `${height}px`;
        ghost.style.left = '4px';
        ghost.style.right = '4px';
        const isEvent = (info.task.type === 'event');
        ghost.innerHTML = `
          <div class="ghost-time-label">${isEvent ? '📅 ' : '⏱ '}${startH}:${startM} – ${endH}:${endM} (${info.duration}m)</div>
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
  document.querySelectorAll('.day-dock.dock-drop-hover, .cal-allday-drop-cell.drag-over').forEach(d => d.classList.remove('dock-drop-hover', 'drag-over'));

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

      let movedCount = 0;
      dragInitialTops.forEach(info => {
        const itemStartM = Math.max(0, Math.min(23 * 60 + 45, info.initialStartMinutes + diffM));
        const startH = String(Math.floor(itemStartM / 60)).padStart(2, '0');
        const startM = String(itemStartM % 60).padStart(2, '0');
        info.task.time = `${startH}:${startM}`;
        info.task.allDay = false;
        info.task.date = targetDateStr || info.task.date;
        info.task.endDate = targetDateStr || info.task.date;
        info.task.isRollover = false;
        const dur = info.task.duration || 45;
        info.task.endTime = getEndTimeFromDuration(info.task.time, dur);
        info.task.updated_at = new Date().toISOString();
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

    openQuickAddPopover(dateStr, clickedTime, e.clientX, e.clientY);
  }
}

// DRAG & DROP HTML5 POUR LE DOCK / BACKLOG / SOUS-TÂCHES
let draggedTaskId = null;
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
    duration: 45,
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

  if (window.draggedSubtaskInfo) {
    handleSubtaskDropToBacklog(e);
    return;
  }

  if (!draggedTaskId) return;

  const task = window.SpanPlanState.tasks.find(t => t.id === draggedTaskId);
  if (task) {
    task.date = null;
    task.endDate = null;
    task.time = '';
    task.allDay = false;
    task.isRollover = false;
    task.updated_at = new Date().toISOString();
    savePlanState();
    if (typeof showToast === 'function') {
      showToast(`Déplacé dans le Backlog : "${task.title}"`, 'info');
    }
  }
  draggedTaskId = null;
}

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

document.addEventListener('click', (e) => {
  if (!e.target.closest('#taskPopoverMenu') && !e.target.closest('.btn-task-menu')) {
    closeTaskPopover();
  }
  if (!e.target.closest('#calendarQuickAddPopover') && !e.target.closest('.schedule-grid-canvas')) {
    closeQuickAddPopover();
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

  // Raccourcis une touche (hors saisie)
  if (!isTyping && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (e.key === '[') {
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

function popoverAction(action) {
  const id = popoverTargetTaskId;
  closeTaskPopover();
  if (!id) return;

  if (action === 'edit') {
    openEditModal(id);
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

let planBacklogActionFilter = 'all';

// Helper de détection intelligente du type d'action (Calls / Mails / Paiements)
function getTaskActionType(task) {
  if (!task) return 'other';
  if (task.actionType && task.actionType !== 'auto') return task.actionType;
  const title = (task.title || '').trim().toLowerCase();
  
  // 1. Tags explicites
  if (/#(call|calls|appel|appels|phone)\b/i.test(title)) return 'call';
  if (/#(mail|mails|email|emails|courriel)\b/i.test(title)) return 'mail';
  if (/#(pay|paiement|paiements|facture|factures|virement|virements)\b/i.test(title)) return 'pay';

  // 2. Mots-clés naturels
  if (/\b(call|calls|appel|appels|appeler|téléphone|téléphoner|coup de fil|rdv|rendez-vous)\b/i.test(title)) {
    return 'call';
  }
  if (/\b(mail|mails|email|emails|e-mail|courriel|newsletter|écrire à|envoyer mail)\b/i.test(title)) {
    return 'mail';
  }
  if (/\b(payer|paiement|paiements|pay|virement|facture|factures|mutuelle|solidaris|poubelle|poubelles|banque|bank)\b/i.test(title)) {
    return 'pay';
  }
  return 'other';
}

let sidebarBacklogAction = 'auto';

function setSidebarBacklogAction(action) {
  sidebarBacklogAction = action || 'auto';
  const iconEl = document.getElementById('sidebarActionTypeIcon');
  const btnEl = document.getElementById('btnSidebarActionTypeSelect');
  const icons = { auto: '⚡', call: '📞', mail: '✉️', pay: '💳', other: '📦' };
  const labels = { auto: 'Auto', call: 'Call', mail: 'Mail', pay: 'Paiement', other: 'Standard' };
  if (iconEl) iconEl.textContent = icons[sidebarBacklogAction] || '⚡';
  if (btnEl) {
    btnEl.className = `btn-sidebar-action-select action-${sidebarBacklogAction}`;
    btnEl.title = `Type d'action : ${labels[sidebarBacklogAction] || sidebarBacklogAction} (Cliquer pour changer : Call, Mail, Pay)`;
  }
  document.querySelectorAll('#sidebarBacklogActionChips .quick-action-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.action === sidebarBacklogAction);
  });
}
window.setSidebarBacklogAction = setSidebarBacklogAction;

function cycleSidebarBacklogAction() {
  const order = ['auto', 'call', 'mail', 'pay'];
  const nextIdx = (order.indexOf(sidebarBacklogAction) + 1) % order.length;
  setSidebarBacklogAction(order[nextIdx]);
  if (typeof showToast === 'function') {
    const labels = { auto: '⚡ Action: Détection auto', call: '📞 Action: Call', mail: '✉️ Action: Mail', pay: '💳 Action: Paiement' };
    showToast(labels[order[nextIdx]] || 'Type d\'action modifié', 'info');
  }
}
window.cycleSidebarBacklogAction = cycleSidebarBacklogAction;

function setPlanTaskAction(taskId, action) {
  const task = (window.SpanPlanState.tasks || []).find(t => t.id === taskId);
  if (!task) return;
  task.actionType = (action === 'auto') ? null : action;
  task.updated_at = new Date().toISOString();
  savePlanState();
  renderCalendar();
  renderBacklogDrawer();
  if (typeof showToast === 'function') {
    const labels = {
      auto: '⚡ Action: Détection auto',
      call: '📞 Action: Call',
      mail: '✉️ Action: Mail',
      pay: '💳 Action: Paiement',
      other: '📦 Action: Standard'
    };
    showToast(labels[action] || 'Action modifiée', 'info');
  }
}
window.setPlanTaskAction = setPlanTaskAction;

function cyclePlanTaskAction(taskId) {
  const task = (window.SpanPlanState.tasks || []).find(t => t.id === taskId);
  if (!task) return;
  const current = task.actionType || 'auto';
  const order = ['auto', 'call', 'mail', 'pay', 'other'];
  const nextIdx = (order.indexOf(current) + 1) % order.length;
  const nextType = order[nextIdx];
  setPlanTaskAction(taskId, nextType);
}
window.cyclePlanTaskAction = cyclePlanTaskAction;

function setPlanBacklogActionFilter(filter) {
  planBacklogActionFilter = filter;
  document.querySelectorAll('.plan-filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  if (['call', 'mail', 'pay'].includes(filter)) {
    setSidebarBacklogAction(filter);
  } else if (filter === 'all') {
    setSidebarBacklogAction('auto');
  }
  renderBacklogDrawer();
}
window.setPlanBacklogActionFilter = setPlanBacklogActionFilter;
window.getTaskActionType = getTaskActionType;

let planHideActionsInAll = localStorage.getItem('span_plan_hide_actions_in_all') !== 'false'; // default true

function updatePlanHideActionsToggleUI() {
  const btnMini = document.getElementById('btnMiniToggleHideActions');
  const btnSidebar = document.getElementById('btnToggleHideActionsPlan');
  const btnDrawer = document.getElementById('btnToggleHideActionsDrawer');
  const badgeSidebar = document.getElementById('planToggleBadgeText');
  const badgeDrawer = document.getElementById('drawerToggleBadgeText');

  [btnMini, btnSidebar, btnDrawer].forEach(btn => {
    if (btn) btn.classList.toggle('active', planHideActionsInAll);
  });
  [badgeSidebar, badgeDrawer].forEach(b => {
    if (b) b.textContent = planHideActionsInAll ? 'ON' : 'OFF';
  });
}
window.updatePlanHideActionsToggleUI = updatePlanHideActionsToggleUI;

function togglePlanHideActionsInAll(forceVal) {
  if (typeof forceVal === 'boolean') {
    planHideActionsInAll = forceVal;
  } else {
    planHideActionsInAll = !planHideActionsInAll;
  }
  localStorage.setItem('span_plan_hide_actions_in_all', planHideActionsInAll ? 'true' : 'false');
  updatePlanHideActionsToggleUI();
  renderBacklogDrawer();
  if (typeof showToast === 'function') {
    showToast(planHideActionsInAll ? 'Actions (Calls/Mails/Pay) masquées dans "Tous"' : 'Actions affichées dans "Tous"', 'info');
  }
}
window.togglePlanHideActionsInAll = togglePlanHideActionsInAll;

// BACKLOG DRAWER & SIDEBAR BACKLOG
function renderBacklogDrawer() {
  updatePlanHideActionsToggleUI();
  const targets = [
    document.getElementById('sidebarBacklogList'),
    document.getElementById('backlogTaskList')
  ].filter(Boolean);

  if (targets.length === 0) return;

  const allBacklogTasks = (window.SpanPlanState.tasks || []).filter(t => {
    const isUnscheduled = !t.date;
    const contextMatch = (currentContextFilter === 'all' || t.context === currentContextFilter);
    const tagMatch = !currentTagFilter || (t.title && t.title.toLowerCase().includes(`#${currentTagFilter.toLowerCase()}`));
    return isUnscheduled && contextMatch && tagMatch;
  });

  // Action counts
  let countCall = 0, countMail = 0, countPay = 0, countOther = 0;
  allBacklogTasks.forEach(t => {
    const at = getTaskActionType(t);
    if (at === 'call') countCall++;
    else if (at === 'mail') countMail++;
    else if (at === 'pay') countPay++;
    else countOther++;
  });

  ['planCountCall', 'drawerCountCall'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = countCall;
  });
  ['planCountMail', 'drawerCountMail'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = countMail;
  });
  ['planCountPay', 'drawerCountPay'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = countPay;
  });

  const elPlanAll = document.querySelector('#sidebarActionFilterPills [data-filter="all"]');
  if (elPlanAll) {
    elPlanAll.innerHTML = `Tous <span class="pill-count">${planHideActionsInAll ? countOther : allBacklogTasks.length}</span>`;
  }
  const elDrawerAll = document.querySelector('#drawerActionFilterPills [data-filter="all"]');
  if (elDrawerAll) {
    elDrawerAll.innerHTML = `Tous <span class="pill-count">${planHideActionsInAll ? countOther : allBacklogTasks.length}</span>`;
  }

  const backlogTasks = allBacklogTasks.filter(t => {
    const act = getTaskActionType(t);
    if (planBacklogActionFilter === 'all') {
      if (planHideActionsInAll) {
        return act === 'other';
      }
      return true;
    }
    return act === planBacklogActionFilter;
  });

  targets.forEach(list => {
    list.innerHTML = '';

    if (backlogTasks.length === 0) {
      if (planBacklogActionFilter === 'all') {
        const totalCategorized = countCall + countMail + countPay;
        if (planHideActionsInAll && totalCategorized > 0) {
          list.innerHTML = `
            <div style="padding: 14px 6px; text-align: center;">
              <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">Aucune tâche standard en attente</div>
              <div style="font-size: 10px; color: var(--text-muted); opacity: 0.85;">${totalCategorized} action(s) masquée(s) de "Tous" :</div>
              <div style="display: flex; gap: 4px; justify-content: center; margin-top: 6px; flex-wrap: wrap;">
                ${countCall > 0 ? `<button type="button" class="plan-filter-pill" onclick="setPlanBacklogActionFilter('call')" style="font-size:10px; padding:2px 6px;">📞 ${countCall} Calls</button>` : ''}
                ${countMail > 0 ? `<button type="button" class="plan-filter-pill" onclick="setPlanBacklogActionFilter('mail')" style="font-size:10px; padding:2px 6px;">✉️ ${countMail} Mails</button>` : ''}
                ${countPay > 0 ? `<button type="button" class="plan-filter-pill" onclick="setPlanBacklogActionFilter('pay')" style="font-size:10px; padding:2px 6px;">💳 ${countPay} Pay</button>` : ''}
              </div>
            </div>
          `;
          return;
        } else {
          list.innerHTML = `<li style="font-size: 11px; color: var(--text-muted); padding: 14px 4px; text-align: center;">No unscheduled tasks</li>`;
          return;
        }
      } else {
        list.innerHTML = `<li style="font-size: 11px; color: var(--text-muted); padding: 14px 4px; text-align: center;">Aucun élément dans le filtre "${planBacklogActionFilter}"</li>`;
        return;
      }
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

      const actionType = getTaskActionType(task);
      let actionTagHtml = '';
      if (actionType === 'call') {
        actionTagHtml = `<span class="plan-action-tag-badge action-call" onclick="event.stopPropagation(); cyclePlanTaskAction('${task.id}')" title="Action: Call (cliquer pour changer)">📞 Call</span>`;
      } else if (actionType === 'mail') {
        actionTagHtml = `<span class="plan-action-tag-badge action-mail" onclick="event.stopPropagation(); cyclePlanTaskAction('${task.id}')" title="Action: Mail (cliquer pour changer)">✉️ Mail</span>`;
      } else if (actionType === 'pay') {
        actionTagHtml = `<span class="plan-action-tag-badge action-pay" onclick="event.stopPropagation(); cyclePlanTaskAction('${task.id}')" title="Action: Paiement (cliquer pour changer)">💳 Pay</span>`;
      } else {
        actionTagHtml = `<span class="plan-action-tag-badge action-none" onclick="event.stopPropagation(); cyclePlanTaskAction('${task.id}')" title="Définir une action (Call, Mail, Pay)">+ Action</span>`;
      }

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
          <span class="task-text ${completedClass}">${renderTitleWithTagsHtml(task.title)}${actionTagHtml}</span>
          <div class="schedule-block-top-actions">
            ${progressPillHtml}
            <button type="button" class="btn-block-quick-add-subtask" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); quickAddSubtaskFromBlock('${task.id}')" title="Ajouter une sous-tâche">➕</button>
            <button type="button" class="btn-backlog-today" onclick="event.stopPropagation(); scheduleTaskDirectly('${task.id}', '${TODAY_STR}')" title="Planifier pour aujourd'hui (${TODAY_STR})">+</button>
            <button type="button" class="btn-task-menu" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); openTaskPopover(event, '${task.id}')" title="Options">⋮</button>
          </div>
        </div>
      `;
      list.appendChild(li);
    });
  });
}

function updateCounters() {
  const allTasks = window.SpanPlanState.tasks || [];
  const laterCount = allTasks.filter(t => !t.date).length;
  ['globalLaterCount', 'drawerLaterCount', 'mobileLaterCount', 'mobileBacklogCount', 'sidebarBacklogCount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = laterCount;
  });

  const countAll = allTasks.length;
  const countWork = allTasks.filter(t => t.context === 'work').length;
  const countLife = allTasks.filter(t => t.context === 'life').length;
  const countFun = allTasks.filter(t => t.context === 'fun').length;

  const elAll = document.getElementById('countAllContext');
  if (elAll) elAll.textContent = countAll;
  const elWork = document.getElementById('countWorkContext');
  if (elWork) elWork.textContent = countWork;
  const elLife = document.getElementById('countLifeContext');
  if (elLife) elLife.textContent = countLife;
  const elFun = document.getElementById('countFunContext');
  if (elFun) elFun.textContent = countFun;
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
      if (Array.isArray(t.subtasks)) {
        t.subtasks.forEach(st => {
          if (st.id) keysToDismiss.push(st.id);
        });
      }
    }
  });
  ids.forEach(id => {
    if (!keysToDismiss.includes(id)) keysToDismiss.push(id);
  });

  addDismissedTaskIds(keysToDismiss);

  // Sync avec le registre de suppression Focus (span_deleted_task_ids)
  try {
    const deletedSet = new Set(JSON.parse(localStorage.getItem('span_deleted_task_ids') || '[]'));
    keysToDismiss.forEach(k => deletedSet.add(String(k)));
    localStorage.setItem('span_deleted_task_ids', JSON.stringify(Array.from(deletedSet)));
  } catch (e) {}

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

  openQuickAddPopover(dateStr, clickedTime, e.clientX, e.clientY);
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

  const actionSelect = document.getElementById('quickActionSelect');
  let chosenAction = (actionSelect && actionSelect.value !== 'auto') ? actionSelect.value : null;

  const newTask = {
    id: 'p_' + Date.now(),
    title: rawText,
    type: extractedType,
    actionType: chosenAction,
    date: targetDate,
    time: extractedTime,
    duration: extractedDuration,
    context: extractedContext,
    completed: false,
    isRollover: false
  };

  window.SpanPlanState.tasks.unshift(newTask);
  if (input) input.value = '';
  if (actionSelect) actionSelect.value = 'auto';
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
    actionType: (sidebarBacklogAction === 'auto') ? null : sidebarBacklogAction,
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

function addSidebarBacklogTask() {
  const input = document.getElementById('sidebarBacklogInput');
  const text = input ? input.value.trim() : '';
  if (!text) return;

  const newTask = {
    id: 'p_' + Date.now(),
    title: text,
    type: 'task',
    actionType: (sidebarBacklogAction === 'auto') ? null : sidebarBacklogAction,
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

let draggedOverSubtaskId = null;

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
let quickAddState = {
  dateStr: TODAY_STR,
  timeStr: '09:00',
  type: 'event',
  context: 'work'
};

let quickAddPopoverAction = 'auto';

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

  // Preview date & horaire
  const [hStr, mStr] = (quickAddState.timeStr || '09:00').split(':');
  const startMin = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
  const endMin = Math.min(23 * 60 + 59, startMin + 45);
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

  const date = quickAddState.dateStr || TODAY_STR;
  const time = quickAddState.timeStr || '09:00';
  const duration = 45;
  const type = quickAddState.type || 'event';
  const context = quickAddState.context || 'work';

  const newItem = {
    id: 'plan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    title: title,
    date: date,
    time: time,
    duration: duration,
    context: context,
    type: type,
    actionType: (quickAddPopoverAction === 'auto') ? null : quickAddPopoverAction,
    completed: false,
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

  const currentDur = parseInt(durInput ? durInput.value : 45, 10) || 45;
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
  if (durEl) durEl.value = 45;
  if (endTimeEl) {
    endTimeEl.value = getEndTimeFromDuration(timeStr || '09:00', 45);
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
  const dur = task.duration || 45;
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

  const allDayCheck = document.getElementById('editTaskAllDay');
  const isAllDay = allDayCheck ? allDayCheck.checked : false;

  const dateVal = document.getElementById('editTaskDate').value || null;
  let endDateVal = document.getElementById('editTaskEndDate').value || null;

  if (isAllDay && !endDateVal) {
    endDateVal = dateVal;
  }

  let timeVal = '';
  let endTimeVal = '';
  let durationVal = 45;

  if (!isAllDay) {
    timeVal = document.getElementById('editTaskTime').value || '';
    endTimeVal = document.getElementById('editTaskEndTime').value || '';
    if (timeVal && endTimeVal) {
      durationVal = getDurationFromTimes(timeVal, endTimeVal);
    } else if (timeVal) {
      durationVal = 45;
      endTimeVal = getEndTimeFromDuration(timeVal, 45);
    }
  }

  const recEl = document.getElementById('editTaskRecurrence');
  const recurrenceVal = recEl ? recEl.value : 'none';

  const locEl = document.getElementById('editTaskLocation');
  const locationVal = locEl ? locEl.value.trim() : '';

  const notesEl = document.getElementById('editTaskNotes');
  const notesVal = notesEl ? notesEl.value.trim() : '';

  if (editingTaskId) {
    const task = window.SpanPlanState.tasks.find(t => t.id === editingTaskId);
    if (task) {
      task.title = title;
      task.type = editingItemType;
      task.allDay = isAllDay;
      task.date = dateVal;
      task.endDate = isAllDay ? endDateVal : dateVal;
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
      showToast(label, 'info');
    }
  } else {
    const nowIso = new Date().toISOString();
    const newTask = {
      id: 'p_' + Date.now(),
      title: title,
      type: editingItemType,
      allDay: isAllDay,
      date: dateVal,
      endDate: isAllDay ? endDateVal : dateVal,
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

// NAVIGATION
function navigateTimeline(direction) {
  const step = isMobileScreen() ? 1 : ((visibleDaysCount === 7 || visibleDaysCount === 5) ? 7 : visibleDaysCount);
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
  num = Math.max(1, parseInt(num, 10) || 7);
  visibleDaysCount = num;
  localStorage.setItem('span_plan_visible_days', num);
  document.querySelectorAll('#daysSelectorGroup .pill-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.days, 10) === num);
  });
  // Pour 1D et 3D, s'assurer que Aujourd'hui est en première colonne
  if (num === 1 || num === 3) {
    currentTimelineOffset = 0;
  }
  renderPlanGrid(true);
  applyDynamicScroll();
}

function setContextFilter(ctx) {
  currentContextFilter = ctx;
  document.querySelectorAll('.context-menu-item, #contextSwitch .context-btn, .sidebar-context-item, .header-context-pill').forEach(btn => {
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
  updateCounters();
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
  // Restaurer l'état collapsed de la sidebar
  const isSidebarCollapsed = localStorage.getItem('span_plan_sidebar_collapsed') === '1';
  const shell = document.getElementById('appShell');
  if (shell && isSidebarCollapsed) {
    shell.classList.add('sidebar-collapsed');
  }

  if (typeof syncFocusTasksToPlanBacklog === 'function') {
    syncFocusTasksToPlanBacklog(false);
  }
  autoRecoverTodayTasks();
  executeAutoRollover();

  const savedDays = parseInt(localStorage.getItem('span_plan_visible_days'), 10);
  if (savedDays) {
    visibleDaysCount = savedDays;
  }
  setVisibleDays(visibleDaysCount);
  setMobileDayView('agenda');
  applyPinState();
  updateMiniCalCollapseUI();
  setSidebarBacklogAction('auto');
  renderPlanGrid();
  renderBacklogDrawer();
  updateCounters();
  renderDateStrip();
  if (typeof renderMiniMonthCalendar === 'function') {
    renderMiniMonthCalendar();
  }

  setTimeout(applyDynamicScroll, 120);

  setInterval(() => {
    if (currentTimelineOffset === 0) {
      renderPlanGrid();
    }
  }, 60000);
});

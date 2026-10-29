window.SpanPlanState = window.SpanPlanState || {};

function getLocalDateString(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

var TODAY_STR = getLocalDateString();
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const YESTERDAY_STR = getLocalDateString(yesterday);

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const TOMORROW_STR = getLocalDateString(tomorrow);

// CYCLE COMPLET 24 HEURES (00:00 - 23:59)
var START_HOUR = 0;
var END_HOUR = 23;
var HOUR_HEIGHT = 64;

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
  if (!startTime) return '09:30';
  const startM = timeToMinutes(startTime);
  const endTotal = startM + (durationMinutes || 30);
  const endM = endTotal % (24 * 60);
  return minutesToTime(endM);
}

function getDurationFromTimes(startTime, endTime) {
  if (!startTime || !endTime) return 30;
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

function extractTaskUrl(task) {
  if (!task) return '';

  // 1. Champs directs
  for (const field of [task.url, task.link]) {
    if (typeof field === 'string' && field.trim()) {
      const u = field.trim();
      return /^https?:\/\//i.test(u) ? u : `https://${u}`;
    }
  }

  // Helper pour extraire un lien d'une chaîne
  function findUrlInString(str, allowDomainWithoutProtocol = false) {
    if (!str || typeof str !== 'string') return '';
    
    // A. URL explicite http:// ou https://
    const httpMatch = str.match(/https?:\/\/[^\s<>"')]+/i);
    if (httpMatch) {
      return httpMatch[0].replace(/[.,;:!?)]+$/, '');
    }

    // B. URL commençant par www.
    const wwwMatch = str.match(/\bwww\.[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/i);
    if (wwwMatch) {
      return `https://${wwwMatch[0].replace(/[.,;:!?)]+$/, '')}`;
    }

    // C. Outils de réunion ou webcasts connus sans http
    const meetingMatch = str.match(/\b([a-zA-Z0-9-]+\.)*(meet\.google\.com|zoom\.us|teams\.microsoft\.com|webex\.com|webcasts\.com)[^\s<>"')]*\b/i);
    if (meetingMatch) {
      return `https://${meetingMatch[0].replace(/[.,;:!?)]+$/, '')}`;
    }

    // D. Tout domaine valide si autorisé (utile pour le champ location type "ibm.webcasts.com/..." ou "notion.so/...")
    if (allowDomainWithoutProtocol) {
      const domainMatch = str.match(/\b([a-zA-Z0-9-]+\.)+(?:com|org|net|io|edu|gov|fr|be|ch|ca|app|dev|me|ai|co)\b(?:\/[^\s<>"')*)\]]*)?/i);
      if (domainMatch) {
        return `https://${domainMatch[0].replace(/[.,;:!?)]+$/, '')}`;
      }
    }

    return '';
  }

  // 2. Recherche prioritaire dans Location (autorise les domaines sans http comme ibm.webcasts.com)
  if (task.location) {
    const locUrl = findUrlInString(task.location, true);
    if (locUrl) return locUrl;
  }

  // 3. Recherche dans Notes / Description
  for (const field of [task.notes, task.description]) {
    if (field) {
      const notesUrl = findUrlInString(field, false);
      if (notesUrl) return notesUrl;
    }
  }

  // 4. Recherche dans le Titre (uniquement URLs explicites)
  if (task.title) {
    const titleUrl = findUrlInString(task.title, false);
    if (titleUrl) return titleUrl;
  }

  return '';
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
    const base = {
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
      duration: typeof t.duration === 'number' ? t.duration : 30,
      context: normalizePlanContext(t.context || t.category),
      completed: !!t.completed,
      isRollover: !!t.isRollover,
      fromFocus: !!t.fromFocus,
      focusId: t.focusId || null,
      subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
      created_at: t.created_at || new Date().toISOString(),
      updated_at: t.updated_at || new Date().toISOString()
    };
    return (typeof SpanCore !== 'undefined' && SpanCore.normalizeTask)
      ? SpanCore.normalizeTask(base)
      : base;
  });
}

// Reactive Store Anchor
window.SpanPlanStore = (typeof SpanCore !== 'undefined' && SpanCore.createStore)
  ? SpanCore.createStore('span_plan_tasks')
  : null;
if (window.SpanPlanStore) {
  window.SpanPlanStore.tasks = window.SpanPlanState.tasks;
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
      const dur = task.duration || 30;
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


var visibleDaysCount = parseInt(localStorage.getItem('span_plan_visible_days')) || 3;
if (visibleDaysCount < 3) visibleDaysCount = 3;

var currentTimelineOffset = 0;
var currentContextFilter = 'all';
var currentTagFilter = null;
var isDrawerPinned = localStorage.getItem('span_plan_drawer_pinned') !== 'false';

// FILTRAGE MULTI-CATÉGORIES VIA DOTS COLORÉS (WORK, LIFE, FUN)
var activeCategoryFilters = {
  work: true,
  life: true,
  fun: true
};
try {
  const savedCats = JSON.parse(localStorage.getItem('span_plan_active_categories'));
  if (savedCats && typeof savedCats === 'object') {
    activeCategoryFilters = {
      work: savedCats.work !== false,
      life: savedCats.life !== false,
      fun: savedCats.fun !== false
    };
  }
} catch (e) {}

function isTaskCategoryVisible(task) {
  if (!task) return true;
  const ctx = normalizePlanContext(task.context || 'work');
  return activeCategoryFilters[ctx] !== false;
}
window.isTaskCategoryVisible = isTaskCategoryVisible;

function toggleCategoryFilter(cat) {
  if (!cat || !['work', 'life', 'fun'].includes(cat)) return;
  activeCategoryFilters[cat] = !activeCategoryFilters[cat];
  localStorage.setItem('span_plan_active_categories', JSON.stringify(activeCategoryFilters));
  updateCategoryToggleVisuals();
  renderPlanGrid(true);
  renderBacklogDrawer();
  updateCounters();
}
window.toggleCategoryFilter = toggleCategoryFilter;

function updateCategoryToggleVisuals() {
  ['work', 'life', 'fun'].forEach(cat => {
    const btn = document.getElementById(`toggleCat${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
    if (btn) {
      const isActive = activeCategoryFilters[cat] !== false;
      btn.classList.toggle('is-active', isActive);
      const catTitle = cat.charAt(0).toUpperCase() + cat.slice(1);
      btn.title = `${catTitle} (${isActive ? 'Visible - cliquer pour masquer' : 'Masqué - cliquer pour afficher'})`;
    }
  });
}
window.updateCategoryToggleVisuals = updateCategoryToggleVisuals;

var editingTaskId = null;
var editingContext = 'work';
var editingItemType = 'task';
var editingPlanActionType = 'auto';
var popoverTargetTaskId = null;

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

      // Si toutes les sous-tâches sont faites, la tâche est complétée et reste dans l'historique
      if (unfinishedSubtasks.length === 0) {
        if (!task.completed) {
          task.completed = true;
          task.updated_at = new Date().toISOString();
          hasChanges = true;
        }
        return;
      }

      // Si aucune sous-tâche n'a été réalisée :
      if (completedSubtasks.length === 0) {
        if (task.type === 'event') {
          // Un événement passé reste sur le calendrier pour l'historique (sans sous-tâches)
          task.subtasks = [];
          task.updated_at = new Date().toISOString();
          modifiedParents.push(task);

          // Le bloc est recréé dans le Backlog avec toutes ses sous-tâches restantes groupées ensemble
          recreatedBacklogBlocks.push({
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
          });
          hasChanges = true;
        } else {
          // Bloc de tâches : aucune faite, le bloc entier passe au Backlog avec toutes ses sous-tâches groupées
          task.date = null;
          task.time = '';
          task.endDate = null;
          task.isRollover = false;
          task.completed = false;
          task.updated_at = new Date().toISOString();
          hasChanges = true;
          modifiedParents.push(task);
        }
        return;
      }

      // Si CERTAINES sous-tâches ont été faites et d'AUTRES non :
      // 1. Le bloc d'origine reste sur sa date passée avec les sous-tâches faites (historique préservé)
      task.subtasks = completedSubtasks;
      task.completed = true;
      task.updated_at = new Date().toISOString();
      modifiedParents.push(task);
      hasChanges = true;

      // 2. Un NOUVEAU bloc commun est recréé dans le Backlog, contenant TOUTES les sous-tâches restantes ensemble
      recreatedBacklogBlocks.push({
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
      });
      return;
    }

    // Tâche ordinaire seule non complétée -> Déplacée dans le Backlog
    if (task.type !== 'event' && !task.completed) {
      task.date = null;
      task.time = '';
      task.endDate = null;
      task.isRollover = false;
      task.updated_at = new Date().toISOString();
      hasChanges = true;
    }
  });

  // Insérer les blocs recréés au début du Backlog
  if (recreatedBacklogBlocks.length > 0) {
    recreatedBacklogBlocks.forEach(newBlock => {
      allTasks.unshift(newBlock);
      if (typeof syncSubtasksToFocus === 'function') {
        syncSubtasksToFocus(newBlock);
      }
    });
  }

  // Mettre à jour Focus pour les parents modifiés
  if (modifiedParents.length > 0 && typeof syncSubtasksToFocus === 'function') {
    modifiedParents.forEach(p => syncSubtasksToFocus(p));
  }

  if (hasChanges) {
    savePlanState();
    renderPlanGrid();
    renderBacklogDrawer();
    if (typeof showToast === 'function' && recreatedBacklogBlocks.length > 0) {
      showToast(`${recreatedBacklogBlocks.length} bloc${recreatedBacklogBlocks.length > 1 ? 's' : ''} recréé${recreatedBacklogBlocks.length > 1 ? 's' : ''} dans le Backlog avec les tâches restantes`, 'info');
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
  if (window.SpanPlanStore) {
    window.SpanPlanStore.tasks = window.SpanPlanState.tasks;
    window.SpanPlanStore.save();
  } else {
    localStorage.setItem('span_plan_tasks', JSON.stringify(window.SpanPlanState.tasks));
  }
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



var planBacklogActionFilter = 'all';

// Helper de détection intelligente du type d'action (Calls / Mails / Paiements / Contenu)
function getTaskActionType(task) {
  if (!task) return 'other';
  if (task.actionType && task.actionType !== 'auto') return task.actionType;
  const title = (task.title || '').trim().toLowerCase();
  
  // 1. Tags explicites
  if (/#(call|calls|appel|appels|phone)\b/i.test(title)) return 'call';
  if (/#(mail|mails|email|emails|courriel)\b/i.test(title)) return 'mail';
  if (/#(pay|paiement|paiements|facture|factures|virement|virements)\b/i.test(title)) return 'pay';
  if (/#(content|contenu|media|video|film|movie)\b/i.test(title)) return 'content';

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
  if (/\b(film|films|movie|movies|série|series|séries|vidéo|videos|vidéos|video|watch|regarder|voir|tiktok|tiktoks|youtube|yt|article|articles|livre|livres|book|books|lire|read|podcast|podcasts|écouter|stream)\b/i.test(title)) {
    return 'content';
  }
  return 'other';
}

var sidebarBacklogAction = 'auto';

function setSidebarBacklogAction(action) {
  sidebarBacklogAction = action || 'auto';
  const iconEl = document.getElementById('sidebarActionTypeIcon');
  const btnEl = document.getElementById('btnSidebarActionTypeSelect');
  const icons = { auto: '⚡', call: '📞', mail: '✉️', pay: '💳', content: '🎬', other: '📦' };
  const labels = { auto: 'Auto', call: 'Call', mail: 'Mail', pay: 'Paiement', content: 'Contenu', other: 'Standard' };
  if (iconEl) iconEl.textContent = icons[sidebarBacklogAction] || '⚡';
  if (btnEl) {
    btnEl.className = `btn-sidebar-action-select action-${sidebarBacklogAction}`;
    btnEl.title = `Type d'action : ${labels[sidebarBacklogAction] || sidebarBacklogAction} (Cliquer pour changer : Call, Mail, Pay, Contenu)`;
  }
  document.querySelectorAll('#sidebarBacklogActionChips .quick-action-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.action === sidebarBacklogAction);
  });
}
window.setSidebarBacklogAction = setSidebarBacklogAction;

function cycleSidebarBacklogAction() {
  const order = ['auto', 'call', 'mail', 'pay', 'content'];
  const nextIdx = (order.indexOf(sidebarBacklogAction) + 1) % order.length;
  setSidebarBacklogAction(order[nextIdx]);
  if (typeof showToast === 'function') {
    const labels = { auto: '⚡ Action: Détection auto', call: '📞 Action: Call', mail: '✉️ Action: Mail', pay: '💳 Action: Paiement', content: '🎬 Action: Contenu' };
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
      content: '🎬 Action: Contenu',
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
  const order = ['auto', 'call', 'mail', 'pay', 'content', 'other'];
  const nextIdx = (order.indexOf(current) + 1) % order.length;
  const nextType = order[nextIdx];
  setPlanTaskAction(taskId, nextType);
}
window.cyclePlanTaskAction = cyclePlanTaskAction;

function setPlanBacklogActionFilter(filter) {
  planBacklogActionFilter = filter;
  document.querySelectorAll('.plan-filter-pill').forEach(btn => {
    const isActive = btn.dataset.filter === filter;
    btn.classList.toggle('active', isActive);
    if (isActive && btn.scrollIntoView) {
      try {
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      } catch (_) {}
    }
  });
  if (['call', 'mail', 'pay', 'content'].includes(filter)) {
    setSidebarBacklogAction(filter);
  } else if (filter === 'all') {
    setSidebarBacklogAction('auto');
  }
  renderBacklogDrawer();
}
window.setPlanBacklogActionFilter = setPlanBacklogActionFilter;
window.getTaskActionType = getTaskActionType;

var planHideActionsInAll = localStorage.getItem('span_plan_hide_actions_in_all') !== 'false'; // default true

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
  if (typeof setupBacklogSwipe === 'function') {
    setupBacklogSwipe();
  }
  const targets = [
    document.getElementById('sidebarBacklogList'),
    document.getElementById('backlogTaskList')
  ].filter(Boolean);

  if (targets.length === 0) return;

  const allBacklogTasks = (window.SpanPlanState.tasks || []).filter(t => {
    const isUnscheduled = !t.date;
    const contextMatch = isTaskCategoryVisible(t);
    const tagMatch = !currentTagFilter || (t.title && t.title.toLowerCase().includes(`#${currentTagFilter.toLowerCase()}`));
    return isUnscheduled && contextMatch && tagMatch;
  });

  // Action counts
  let countCall = 0, countMail = 0, countPay = 0, countContent = 0, countOther = 0;
  allBacklogTasks.forEach(t => {
    const at = getTaskActionType(t);
    if (at === 'call') countCall++;
    else if (at === 'mail') countMail++;
    else if (at === 'pay') countPay++;
    else if (at === 'content') countContent++;
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
  ['planCountContent', 'drawerCountContent'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = countContent;
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
        const totalCategorized = countCall + countMail + countPay + countContent;
        if (planHideActionsInAll && totalCategorized > 0) {
          list.innerHTML = `
            <div style="padding: 14px 6px; text-align: center;">
              <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">Aucune tâche standard en attente</div>
              <div style="font-size: 10px; color: var(--text-muted); opacity: 0.85;">${totalCategorized} action(s) masquée(s) de "Tous" :</div>
              <div style="display: flex; gap: 4px; justify-content: center; margin-top: 6px; flex-wrap: wrap;">
                ${countCall > 0 ? `<button type="button" class="plan-filter-pill" onclick="setPlanBacklogActionFilter('call')" style="font-size:10px; padding:2px 6px;">📞 ${countCall} Calls</button>` : ''}
                ${countMail > 0 ? `<button type="button" class="plan-filter-pill" onclick="setPlanBacklogActionFilter('mail')" style="font-size:10px; padding:2px 6px;">✉️ ${countMail} Mails</button>` : ''}
                ${countPay > 0 ? `<button type="button" class="plan-filter-pill" onclick="setPlanBacklogActionFilter('pay')" style="font-size:10px; padding:2px 6px;">💳 ${countPay} Pay</button>` : ''}
                ${countContent > 0 ? `<button type="button" class="plan-filter-pill" onclick="setPlanBacklogActionFilter('content')" style="font-size:10px; padding:2px 6px;">🎬 ${countContent} Contenu</button>` : ''}
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
      } else if (actionType === 'content') {
        actionTagHtml = `<span class="plan-action-tag-badge action-content" onclick="event.stopPropagation(); cyclePlanTaskAction('${task.id}')" title="Action: Contenu (cliquer pour changer)">🎬 Contenu</span>`;
      } else {
        actionTagHtml = `<span class="plan-action-tag-badge action-none" onclick="event.stopPropagation(); cyclePlanTaskAction('${task.id}')" title="Définir une action (Call, Mail, Pay, Contenu)">+ Action</span>`;
      }

      const li = document.createElement('li');
      const importantClass = task.important ? 'is-important' : '';
      const backlogUrl = extractTaskUrl(task);
      const backlogLinkHtml = backlogUrl ? `
        <a href="${backlogUrl}" target="_blank" rel="noopener noreferrer" 
           class="task-row-link-btn" 
           onpointerdown="event.stopPropagation()" 
           onclick="event.stopPropagation()" 
           title="Ouvrir le lien web : ${escapeHtml(backlogUrl)}">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
        </a>
      ` : '';
      li.className = `task-item cat-${task.context || 'work'} ${isEvent ? 'is-event' : ''} ${completedClass} ${isSelected ? 'is-selected' : ''} ${importantClass}`;
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
          ${backlogLinkHtml}
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

  const hasSubtasks = Array.isArray(task.subtasks) && task.subtasks.length > 0;
  if (hasSubtasks) {
    const completedSubtasks = task.subtasks.filter(s => !!s.completed);
    const unfinishedSubtasks = task.subtasks.filter(s => !s.completed);

    // Si certaines sous-tâches sont faites et d'autres non : scinder pour conserver l'historique sur le jour
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
      renderPlanGrid();
      renderBacklogDrawer();
      return;
    }
  }

  task.date = null;
  task.time = '';
  task.endDate = null;
  task.isRollover = false;
  task.updated_at = new Date().toISOString();
  savePlanState();
  renderPlanGrid();
  renderBacklogDrawer();
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
  // Fermer tout popover existant
  closeQuickAddPopover();

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

  e.stopPropagation();
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

  // Détection de la durée (ex: 15m, 30m, 45m, 1h, 1h30, 2h)
  let extractedDuration = 30;
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

  // Reconnaissance naturelle de l'importance (! ou #important)
  let isImportant = false;
  if (rawText.endsWith('!') || /\s!($|\s)/.test(rawText) || /#important\b/i.test(rawText)) {
    isImportant = true;
    if (rawText.endsWith('!')) rawText = rawText.slice(0, -1).trim();
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
    important: isImportant,
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

  let isImportant = false;
  let cleanText = text;
  if (cleanText.endsWith('!') || /\s!($|\s)/.test(cleanText) || /#important\b/i.test(cleanText)) {
    isImportant = true;
    if (cleanText.endsWith('!')) cleanText = cleanText.slice(0, -1).trim();
  }

  const newTask = {
    id: 'p_' + Date.now(),
    title: cleanText,
    type: 'task',
    actionType: (sidebarBacklogAction === 'auto') ? null : sidebarBacklogAction,
    date: null,
    time: '',
    duration: 30,
    context: currentContextFilter === 'all' ? 'work' : normalizePlanContext(currentContextFilter),
    completed: false,
    important: isImportant,
    isRollover: false
  };

  window.SpanPlanState.tasks.unshift(newTask);
  if (input) input.value = '';
  savePlanState();
  if (typeof showToast === 'function') {
    showToast(`Added to Backlog: "${newTask.title}"${isImportant ? ' !' : ''}`, 'info');
  }
}

function addSidebarBacklogTask() {
  const input = document.getElementById('sidebarBacklogInput');
  const text = input ? input.value.trim() : '';
  if (!text) return;

  let isImportant = false;
  let cleanText = text;
  if (cleanText.endsWith('!') || /\s!($|\s)/.test(cleanText) || /#important\b/i.test(cleanText)) {
    isImportant = true;
    if (cleanText.endsWith('!')) cleanText = cleanText.slice(0, -1).trim();
  }

  const newTask = {
    id: 'p_' + Date.now(),
    title: cleanText,
    type: 'task',
    actionType: (sidebarBacklogAction === 'auto') ? null : sidebarBacklogAction,
    date: null,
    time: '',
    duration: 30,
    context: currentContextFilter === 'all' ? 'work' : normalizePlanContext(currentContextFilter),
    completed: false,
    important: isImportant,
    isRollover: false
  };

  window.SpanPlanState.tasks.unshift(newTask);
  if (input) input.value = '';
  savePlanState();
  if (typeof showToast === 'function') {
    showToast(`Added to Backlog: "${newTask.title}"`, 'info');
  }
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
  num = parseInt(num, 10) || 7;
  if (![1, 3, 5, 7].includes(num)) {
    num = 7;
  }
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
var currentMobileDayView = 'agenda'; // 'agenda' | 'todo' | 'backlog'

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

// GESTION UNIVERSELLE DU SWIPE (CALENDRIER, BACKLOG & TRACKPAD)
const BACKLOG_FILTER_CATEGORIES = ['all', 'call', 'mail', 'pay', 'content'];

function isEventInBacklog(e) {
  const path = e.composedPath ? e.composedPath() : [];
  // 1. Mobile Drawer ou vue mobile backlog
  if (path.some(el => el.id === 'backlogDrawer' || (el.classList && el.classList.contains('backlog-drawer')))) {
    return true;
  }
  // 2. Sidebar Backlog section ou n'importe où dans la sidebar (hors mini calendrier)
  const inSidebar = path.some(el => el.id === 'appSidebar' || el.id === 'sidebarBacklogSection' || (el.classList && (el.classList.contains('app-sidebar') || el.classList.contains('sidebar-backlog-section'))));
  const inMiniCal = path.some(el => el.id === 'miniCalendarWidget' || (el.classList && el.classList.contains('mini-calendar-widget')));
  if (inSidebar && !inMiniCal) {
    return true;
  }
  // 3. Fallback target.closest
  if (e.target && e.target.closest) {
    if (e.target.closest('#backlogDrawer') || e.target.closest('#sidebarBacklogSection') || e.target.closest('.sidebar-backlog-section') || e.target.closest('.sidebar-backlog-scroll')) {
      return true;
    }
    if (e.target.closest('#appSidebar') && !e.target.closest('#miniCalendarWidget')) {
      return true;
    }
  }
  return false;
}

function isEventInMiniCal(e) {
  const path = e.composedPath ? e.composedPath() : [];
  if (path.some(el => el.id === 'miniCalendarWidget' || (el.classList && el.classList.contains('mini-calendar-widget')))) {
    return true;
  }
  if (e.target && e.target.closest) {
    return !!e.target.closest('#miniCalendarWidget');
  }
  return false;
}

function cycleBacklogCategory(direction) {
  const curIdx = BACKLOG_FILTER_CATEGORIES.indexOf(planBacklogActionFilter);
  const safeIdx = curIdx === -1 ? 0 : curIdx;
  let nextIdx = safeIdx + direction;
  if (nextIdx < 0) nextIdx = BACKLOG_FILTER_CATEGORIES.length - 1;
  if (nextIdx >= BACKLOG_FILTER_CATEGORIES.length) nextIdx = 0;

  const nextCat = BACKLOG_FILTER_CATEGORIES[nextIdx];
  setPlanBacklogActionFilter(nextCat);

  // Animation fluide de transition de liste
  const lists = document.querySelectorAll('.sidebar-task-list, .drawer-list');
  lists.forEach(l => {
    l.classList.remove('anim-fade');
    void l.offsetWidth; // trigger reflow
    l.classList.add('anim-fade');
  });

  const labels = {
    all: 'Tous',
    call: '📞 Calls',
    mail: '✉️ Mails',
    pay: '💳 Paiements',
    content: '🎬 Contenu'
  };
  if (typeof showToast === 'function') {
    showToast(`Backlog : ${labels[nextCat] || nextCat}`, 'info', 1100);
  }
}
window.cycleBacklogCategory = cycleBacklogCategory;

// ÉCOUTEURS DIRECTS SUR LE CONTENEUR BACKLOG (SIDEBAR & DRAWER)
function setupBacklogSwipe() {
  const containers = [
    document.getElementById('sidebarBacklogSection'),
    document.querySelector('.sidebar-backlog-section'),
    document.getElementById('backlogDrawer')
  ].filter(Boolean);

  containers.forEach(container => {
    if (container._backlogSwipeReady) return;
    container._backlogSwipeReady = true;

    // Trackpad Wheel direct
    let accumulatedX = 0;
    let wheelTimer = null;
    let isLocked = false;
    let lastTime = 0;

    container.addEventListener('wheel', (e) => {
      if (document.body.classList.contains('is-card-dragging')) return;

      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.1 && Math.abs(e.deltaX) > 5) {
        e.stopPropagation();

        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => {
          isLocked = false;
          accumulatedX = 0;
        }, 180);

        const now = Date.now();
        if (isLocked || now - lastTime < 380) return;

        accumulatedX += e.deltaX;
        if (Math.abs(accumulatedX) >= 30) {
          isLocked = true;
          lastTime = now;
          const dir = accumulatedX > 0 ? 1 : -1;
          accumulatedX = 0;
          cycleBacklogCategory(dir);
        }
      } else {
        if (!isLocked && Math.abs(e.deltaY) > Math.abs(e.deltaX) * 2) {
          accumulatedX = 0;
        }
      }
    }, { passive: true });

    // Touch direct
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let lastTouchTime = 0;

    container.addEventListener('touchstart', (e) => {
      if (document.body.classList.contains('is-card-dragging')) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startTime = Date.now();
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
      if (!startX) return;
      const t = e.changedTouches[0];
      const diffX = t.clientX - startX;
      const diffY = t.clientY - startY;
      const elapsed = Date.now() - startTime;
      startX = 0;
      startY = 0;

      const now = Date.now();
      if (now - lastTouchTime < 320) return;

      if (Math.abs(diffX) > 30 && Math.abs(diffX) > Math.abs(diffY) * 1.15 && elapsed < 650) {
        e.stopPropagation();
        lastTouchTime = now;
        cycleBacklogCategory(diffX < 0 ? 1 : -1);
      }
    }, { passive: true });
  });
}
window.setupBacklogSwipe = setupBacklogSwipe;

// SWIPE TACTILE GLOBAL (Écran tactile / Mobile / Tablette)
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let touchTargetIsBacklog = false;
let lastTouchNavTime = 0;

window.addEventListener('touchstart', (e) => {
  if (document.body.classList.contains('is-card-dragging')) return;
  if (e.target.closest('.modal-card') || isEventInMiniCal(e)) return;

  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  touchStartTime = Date.now();
  touchTargetIsBacklog = isEventInBacklog(e);
}, { passive: true });

window.addEventListener('touchend', (e) => {
  if (!touchStartX) return;
  const touch = e.changedTouches[0];
  const diffX = touch.clientX - touchStartX;
  const diffY = touch.clientY - touchStartY;
  const elapsed = Date.now() - touchStartTime;
  const wasBacklog = touchTargetIsBacklog;

  touchStartX = 0;
  touchStartY = 0;
  touchTargetIsBacklog = false;

  const now = Date.now();
  if (now - lastTouchNavTime < 350) return; // Anti-rebond

  const threshold = wasBacklog ? 30 : 50;
  if (Math.abs(diffX) > threshold && Math.abs(diffX) > Math.abs(diffY) * 1.2 && elapsed < 650) {
    lastTouchNavTime = now;
    if (wasBacklog) {
      cycleBacklogCategory(diffX < 0 ? 1 : -1);
    } else {
      if (diffX < 0) {
        navigateTimeline(1); // Swipe gauche -> période suivante
      } else {
        navigateTimeline(-1); // Swipe droite -> période précédente
      }
    }
  }
}, { passive: true });

// SWIPE / DÉFILEMENT AU TRACKPAD GLOBAL (Mac & PC avec verrouillage d'inertie)
let lastWheelNavTime = 0;
let accumulatedWheelX = 0;
let wheelInertiaTimer = null;
let isWheelNavLocked = false;

window.addEventListener('wheel', (e) => {
  if (document.body.classList.contains('is-card-dragging')) return;
  if (e.target.closest('.modal-card') || isEventInMiniCal(e)) return;

  const isBacklog = isEventInBacklog(e);

  // Défilement horizontal
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.1 && Math.abs(e.deltaX) > 5) {
    clearTimeout(wheelInertiaTimer);
    wheelInertiaTimer = setTimeout(() => {
      isWheelNavLocked = false;
      accumulatedWheelX = 0;
    }, 180);

    const now = Date.now();
    const minCooldown = isBacklog ? 380 : 500;
    if (isWheelNavLocked || now - lastWheelNavTime < minCooldown) {
      return;
    }

    accumulatedWheelX += e.deltaX;
    const triggerThreshold = isBacklog ? 30 : 50;

    if (Math.abs(accumulatedWheelX) >= triggerThreshold) {
      isWheelNavLocked = true;
      lastWheelNavTime = now;
      const direction = accumulatedWheelX > 0 ? 1 : -1;
      accumulatedWheelX = 0;

      if (isBacklog) {
        cycleBacklogCategory(direction);
      } else {
        navigateTimeline(direction);
      }
    }
  } else {
    if (!isWheelNavLocked && Math.abs(e.deltaY) > Math.abs(e.deltaX) * 2) {
      accumulatedWheelX = 0;
    }
  }
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
  updateCategoryToggleVisuals();
  renderPlanGrid();
  renderBacklogDrawer();
  updateCounters();
  renderDateStrip();
  if (typeof renderMiniMonthCalendar === 'function') {
    renderMiniMonthCalendar();
  }

  setTimeout(applyDynamicScroll, 120);

  // Smooth, high-performance timeline marker update (zero DOM destruction)
  function updateNowTimelinePosition() {
    const now = new Date();
    const currentTodayStr = (typeof getLocalDateString === 'function') ? getLocalDateString(now) : TODAY_STR;
    
    // If midnight has passed, perform a clean full calendar day-roll
    if (currentTodayStr !== TODAY_STR) {
      if (typeof refreshCalendarDayRoll === 'function') {
        refreshCalendarDayRoll();
      } else {
        renderPlanGrid();
      }
      return;
    }

    // Reposition red marker smoothly without tearing down the calendar DOM
    if (currentTimelineOffset === 0) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = START_HOUR * 60;
      const endMinutes = (END_HOUR + 1) * 60;

      if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
        const top = ((currentMinutes - startMinutes) / 60) * HOUR_HEIGHT;
        const marker = document.querySelector('.schedule-grid-canvas .now-timeline-marker');
        if (marker) {
          marker.style.top = `${top}px`;
        } else {
          const todayCanvas = document.getElementById(`canvas_${TODAY_STR}`);
          if (todayCanvas && !todayCanvas.querySelector('.now-timeline-marker')) {
            const markerEl = document.createElement('div');
            markerEl.className = 'now-timeline-marker';
            markerEl.style.top = `${top}px`;
            markerEl.innerHTML = '<span class="now-dot"></span>';
            todayCanvas.appendChild(markerEl);
          }
        }

        // Smoothly update live remaining minutes in active blocks without re-rendering
        document.querySelectorAll('.schedule-block-item.is-live-now').forEach(block => {
          const remEl = block.querySelector('.live-meta-remaining');
          const taskId = block.getAttribute('data-task-id');
          if (remEl && taskId) {
            const task = (window.SpanPlanState.tasks || []).find(t => String(t.id) === String(taskId));
            if (task && task.time && task.duration) {
              const startM = (typeof timeToMinutes === 'function') ? timeToMinutes(task.time) : 0;
              const rem = Math.max(0, (startM + parseInt(task.duration)) - currentMinutes);
              remEl.textContent = `${rem}m`;
            }
          }
        });
      }
    }
  }

  setInterval(updateNowTimelinePosition, 30000);
});

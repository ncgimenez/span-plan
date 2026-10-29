// Thème & Préférences globales
function updateThemeUI(theme) {
  const isLight = (theme === 'light');
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) toggleBtn.textContent = isLight ? 'Light' : 'Dark';
  
  const headerBtn = document.getElementById('headerThemeToggleBtn');
  if (headerBtn) {
    headerBtn.innerHTML = isLight ? '🌙' : '☀️';
    headerBtn.title = isLight ? 'Passer en mode sombre' : 'Passer en mode clair (style portfolio)';
  }

  const sidebarBtn = document.getElementById('sidebarThemeToggleBtn');
  if (sidebarBtn) {
    sidebarBtn.innerHTML = `<span>${isLight ? '🌙' : '☀️'}</span>`;
    sidebarBtn.title = isLight ? 'Passer en mode sombre' : 'Passer en mode clair (style portfolio)';
  }

  const meta = document.getElementById('themeMetaColor');
  if (meta) meta.setAttribute('content', isLight ? '#f7f5f0' : '#0d0d0f');
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('span_theme', next);
  
  updateThemeUI(next);
  showToast(next === 'light' ? 'Mode clair activé (papier crème)' : 'Mode sombre activé');
}

function switchSettingsTab(tabName) {
  if (!tabName) tabName = 'sync';
  const tabs = document.querySelectorAll('#settingsNavTabs .settings-tab-btn');
  tabs.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });

  const panes = document.querySelectorAll('.settings-page-pane');
  panes.forEach(pane => {
    pane.classList.toggle('active', pane.getAttribute('data-tab') === tabName);
  });
}

function openSettingsModal(defaultTab = 'sync') {
  const modal = document.getElementById('settingsModalOverlay');
  if (modal) {
    modal.style.display = 'flex';
    switchSettingsTab(defaultTab);
    if (typeof updateSyncKeyDisplay === 'function') {
      updateSyncKeyDisplay();
    }
    if (typeof SpanSecurity !== 'undefined' && SpanSecurity.updateSecurityUI) {
      SpanSecurity.updateSecurityUI();
    }
  }
}

function closeSettingsModal() {
  const modal = document.getElementById('settingsModalOverlay');
  if (modal) modal.style.display = 'none';
}

function goToFocusApp() {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const syncKey = (typeof SYNC_USER_ID !== 'undefined' && SYNC_USER_ID) || localStorage.getItem('span_sync_user') || '';
  const syncQuery = syncKey ? `?sync=${encodeURIComponent(syncKey)}` : '';
  if (isLocal) {
    window.location.href = `http://${window.location.hostname}:8080/${syncQuery}`;
  } else if (window.location.hostname.includes('github.io')) {
    window.location.href = `https://ncgimenez.github.io/span-focus/${syncQuery}`;
  } else {
    window.location.href = `/span-focus/${syncQuery}`;
  }
}
window.goToFocusApp = goToFocusApp;


function exportData() {
  const tasks = (window.SpanPlanState && window.SpanPlanState.tasks) || [];
  let focusTasks = [];
  try {
    focusTasks = JSON.parse(localStorage.getItem('span_tasks') || '[]');
  } catch (_) {}

  const settings = {
    theme: localStorage.getItem('span_theme') || 'dark',
    activeCategories: localStorage.getItem('span_plan_active_categories') || null,
    visibleDays: localStorage.getItem('span_plan_visible_days') || null,
    hideActionsInAll: localStorage.getItem('span_plan_hide_actions_in_all') || null
  };

  const archive = (typeof SpanCore !== 'undefined' && SpanCore.createBackupArchive)
    ? SpanCore.createBackupArchive(tasks, focusTasks, settings)
    : { app: 'span-plan', version: 2, tasks: tasks, focusTasks: focusTasks };

  const exportBlob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(exportBlob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = (typeof getLocalDateString === 'function') ? getLocalDateString() : new Date().toISOString().slice(0, 10);
  a.download = `span-plan-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (typeof showToast === 'function') {
    showToast(`Sauvegarde intégrale exportée (${tasks.length} tâches) !`, 'success');
  }
}
window.exportData = exportData;

function exportCsvFile() {
  const tasks = (window.SpanPlanState && window.SpanPlanState.tasks) || [];
  if (tasks.length === 0) {
    if (typeof showToast === 'function') showToast("Aucune tâche à exporter.", 'info');
    return;
  }

  const csvContent = (typeof SpanCore !== 'undefined' && SpanCore.tasksToCsv)
    ? SpanCore.tasksToCsv(tasks)
    : '';

  const exportBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(exportBlob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = (typeof getLocalDateString === 'function') ? getLocalDateString() : new Date().toISOString().slice(0, 10);
  a.download = `span-plan-tableur-${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (typeof showToast === 'function') {
    showToast(`Fichier tableur CSV exporté (${tasks.length} tâches) !`, 'success');
  }
}
window.exportCsvFile = exportCsvFile;

function exportIcsFile(category = 'all') {
  const allTasks = (window.SpanPlanState && window.SpanPlanState.tasks) || [];
  
  // Exporter STRICTEMENT les événements réels (type === 'event')
  const scheduledTasks = allTasks.filter(t => {
    if (!t || !t.date) return false;
    if (t.type !== 'event') return false; // Strictly events only (Option A)
    if (!t.allDay && !t.time) return false;
    if (category !== 'all' && (t.context || 'work').toLowerCase() !== category.toLowerCase()) {
      return false;
    }
    return true;
  });

  if (scheduledTasks.length === 0) {
    const label = category === 'all' ? 'scheduled events (📅)' : `${category} scheduled events (📅)`;
    showToast(`No ${label} found to export.`, 'info');
    return;
  }

  function formatIcsDateTime(dateStr, timeStr) {
    const [year, month, day] = dateStr.split('-');
    const [hours, minutes] = (timeStr || '09:00').split(':');
    return `${year}${month}${day}T${hours.padStart(2, '0')}${minutes.padStart(2, '0')}00`;
  }

  function calculateIcsEndDateTime(dateStr, timeStr, durationMinutes) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = (timeStr || '09:00').split(':').map(Number);
    
    const startDate = new Date(year, month - 1, day, hours, minutes, 0);
    const endDate = new Date(startDate.getTime() + (durationMinutes || 30) * 60 * 1000);
    
    const y = endDate.getFullYear();
    const m = String(endDate.getMonth() + 1).padStart(2, '0');
    const d = String(endDate.getDate()).padStart(2, '0');
    const h = String(endDate.getHours()).padStart(2, '0');
    const min = String(endDate.getMinutes()).padStart(2, '0');
    return `${y}${m}${d}T${h}${min}00`;
  }

  function formatIcsAllDayDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${year}${month}${day}`;
  }

  function calculateIcsAllDayEndExclusive(startDateStr, endDateStr) {
    // Dans RFC 5545, DTEND pour un événement ALL-DAY est exclusif (le jour d'après la fin)
    const lastDateStr = endDateStr || startDateStr;
    const [y, m, d] = lastDateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + 1);
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  function escapeIcsText(str) {
    if (!str) return '';
    return str
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const calName = category === 'all' ? 'Span Plan' : `Span ${category.charAt(0).toUpperCase() + category.slice(1)}`;

  let icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Span Suite//Span Plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calName}`,
    'X-WR-CALDESC:Time-blocked schedule from Span Plan'
  ];

  if (category === 'work') {
    icsLines.push('X-APPLE-CALENDAR-COLOR:#818cf8');
    icsLines.push('COLOR:#818cf8');
  } else if (category === 'life') {
    icsLines.push('X-APPLE-CALENDAR-COLOR:#10b981');
    icsLines.push('COLOR:#10b981');
  } else if (category === 'fun') {
    icsLines.push('X-APPLE-CALENDAR-COLOR:#fb7185');
    icsLines.push('COLOR:#fb7185');
  }

  scheduledTasks.forEach(task => {
    const context = (task.context || 'work').toLowerCase();
    
    // Pastille de couleur discrète et élégante
    let colorDot = '🟣';
    if (context === 'life') colorDot = '🟢';
    else if (context === 'fun') colorDot = '🔴';

    const cleanTitle = (task.title || 'Untitled task').trim();
    const summary = `${colorDot} ${cleanTitle}`;
    const uid = `${task.id || ('task_' + Math.random().toString(36).slice(2))}@spanplan.app`;
    const categoryName = context.charAt(0).toUpperCase() + context.slice(1);

    // Construction de la description riche (Notes + Checklist + Contexte)
    let descParts = [];
    if (task.notes && task.notes.trim()) {
      descParts.push(task.notes.trim());
    }
    const childSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    if (childSubtasks.length > 0) {
      const checklistStr = 'Checklist:\n' + childSubtasks.map(s => `[${s.completed ? 'x' : ' '}] ${s.title}`).join('\n');
      descParts.push(checklistStr);
    }
    descParts.push(`Context: ${categoryName}\nPlanned in Span Plan`);
    const fullDesc = descParts.join('\n\n');

    const isAllDay = !!task.allDay || (!task.time && !!task.date);

    icsLines.push('BEGIN:VEVENT');
    icsLines.push(`UID:${uid}`);
    icsLines.push(`DTSTAMP:${nowStamp}`);

    if (isAllDay) {
      const dtStart = formatIcsAllDayDate(task.date);
      const dtEnd = calculateIcsAllDayEndExclusive(task.date, task.endDate);
      icsLines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      icsLines.push(`DTEND;VALUE=DATE:${dtEnd}`);
    } else {
      const dtStart = formatIcsDateTime(task.date, task.time);
      const dtEnd = calculateIcsEndDateTime(task.date, task.time, task.duration || 30);
      icsLines.push(`DTSTART:${dtStart}`);
      icsLines.push(`DTEND:${dtEnd}`);
    }

    icsLines.push(`SUMMARY:${escapeIcsText(summary)}`);

    // Gestion du Lieu et Lien Web
    if (task.location && task.location.trim()) {
      const locClean = task.location.trim();
      icsLines.push(`LOCATION:${escapeIcsText(locClean)}`);
      const isUrl = /^https?:\/\//i.test(locClean) || /^www\./i.test(locClean) || locClean.includes('meet.google.com') || locClean.includes('zoom.us');
      if (isUrl) {
        const fullUrl = /^https?:\/\//i.test(locClean) ? locClean : `https://${locClean}`;
        icsLines.push(`URL:${escapeIcsText(fullUrl)}`);
      }
    }

    icsLines.push(`DESCRIPTION:${escapeIcsText(fullDesc)}`);
    icsLines.push(`CATEGORIES:${categoryName}`);
    icsLines.push('STATUS:CONFIRMED');
    icsLines.push('END:VEVENT');
  });

  icsLines.push('END:VCALENDAR');

  const icsContent = icsLines.join('\r\n');
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fileDate = new Date().toISOString().slice(0, 10);
  const filename = category === 'all' 
    ? `span-plan-${fileDate}.ics` 
    : `span-plan-${category}-${fileDate}.ics`;

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`${scheduledTasks.length} ${category === 'all' ? '' : category + ' '}event(s) exported to ${filename}`, 'success');
}

let pendingImportData = null;

function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const rawText = e.target.result;
      const parseResult = (typeof SpanCore !== 'undefined' && SpanCore.parseImportFile)
        ? SpanCore.parseImportFile(rawText, file.name)
        : null;

      if (!parseResult || !parseResult.success) {
        if (typeof showToast === 'function') {
          showToast(parseResult ? parseResult.error : "Format de fichier non reconnu.", 'danger');
        }
        return;
      }

      pendingImportData = parseResult;
      openImportModal(parseResult);
    } catch (err) {
      if (typeof showToast === 'function') {
        showToast("Erreur lors de la lecture du fichier : " + err.message, 'danger');
      }
    }
  };
  reader.readAsText(file);
}
window.handleImportFile = handleImportFile;

function importData(event) {
  const file = event.target && event.target.files && event.target.files[0];
  if (file) handleImportFile(file);
  if (event.target) event.target.value = '';
}
window.importData = importData;

function openImportModal(data) {
  const modal = document.getElementById('importModalOverlay');
  if (!modal) return;

  const fileNameEl = document.getElementById('importFileName');
  const fileTypeEl = document.getElementById('importFileType');
  const countTotalEl = document.getElementById('importCountTotal');
  const countEventsEl = document.getElementById('importCountEvents');
  const countBacklogEl = document.getElementById('importCountBacklog');
  const countSubtasksEl = document.getElementById('importCountSubtasks');
  const btnSubmit = document.getElementById('btnConfirmImport');

  if (fileNameEl) fileNameEl.textContent = data.fileName || 'Fichier sélectionné';
  if (fileTypeEl) fileTypeEl.textContent = data.label || 'Format détecté';
  if (countTotalEl) countTotalEl.textContent = data.summary.total;
  if (countEventsEl) countEventsEl.textContent = data.summary.events;
  if (countBacklogEl) countBacklogEl.textContent = data.summary.backlog;
  if (countSubtasksEl) countSubtasksEl.textContent = data.summary.subtasks;

  if (btnSubmit) {
    btnSubmit.textContent = `🚀 Intégrer les données (${data.summary.total} tâches)`;
  }

  modal.style.display = 'flex';
}
window.openImportModal = openImportModal;

function closeImportModal() {
  const modal = document.getElementById('importModalOverlay');
  if (modal) modal.style.display = 'none';
  pendingImportData = null;
}
window.closeImportModal = closeImportModal;

function executePendingImport() {
  if (!pendingImportData || !Array.isArray(pendingImportData.tasks)) {
    if (typeof showToast === 'function') showToast("Aucune donnée à importer.", 'danger');
    return;
  }

  const mode = document.querySelector('input[name="importMode"]:checked')?.value || 'replace';
  const shouldSnapshot = document.getElementById('chkImportSafetySnapshot')?.checked ?? true;

  if (shouldSnapshot && typeof createSyncSnapshot === 'function') {
    createSyncSnapshot(`Avant import de ${pendingImportData.fileName}`);
  }

  const incomingTasks = pendingImportData.tasks;

  if (mode === 'replace') {
    // 1. Remplacement complet (Nouveau compte / Nouvel utilisateur)
    window.SpanPlanState.tasks = incomingTasks;
    localStorage.setItem('span_plan_tasks', JSON.stringify(incomingTasks));

    if (Array.isArray(pendingImportData.focusTasks) && pendingImportData.focusTasks.length > 0) {
      localStorage.setItem('span_tasks', JSON.stringify(pendingImportData.focusTasks));
    } else {
      if (typeof syncPlanTasksToFocusStorage === 'function') {
        syncPlanTasksToFocusStorage();
      }
    }
  } else {
    // 2. Fusion intelligente avec l'existant
    const existingTasks = (window.SpanPlanState && window.SpanPlanState.tasks) || [];
    const existingIds = new Set(existingTasks.map(t => String(t.id)));

    const distinctIncoming = incomingTasks.map(t => {
      if (existingIds.has(String(t.id))) {
        return {
          ...t,
          id: 't_' + Math.random().toString(36).slice(2, 9)
        };
      }
      return t;
    });

    window.SpanPlanState.tasks = [...distinctIncoming, ...existingTasks];
    localStorage.setItem('span_plan_tasks', JSON.stringify(window.SpanPlanState.tasks));
    if (typeof syncPlanTasksToFocusStorage === 'function') {
      syncPlanTasksToFocusStorage();
    }
  }

  if (window.SpanPlanStore) {
    window.SpanPlanStore.tasks = window.SpanPlanState.tasks;
    window.SpanPlanStore.save();
  }

  // Synchroniser immédiatement dans le cloud du compte actif
  if (typeof syncPlanToCloud === 'function') {
    syncPlanToCloud();
  }

  // Rafraîchir l'interface
  if (typeof renderPlanGrid === 'function') renderPlanGrid(true);
  if (typeof renderBacklogDrawer === 'function') renderBacklogDrawer();
  if (typeof updateCounters === 'function') updateCounters();
  if (typeof renderDateStrip === 'function') renderDateStrip();
  if (typeof renderSyncHistoryAndSnapshotsUI === 'function') renderSyncHistoryAndSnapshotsUI();

  closeImportModal();
  if (typeof showToast === 'function') {
    showToast(`Intégration réussie : ${incomingTasks.length} tâches chargées !`, 'success', 3500);
  }
}
window.executePendingImport = executePendingImport;

// Système de notifications Toast non bloquantes (remplace alert())
function showToast(message, type = 'info', duration = 3000) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  // Animation d'apparition
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, duration);
}

// Raccourcis clavier universels et ergonomiques (Mac: ⌘, Win/Linux: Ctrl)
window.addEventListener('keydown', (e) => {
  if (typeof SpanSecurity !== 'undefined' && SpanSecurity.isAppLocked && SpanSecurity.isAppLocked()) {
    return;
  }
  const isEditing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable;
  const hasModifier = (e.metaKey || e.ctrlKey);

  // ⌘K ou Ctrl+K : Focus barre d'ajout rapide (fonctionne même si déjà en saisie)
  if (hasModifier && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (typeof toggleQuickAddBar === 'function') {
      toggleQuickAddBar(true);
    } else {
      const quickInput = document.getElementById('quickTaskInput');
      if (quickInput) {
        quickInput.focus();
        quickInput.select();
      }
    }
    return;
  }
  
  if (e.key === 'Escape') {
    if (typeof toggleQuickAddBar === 'function') toggleQuickAddBar(false);
    closeSettingsModal();
    if (typeof closeEditModal === 'function') closeEditModal();
    if (typeof closeSubtasksModal === 'function') closeSubtasksModal();
    if (typeof closeShortcutsModal === 'function') closeShortcutsModal();
    if (typeof closeTaskPopover === 'function') closeTaskPopover();
    if (typeof closeContextDropdown === 'function') closeContextDropdown();
    if (typeof clearSelection === 'function') clearSelection();
    const drawer = document.getElementById('backlogDrawer');
    if (drawer && drawer.classList.contains('open') && !drawer.classList.contains('pinned')) {
      drawer.classList.remove('open');
    }
    if (isEditing) e.target.blur();
    return;
  }

  if (isEditing) return;

  if (e.key === 'Backspace' || e.key === 'Delete') {
    if (typeof deleteSelectedTasks === 'function') {
      deleteSelectedTasks();
      e.preventDefault();
    }
    return;
  }

  if (e.key === 'Enter') {
    if (typeof selectedTaskIds !== 'undefined' && selectedTaskIds.size === 1) {
      const selectedId = Array.from(selectedTaskIds)[0];
      if (typeof openEditModal === 'function') {
        openEditModal(selectedId);
        e.preventDefault();
      }
    }
    return;
  }

  if (e.key === '?' || (e.shiftKey && e.key === '/')) {
    e.preventDefault();
    if (typeof openShortcutsModal === 'function') openShortcutsModal();
    return;
  }

  if (e.key === 't' || e.key === 'T') {
    e.preventDefault();
    if (typeof jumpToToday === 'function') jumpToToday();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (typeof navigateTimeline === 'function') navigateTimeline(1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (typeof navigateTimeline === 'function') navigateTimeline(-1);
  } else if (e.key === 'l' || e.key === 'L' || e.key === 'b' || e.key === 'B') {
    e.preventDefault();
    if (typeof toggleBacklogDrawer === 'function') toggleBacklogDrawer();
  } else if (e.key === 'n' || e.key === 'N' || e.key === 'c' || e.key === 'C') {
    e.preventDefault();
    if (typeof toggleQuickAddBar === 'function') {
      toggleQuickAddBar(true);
    } else if (typeof openCreateModalWithDefaults === 'function') {
      openCreateModalWithDefaults();
    }
  } else if (['1', '3', '5', '7'].includes(e.key)) {
    if (typeof setVisibleDays === 'function') {
      setVisibleDays(parseInt(e.key, 10));
    }
  } else if (e.key === 'd' || e.key === 'D') {
    if (typeof setVisibleDays === 'function') {
      setVisibleDays(1);
    }
  } else if (e.key === 'w' || e.key === 'W') {
    if (typeof setVisibleDays === 'function') {
      setVisibleDays(7);
    }
  }
});

// Initialisation globale
window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('span_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeUI(savedTheme);
});

// Unobtrusive Event Delegation for [data-action] attributes
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.getAttribute('data-action');
  switch (action) {
    case 'toggle-theme':
      toggleTheme();
      break;
    case 'open-settings':
      openSettingsModal(target.getAttribute('data-tab') || 'sync');
      break;
    case 'close-settings':
      closeSettingsModal();
      break;
    case 'toggle-backlog':
      if (typeof toggleBacklogDrawer === 'function') toggleBacklogDrawer();
      break;
    case 'jump-today':
      if (typeof jumpToToday === 'function') jumpToToday();
      break;
    case 'open-shortcuts':
      if (typeof openShortcutsModal === 'function') openShortcutsModal();
      break;
    case 'close-shortcuts':
      if (typeof closeShortcutsModal === 'function') closeShortcutsModal();
      break;
    case 'quick-add':
      if (typeof toggleQuickAddBar === 'function') toggleQuickAddBar(true);
      break;
    case 'new-task':
      if (typeof openCreateModalWithDefaults === 'function') openCreateModalWithDefaults();
      break;
  }
});

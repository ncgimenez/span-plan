// Thème & Préférences globales
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('span_theme', next);
  
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) toggleBtn.textContent = next.charAt(0).toUpperCase() + next.slice(1);
  
  const meta = document.getElementById('themeMetaColor');
  if (meta) meta.setAttribute('content', next === 'dark' ? '#0d0d0f' : '#f8f8fa');

  showToast(`Theme switched to ${next} mode`);
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
  }
}

function closeSettingsModal() {
  const modal = document.getElementById('settingsModalOverlay');
  if (modal) modal.style.display = 'none';
}

function goToFocusApp() {
  if (window.location.hostname.includes('github.io')) {
    window.location.href = 'https://ncgimenez.github.io/span-focus/';
  } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    if (window.location.pathname.startsWith('/span-plan')) {
      window.location.href = '/span-focus/';
    } else {
      window.location.href = 'https://ncgimenez.github.io/span-focus/';
    }
  } else {
    window.location.href = '/span-focus/';
  }
}

function exportData() {
  const tasks = (window.SpanPlanState && window.SpanPlanState.tasks) || [];
  const exportBlob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(exportBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `span-plan-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup exported successfully (JSON)');
}

function exportIcsFile(category = 'all') {
  const allTasks = (window.SpanPlanState && window.SpanPlanState.tasks) || [];
  
  // Exporter uniquement les blocs qui ont une date et une heure (time blocks réels)
  const scheduledTasks = allTasks.filter(t => {
    if (!t || !t.date || !t.time) return false;
    if (category !== 'all' && (t.context || 'work').toLowerCase() !== category.toLowerCase()) {
      return false;
    }
    return true;
  });

  if (scheduledTasks.length === 0) {
    const label = category === 'all' ? 'scheduled tasks or events' : `${category} scheduled items`;
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
    const endDate = new Date(startDate.getTime() + (durationMinutes || 45) * 60 * 1000);
    
    const y = endDate.getFullYear();
    const m = String(endDate.getMonth() + 1).padStart(2, '0');
    const d = String(endDate.getDate()).padStart(2, '0');
    const h = String(endDate.getHours()).padStart(2, '0');
    const min = String(endDate.getMinutes()).padStart(2, '0');
    return `${y}${m}${d}T${h}${min}00`;
  }

  function escapeIcsText(str) {
    if (!str) return '';
    return str
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
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

    const dtStart = formatIcsDateTime(task.date, task.time);
    const dtEnd = calculateIcsEndDateTime(task.date, task.time, task.duration || 45);
    const uid = `${task.id || ('task_' + Math.random().toString(36).slice(2))}@spanplan.app`;

    const categoryName = context.charAt(0).toUpperCase() + context.slice(1);
    const desc = `Context: ${categoryName}\\nPlanned in Span Plan`;

    icsLines.push('BEGIN:VEVENT');
    icsLines.push(`UID:${uid}`);
    icsLines.push(`DTSTAMP:${nowStamp}`);
    icsLines.push(`DTSTART:${dtStart}`);
    icsLines.push(`DTEND:${dtEnd}`);
    icsLines.push(`SUMMARY:${escapeIcsText(summary)}`);
    icsLines.push(`DESCRIPTION:${desc}`);
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

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data)) {
        window.SpanPlanState.tasks = data;
        if (typeof savePlanState === 'function') savePlanState();
        showToast(`${data.length} tasks imported successfully!`, 'success');
      }
    } catch {
      showToast('Invalid JSON file format.', 'danger');
    }
  };
  reader.readAsText(file);
}

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
  }
});

// Initialisation globale
window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('span_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) toggleBtn.textContent = savedTheme.charAt(0).toUpperCase() + savedTheme.slice(1);
});

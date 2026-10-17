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

function openSettingsModal() {
  const modal = document.getElementById('settingsModalOverlay');
  if (modal) modal.style.display = 'flex';
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

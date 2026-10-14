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
  // Ajuste selon le déploiement réel (ex: ../focus/index.html ou https://focus.spansuite.app)
  window.location.href = '../focus/index.html';
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
        alert('Tasks imported successfully!');
      }
    } catch {
      alert('Invalid JSON file format.');
    }
  };
  reader.readAsText(file);
}

// Raccourcis clavier globaux
window.addEventListener('keydown', (e) => {
  const isEditing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);
  if (isEditing) return;

  if (e.key === 't' || e.key === 'T') {
    e.preventDefault();
    if (typeof jumpToToday === 'function') jumpToToday();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (typeof navigateTimeline === 'function') navigateTimeline(1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (typeof navigateTimeline === 'function') navigateTimeline(-1);
  } else if (e.key === 'l' || e.key === 'L') {
    e.preventDefault();
    if (typeof toggleBacklogDrawer === 'function') toggleBacklogDrawer();
  }
});

// Initialisation globale
window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('span_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) toggleBtn.textContent = savedTheme.charAt(0).toUpperCase() + savedTheme.slice(1);
});

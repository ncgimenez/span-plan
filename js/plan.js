window.SpanPlanState = window.SpanPlanState || {};

// Tâches du planner réparties par "bucket" (today, tomorrow, later)
window.SpanPlanState.tasks = JSON.parse(localStorage.getItem('span_plan_tasks')) || [
  { id: 'p_1', title: 'Définir la roadmap du trimestre', bucket: 'today', category: 'Admin', estimate: 2, completed: false },
  { id: 'p_2', title: 'Structurer le repo GitHub Span Plan', bucket: 'today', category: 'Code', estimate: 1, completed: false },
  { id: 'p_3', title: 'Lecture article architecture web', bucket: 'tomorrow', category: 'Study', estimate: 1, completed: false },
  { id: 'p_4', title: 'Rédiger documentation utilisateur', bucket: 'later', category: 'Write', estimate: 3, completed: false }
];

window.SpanPlanState.categoryLabels = JSON.parse(localStorage.getItem('span_category_labels')) || {
  Code: 'Code',
  Study: 'Study',
  Write: 'Write',
  Admin: 'Admin'
};

let editingTaskId = null;
let editingBucket = 'today';
let editingCategory = 'None';
let editingEstimate = 1;

function savePlanData() {
  localStorage.setItem('span_plan_tasks', JSON.stringify(window.SpanPlanState.tasks));
  renderAllBuckets();
  if (typeof syncPlanToCloud === 'function') syncPlanToCloud();
}

function renderAllBuckets() {
  const buckets = ['today', 'tomorrow', 'later'];
  const labels = window.SpanPlanState.categoryLabels;

  buckets.forEach(b => {
    const list = document.getElementById(`list-${b}`);
    const badge = document.getElementById(`count-${b}`);
    if (!list) return;

    const items = window.SpanPlanState.tasks.filter(t => t.bucket === b);
    if (badge) badge.textContent = items.length;

    list.innerHTML = '';

    items.forEach(task => {
      const li = document.createElement('li');
      li.className = `task-item ${task.completed ? 'completed' : ''}`;
      
      const hasCat = task.category && task.category !== 'None';
      const catLabel = hasCat ? (labels[task.category] || task.category) : '';
      const tagHtml = hasCat 
        ? `<span class="task-tag" style="background: rgba(255,255,255,0.06); color: var(--tag-${task.category.toLowerCase()})">${catLabel}</span>`
        : '';

      li.innerHTML = `
        <div class="task-left" onclick="openPlanEditModal('${task.id}')">
          <div class="checkbox" onclick="event.stopPropagation(); togglePlanTask('${task.id}')">${task.completed ? '✓' : ''}</div>
          <span class="task-text">${task.title}</span>
          ${tagHtml}
          <span class="task-est">⏱ ${task.estimate || 1}</span>
        </div>
        <div class="task-actions">
          ${b !== 'today' ? `<button class="btn-task-action" onclick="moveTaskBucket('${task.id}', 'today')" title="Déplacer à Aujourd'hui">☀️</button>` : ''}
          ${b === 'today' ? `<button class="btn-task-action" onclick="sendToFocusApp('${task.id}')" title="Envoyer vers Span Focus">🎯</button>` : ''}
          <button class="btn-task-action" onclick="deletePlanTask('${task.id}')" title="Supprimer">✕</button>
        </div>
      `;
      list.appendChild(li);
    });
  });
}

function addPlannedTask() {
  const input = document.getElementById('planTaskInput');
  const bucketSel = document.getElementById('planTaskBucket');
  const catSel = document.getElementById('planTaskCategory');

  const text = input ? input.value.trim() : '';
  if (!text) return;

  const newTask = {
    id: 'p_' + Date.now(),
    title: text,
    bucket: bucketSel ? bucketSel.value : 'today',
    category: catSel ? catSel.value : 'None',
    estimate: 1,
    completed: false
  };

  window.SpanPlanState.tasks.unshift(newTask);
  if (input) input.value = '';
  savePlanData();
}

function togglePlanTask(id) {
  const task = window.SpanPlanState.tasks.find(t => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  savePlanData();
}

function deletePlanTask(id) {
  window.SpanPlanState.tasks = window.SpanPlanState.tasks.filter(t => t.id !== id);
  savePlanData();
}

function moveTaskBucket(id, targetBucket) {
  const task = window.SpanPlanState.tasks.find(t => t.id === id);
  if (!task) return;
  task.bucket = targetBucket;
  savePlanData();
}

// Passerelle vers Span Focus : ajoute la tâche à la liste partagée de Span Focus
function sendToFocusApp(id) {
  const task = window.SpanPlanState.tasks.find(t => t.id === id);
  if (!task) return;

  let focusTasks = JSON.parse(localStorage.getItem('span_tasks')) || [];
  focusTasks.unshift({
    id: 't_' + Date.now(),
    title: task.title,
    category: task.category || 'None',
    estimate: task.estimate || 1,
    completed: false,
    isFavorite: true
  });
  localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
  alert(`"${task.title}" a été envoyée vers Span Focus avec priorité ⭐ !`);
}

function openPlanEditModal(id) {
  const task = window.SpanPlanState.tasks.find(t => t.id === id);
  if (!task) return;

  editingTaskId = id;
  editingBucket = task.bucket || 'today';
  editingCategory = task.category || 'None';
  editingEstimate = task.estimate || 1;

  document.getElementById('editPlanTitle').value = task.title;
  document.getElementById('editPlanEstimate').textContent = editingEstimate;
  document.getElementById('editPlanEstMinutes').textContent = editingEstimate * 25;

  document.querySelectorAll('#modalBucketPills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.bucket === editingBucket);
  });

  document.querySelectorAll('#modalPlanCategoryPills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === editingCategory);
  });

  document.getElementById('editPlanModalOverlay').style.display = 'flex';
}

function closePlanEditModal() {
  document.getElementById('editPlanModalOverlay').style.display = 'none';
  editingTaskId = null;
}

function selectEditBucket(b) {
  editingBucket = b;
  document.querySelectorAll('#modalBucketPills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.bucket === b);
  });
}

function selectEditCategory(c) {
  editingCategory = editingCategory === c ? 'None' : c;
  document.querySelectorAll('#modalPlanCategoryPills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === editingCategory);
  });
}

function stepPlanEstimate(delta) {
  editingEstimate = Math.max(1, Math.min(12, editingEstimate + delta));
  document.getElementById('editPlanEstimate').textContent = editingEstimate;
  document.getElementById('editPlanEstMinutes').textContent = editingEstimate * 25;
}

function savePlanTaskModal() {
  const title = document.getElementById('editPlanTitle').value.trim();
  if (!title) return;

  const task = window.SpanPlanState.tasks.find(t => t.id === editingTaskId);
  if (task) {
    task.title = title;
    task.bucket = editingBucket;
    task.category = editingCategory;
    task.estimate = editingEstimate;
  }
  closePlanEditModal();
  savePlanData();
}

function exportPlanData() {
  const blob = new Blob([JSON.stringify(window.SpanPlanState.tasks, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `span-plan-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importPlanData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      if (Array.isArray(data)) {
        window.SpanPlanState.tasks = data;
        savePlanData();
        alert('Tâches importées avec succès !');
      }
    } catch {
      alert('Format JSON non valide.');
    }
  };
  reader.readAsText(file);
}

window.addEventListener('DOMContentLoaded', renderAllBuckets);

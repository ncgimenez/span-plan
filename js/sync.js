// Configuration Supabase partagée avec Span Focus
const SUPABASE_URL = 'https://xzoukiveknyuxmbrcsvb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8g571gv3CFOyJ0lMtaAf4w_CcITQovd';

const supabaseClient = (typeof supabase !== 'undefined') 
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
  : null;

function getOrCreateSyncId() {
  if (typeof SpanSecurity !== 'undefined' && SpanSecurity.getOrCreateAccountId) {
    return SpanSecurity.getOrCreateAccountId();
  }
  const urlParams = new URLSearchParams(window.location.search);
  const syncParam = urlParams.get('sync');
  if (syncParam && syncParam.trim()) {
    const cleanSync = syncParam.trim();
    localStorage.setItem('span_sync_user', cleanSync);
    localStorage.setItem('span_account_id', cleanSync);
    localStorage.setItem('span_sync_key_manually_set', 'true');
    return cleanSync;
  }
  let id = localStorage.getItem('span_account_id') || localStorage.getItem('span_sync_user');
  const isLocalhost = Boolean(
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0'
  );
  const manuallySet = localStorage.getItem('span_sync_key_manually_set') === 'true';
  if (!id || (isLocalhost && !manuallySet)) {
    id = isLocalhost ? 'span_local_user' : ('span_' + Math.random().toString(36).substring(2, 8) + '_' + Date.now().toString(36));
    localStorage.setItem('span_sync_user', id);
    localStorage.setItem('span_account_id', id);
  }
  return id;
}

let SYNC_USER_ID = getOrCreateSyncId();
let isCloudSyncInProgress = false;
let realtimeSubscription = null;

function copyCurrentSyncKey() {
  navigator.clipboard.writeText(SYNC_USER_ID).then(() => {
    if (typeof showToast === 'function') showToast("Clé de synchronisation copiée !", 'success');
    else alert("Sync key copied to clipboard!");
  }).catch(() => {
    if (typeof showToast === 'function') showToast("Échec de la copie de la clé.", 'danger');
    else alert("Failed to copy sync key.");
  });
}

function syncKeychainInputs(value) {
  const inputKey = document.getElementById('inputSyncKey');
  const inputSecret = document.getElementById('inputSyncSecret');
  if (inputKey && inputKey.value !== value) inputKey.value = value;
  if (inputSecret) inputSecret.value = value;
}

async function handleLinkClick() {
  const input = document.getElementById('inputSyncKey');
  if (!input) return;
  const key = input.value.trim();
  if (!key) return;

  if (key.startsWith('REC-')) {
    localStorage.setItem('span_recovery_key', key.toUpperCase());
    if (typeof SpanSecurity !== 'undefined' && SpanSecurity.updateSecurityUI) {
      SpanSecurity.updateSecurityUI();
    }
    if (typeof showToast === 'function') showToast("Clé de secours enregistrée !", 'success');
    else alert("Clé de secours enregistrée !");
    input.value = '';
    return;
  }

  // 1. Sauvegarder automatiquement un point de restauration complet avant la liaison
  createSyncSnapshot(`Avant liaison avec ${key.slice(0, 12)}...`, SYNC_USER_ID);
  recordAccountInHistory(SYNC_USER_ID, 'Compte précédent');

  SYNC_USER_ID = key;
  localStorage.setItem('span_sync_user', key);
  localStorage.setItem('span_account_id', key);
  localStorage.setItem('span_sync_key_manually_set', 'true');
  sessionStorage.removeItem('span_session_unlocked');

  // Enregistrer le nouveau compte dans l'historique
  recordAccountInHistory(key, 'Compte actif');
  
  syncKeychainInputs(key);
  updateSyncKeyDisplay();

  setupRealtimeSubscription();
  await loadPlanFromCloud();
  if (typeof SpanSecurity !== 'undefined' && SpanSecurity.updateSecurityUI) {
    SpanSecurity.updateSecurityUI();
  }
  renderSyncHistoryAndSnapshotsUI();
  if (typeof showToast === 'function') showToast("Span Plan synchronisé avec succès !", 'success');
  else alert("Span Plan linked successfully!");
}

function updateSyncKeyDisplay() {
  const el = document.getElementById('displaySyncKey');
  if (el) el.textContent = SYNC_USER_ID;
  const accEl = document.getElementById('displayAccountId');
  if (accEl) accEl.textContent = SYNC_USER_ID;
  syncKeychainInputs(SYNC_USER_ID);
  renderSyncHistoryAndSnapshotsUI();
}

// ==============================================================
// GESTIONNAIRE D'HISTORIQUE, DE POINTS DE RESTAURATION & DÉLIAISON
// ==============================================================

function getAccountsHistory() {
  try {
    return JSON.parse(localStorage.getItem('span_sync_accounts_history')) || [];
  } catch (e) {
    return [];
  }
}

function recordAccountInHistory(key, label = '') {
  if (!key) return;
  const accounts = getAccountsHistory();
  const existingIdx = accounts.findIndex(a => a.id === key);
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  if (existingIdx !== -1) {
    accounts[existingIdx].lastUsedAt = dateStr;
    if (label) accounts[existingIdx].label = label;
  } else {
    accounts.unshift({
      id: key,
      label: label || `Compte ${key.slice(0, 10)}...`,
      lastUsedAt: dateStr
    });
  }
  if (accounts.length > 8) accounts.pop();
  localStorage.setItem('span_sync_accounts_history', JSON.stringify(accounts));
}

function getSyncSnapshots() {
  try {
    return JSON.parse(localStorage.getItem('span_sync_snapshots')) || [];
  } catch (e) {
    return [];
  }
}

function createSyncSnapshot(label = 'Sauvegarde manuelle', key = null) {
  try {
    const snapshots = getSyncSnapshots();
    const tasksCopy = JSON.parse(JSON.stringify((window.SpanPlanState && window.SpanPlanState.tasks) || []));
    let focusCopy = [];
    try {
      focusCopy = JSON.parse(localStorage.getItem('span_tasks') || '[]');
    } catch (_) {}

    const now = new Date();
    const snap = {
      id: 'snap_' + Date.now(),
      label: label || 'Sauvegarde manuelle',
      key: key || SYNC_USER_ID,
      createdAt: now.toISOString(),
      displayDate: now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      taskCount: tasksCopy.length,
      tasks: tasksCopy,
      focusTasks: focusCopy
    };

    snapshots.unshift(snap);
    if (snapshots.length > 8) snapshots.pop();
    localStorage.setItem('span_sync_snapshots', JSON.stringify(snapshots));
    return snap;
  } catch (e) {
    console.warn('Error creating snapshot:', e);
    return null;
  }
}

function createManualSyncSnapshot() {
  const snap = createSyncSnapshot('Sauvegarde manuelle');
  renderSyncHistoryAndSnapshotsUI();
  if (typeof showToast === 'function') {
    showToast(`Point de restauration créé (${snap ? snap.taskCount : 0} tâches)`, 'success');
  }
}
window.createManualSyncSnapshot = createManualSyncSnapshot;

function restoreSyncSnapshot(snapId) {
  const snapshots = getSyncSnapshots();
  const snap = snapshots.find(s => s.id === snapId);
  if (!snap) return;

  if (!confirm(`Restaurer le point de sauvegarde du ${snap.displayDate} (${snap.taskCount} tâches) ?\n\nVotre calendrier actuel sera remplacé par cet état sauvegardé.`)) {
    return;
  }

  // Sauvegarde de sécurité juste avant la restauration
  createSyncSnapshot('Avant restauration de sauvegarde');

  window.SpanPlanState.tasks = snap.tasks || [];
  localStorage.setItem('span_plan_tasks', JSON.stringify(window.SpanPlanState.tasks));

  if (Array.isArray(snap.focusTasks)) {
    try {
      localStorage.setItem('span_tasks', JSON.stringify(snap.focusTasks));
    } catch (_) {}
  }

  if (snap.key && snap.key !== SYNC_USER_ID) {
    SYNC_USER_ID = snap.key;
    localStorage.setItem('span_sync_user', snap.key);
    localStorage.setItem('span_account_id', snap.key);
    updateSyncKeyDisplay();
    setupRealtimeSubscription();
  }

  if (typeof renderPlanGrid === 'function') renderPlanGrid(true);
  if (typeof renderBacklogDrawer === 'function') renderBacklogDrawer();
  if (typeof updateCounters === 'function') updateCounters();
  if (typeof renderDateStrip === 'function') renderDateStrip();
  if (typeof syncPlanToCloud === 'function') syncPlanToCloud();

  renderSyncHistoryAndSnapshotsUI();
  if (typeof showToast === 'function') {
    showToast(`Calendrier restauré avec succès (${snap.taskCount} tâches) !`, 'success');
  }
}
window.restoreSyncSnapshot = restoreSyncSnapshot;

function deleteSyncSnapshot(snapId) {
  let snapshots = getSyncSnapshots();
  snapshots = snapshots.filter(s => s.id !== snapId);
  localStorage.setItem('span_sync_snapshots', JSON.stringify(snapshots));
  renderSyncHistoryAndSnapshotsUI();
}
window.deleteSyncSnapshot = deleteSyncSnapshot;

async function switchAccountFromHistory(targetKey) {
  if (!targetKey) return;
  if (!confirm(`Basculer vers le compte ${targetKey} ?`)) return;

  createSyncSnapshot(`Avant bascule vers ${targetKey.slice(0, 10)}...`, SYNC_USER_ID);
  recordAccountInHistory(SYNC_USER_ID, 'Compte précédent');

  SYNC_USER_ID = targetKey;
  localStorage.setItem('span_sync_user', targetKey);
  localStorage.setItem('span_account_id', targetKey);
  sessionStorage.removeItem('span_session_unlocked');

  recordAccountInHistory(targetKey, 'Compte actif');
  syncKeychainInputs(targetKey);
  updateSyncKeyDisplay();

  setupRealtimeSubscription();
  await loadPlanFromCloud();
  if (typeof SpanSecurity !== 'undefined' && SpanSecurity.updateSecurityUI) {
    SpanSecurity.updateSecurityUI();
  }
  renderSyncHistoryAndSnapshotsUI();
  if (typeof showToast === 'function') {
    showToast(`Basculé sur le compte ${targetKey}`, 'success');
  }
}
window.switchAccountFromHistory = switchAccountFromHistory;

function removeAccountFromHistory(targetKey) {
  let accounts = getAccountsHistory();
  accounts = accounts.filter(a => a.id !== targetKey);
  localStorage.setItem('span_sync_accounts_history', JSON.stringify(accounts));
  renderSyncHistoryAndSnapshotsUI();
}
window.removeAccountFromHistory = removeAccountFromHistory;

function unlinkAccountAndReset() {
  const currentKey = SYNC_USER_ID;
  if (!confirm(`Voulez-vous délier ce compte (${currentKey}) ?\n\nUn nouvel identifiant privé et indépendant va être généré pour votre appareil afin d'isoler complètement vos données.`)) {
    return;
  }

  // 1. Sauvegarder un snapshot de secours de l'état actuel avant de délier
  createSyncSnapshot(`Avant déliaison du compte ${currentKey.slice(0, 10)}...`, currentKey);

  // 2. Archiver le compte dans l'historique des comptes
  recordAccountInHistory(currentKey, 'Compte délié');

  // 3. Générer un nouvel ID unique et privé
  const newPart = Math.random().toString(36).substring(2, 8);
  const newTime = Date.now().toString(36);
  const newId = `span_${newPart}_${newTime}`;

  SYNC_USER_ID = newId;
  localStorage.setItem('span_sync_user', newId);
  localStorage.setItem('span_account_id', newId);
  localStorage.setItem('span_sync_key_manually_set', 'true');
  sessionStorage.removeItem('span_session_unlocked');

  // Enregistrer le nouveau compte dans l'historique
  recordAccountInHistory(newId, 'Mon compte privé');

  // 4. Mettre à jour l'UI et la souscription Realtime
  syncKeychainInputs(newId);
  updateSyncKeyDisplay();
  setupRealtimeSubscription();

  // 5. Sauvegarder le nouvel état cloud vierge/indépendant
  syncPlanToCloud();

  if (typeof SpanSecurity !== 'undefined' && SpanSecurity.updateSecurityUI) {
    SpanSecurity.updateSecurityUI();
  }

  renderSyncHistoryAndSnapshotsUI();

  if (typeof showToast === 'function') {
    showToast(`Compte délié ! Nouvel identifiant privé généré : ${newId}`, 'success', 3500);
  }
}
window.unlinkAccountAndReset = unlinkAccountAndReset;

function renderSyncHistoryAndSnapshotsUI() {
  // 1. Rendu des snapshots (Points de restauration)
  const snapContainer = document.getElementById('syncSnapshotsContainer');
  if (snapContainer) {
    const snapshots = getSyncSnapshots();
    if (snapshots.length === 0) {
      snapContainer.innerHTML = `
        <div style="font-size: 11px; color: var(--text-muted); font-style: italic; padding: 4px 0;">
          Aucun point de restauration antérieur.
        </div>
      `;
    } else {
      let snapHtml = `<div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">Points de restauration récents :</div>`;
      snapshots.forEach(s => {
        snapHtml += `
          <div class="sync-item-row">
            <div class="sync-item-meta">
              <span class="sync-item-title">${escapeHtml(s.label)}</span>
              <span class="sync-item-sub">📅 ${s.displayDate || s.createdAt.slice(0, 16)} • ${s.taskCount || 0} tâches</span>
            </div>
            <div style="display: flex; gap: 4px;">
              <button type="button" class="btn-theme-toggle mini" onclick="restoreSyncSnapshot('${s.id}')" title="Restaurer cet état complet">↺ Restaurer</button>
              <button type="button" class="btn-theme-toggle mini text-danger" onclick="deleteSyncSnapshot('${s.id}')" title="Supprimer ce point de restauration">✕</button>
            </div>
          </div>
        `;
      });
      snapContainer.innerHTML = snapHtml;
    }
  }

  // 2. Rendu de l'historique des comptes connectés
  const accContainer = document.getElementById('syncAccountsHistoryContainer');
  if (accContainer) {
    const accounts = getAccountsHistory();
    const otherAccounts = accounts.filter(a => a.id !== SYNC_USER_ID);
    if (otherAccounts.length === 0) {
      accContainer.innerHTML = '';
    } else {
      let accHtml = `<div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px; margin-top: 6px;">Autres comptes précédemment liés :</div>`;
      otherAccounts.forEach(a => {
        accHtml += `
          <div class="sync-item-row">
            <div class="sync-item-meta">
              <span class="sync-item-title">${escapeHtml(a.label || a.id)}</span>
              <span class="sync-item-sub">ID: ${escapeHtml(a.id.slice(0, 18))}... • ${a.lastUsedAt || ''}</span>
            </div>
            <div style="display: flex; gap: 4px;">
              <button type="button" class="btn-theme-toggle mini" onclick="switchAccountFromHistory('${a.id}')" title="Basculer vers cet identifiant">Basculer</button>
              <button type="button" class="btn-theme-toggle mini text-danger" onclick="removeAccountFromHistory('${a.id}')" title="Oublier ce compte de la liste">✕</button>
            </div>
          </div>
        `;
      });
      accContainer.innerHTML = accHtml;
    }
  }
}
window.renderSyncHistoryAndSnapshotsUI = renderSyncHistoryAndSnapshotsUI;

// ==============================================================
// MODAL DE NETTOYAGE DES TÂCHES IMPORTÉES
// ==============================================================

function openCleanImportedTasksModal() {
  const modal = document.getElementById('cleanImportedModalOverlay');
  if (!modal) return;
  modal.style.display = 'flex';
  renderCleanTasksList('all_mails');
}
window.openCleanImportedTasksModal = openCleanImportedTasksModal;

function closeCleanImportedModal() {
  const modal = document.getElementById('cleanImportedModalOverlay');
  if (modal) modal.style.display = 'none';
}
window.closeCleanImportedModal = closeCleanImportedModal;

function renderCleanTasksList(filterMode = 'all_mails') {
  const container = document.getElementById('cleanTasksListContainer');
  if (!container) return;

  const allTasks = (window.SpanPlanState && window.SpanPlanState.tasks) || [];
  if (allTasks.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 18px 0;">Aucune tâche dans votre calendrier.</div>`;
    updateCleanSelectedCount();
    return;
  }

  let html = '';
  allTasks.forEach(task => {
    const isMail = (typeof getTaskActionType === 'function' ? getTaskActionType(task) === 'mail' : false) || 
                   /#mail\b/i.test(task.title || '') || 
                   /^mail\b/i.test((task.title || '').trim());
    const isToday = task.date === TODAY_STR;
    
    let shouldCheck = false;
    if (filterMode === 'all_mails' && isMail) shouldCheck = true;
    else if (filterMode === 'all_today' && isToday) shouldCheck = true;
    else if (filterMode === 'check_all') shouldCheck = true;
    else if (filterMode === 'uncheck_all') shouldCheck = false;

    const actionType = (typeof getTaskActionType === 'function') ? getTaskActionType(task) : null;
    let badgeText = '';
    if (actionType === 'mail') badgeText = '✉️ Mail';
    else if (actionType === 'call') badgeText = '📞 Call';
    else if (actionType === 'pay') badgeText = '💳 Pay';
    else if (actionType === 'content') badgeText = '🎬 Contenu';

    const dateLabel = task.date ? (task.date === TODAY_STR ? "Aujourd'hui" : task.date) : "Backlog / Sans date";

    html += `
      <label class="clean-task-row ${shouldCheck ? 'is-selected' : ''}" onclick="event.stopPropagation()">
        <input type="checkbox" data-task-id="${task.id}" class="clean-task-checkbox" ${shouldCheck ? 'checked' : ''} onchange="handleCleanTaskCheckboxChange(this)">
        <div class="sync-item-meta">
          <div class="sync-item-title">${escapeHtml(task.title || 'Sans titre')}</div>
          <div class="sync-item-sub">
            <span>📅 ${dateLabel}</span>
            ${badgeText ? `<span style="margin-left: 6px; font-weight: 600;">${badgeText}</span>` : ''}
            ${task.time ? `<span style="margin-left: 6px;">⏰ ${task.time}</span>` : ''}
          </div>
        </div>
      </label>
    `;
  });

  container.innerHTML = html;
  updateCleanSelectedCount();
}
window.renderCleanTasksList = renderCleanTasksList;

function handleCleanTaskCheckboxChange(input) {
  const row = input.closest('.clean-task-row');
  if (row) {
    row.classList.toggle('is-selected', input.checked);
  }
  updateCleanSelectedCount();
}
window.handleCleanTaskCheckboxChange = handleCleanTaskCheckboxChange;

function selectCleanFilter(mode) {
  renderCleanTasksList(mode);
}
window.selectCleanFilter = selectCleanFilter;

function updateCleanSelectedCount() {
  const checkboxes = document.querySelectorAll('#cleanTasksListContainer input[type="checkbox"]:checked');
  const countEl = document.getElementById('cleanSelectedCount');
  const btn = document.getElementById('btnConfirmCleanTasks');
  const count = checkboxes.length;
  if (countEl) {
    countEl.textContent = `${count} tâche${count > 1 ? 's' : ''} sélectionnée${count > 1 ? 's' : ''}`;
  }
  if (btn) {
    btn.disabled = count === 0;
    btn.style.opacity = count === 0 ? '0.5' : '1';
    btn.textContent = `Supprimer la sélection (${count})`;
  }
}
window.updateCleanSelectedCount = updateCleanSelectedCount;

function executeCleanSelectedTasks() {
  const checkboxes = document.querySelectorAll('#cleanTasksListContainer input[type="checkbox"]:checked');
  const idsToDelete = new Set(Array.from(checkboxes).map(cb => cb.dataset.taskId).filter(Boolean));

  if (idsToDelete.size === 0) {
    if (typeof showToast === 'function') showToast("Aucune tâche sélectionnée.", 'info');
    return;
  }

  if (!confirm(`Supprimer définitivement ${idsToDelete.size} tâche(s) sélectionnée(s) de votre calendrier et de votre Backlog ?`)) {
    return;
  }

  // 1. Snapshot de sécurité avant suppression
  createSyncSnapshot(`Avant nettoyage (${idsToDelete.size} tâches supprimées)`);

  // 2. Retirer de SpanPlanState.tasks
  window.SpanPlanState.tasks = (window.SpanPlanState.tasks || []).filter(t => !idsToDelete.has(t.id) && !idsToDelete.has(t.focusId));
  localStorage.setItem('span_plan_tasks', JSON.stringify(window.SpanPlanState.tasks));

  // 3. Retirer de span_tasks (Span Focus)
  try {
    let focusTasks = JSON.parse(localStorage.getItem('span_tasks') || '[]');
    focusTasks = focusTasks.filter(ft => !idsToDelete.has(String(ft.id)) && !idsToDelete.has(String(ft.planId)));
    localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
  } catch (e) {}

  // 4. Ajouter aux IDs ignorés pour éviter toute réimportation
  try {
    let dismissed = JSON.parse(localStorage.getItem('span_plan_dismissed_focus_ids') || '[]');
    idsToDelete.forEach(id => dismissed.push(String(id)));
    localStorage.setItem('span_plan_dismissed_focus_ids', JSON.stringify(Array.from(new Set(dismissed))));
  } catch (e) {}

  // 5. Sauvegarder dans le cloud
  if (typeof syncPlanToCloud === 'function') {
    syncPlanToCloud();
  }

  // 6. Rafraîchir l'affichage
  closeCleanImportedModal();
  if (typeof renderPlanGrid === 'function') renderPlanGrid(true);
  if (typeof renderBacklogDrawer === 'function') renderBacklogDrawer();
  if (typeof updateCounters === 'function') updateCounters();
  if (typeof renderDateStrip === 'function') renderDateStrip();

  renderSyncHistoryAndSnapshotsUI();
  if (typeof showToast === 'function') {
    showToast(`${idsToDelete.size} tâche(s) supprimée(s). Votre calendrier est nettoyé !`, 'success', 3000);
  }
}
window.executeCleanSelectedTasks = executeCleanSelectedTasks;

let lastPlanCloudWriteTime = 0;

// ENVOI VERS SUPABASE
async function syncPlanToCloud() {
  if (!supabaseClient) return;
  try {
    lastPlanCloudWriteTime = Date.now();
    isCloudSyncInProgress = true;

    const { data: existingData } = await supabaseClient
      .from('user_state')
      .select('tasks')
      .eq('id', SYNC_USER_ID)
      .maybeSingle();

    const existingTasksObj = (existingData && existingData.tasks && typeof existingData.tasks === 'object' && !Array.isArray(existingData.tasks))
      ? existingData.tasks
      : {};

    // Récupérer les identifiants supprimés (locaux + distants)
    let localDismissed = [];
    try {
      localDismissed = JSON.parse(localStorage.getItem('span_plan_dismissed_focus_ids')) || [];
    } catch (e) {}
    const remoteDismissed = Array.isArray(existingTasksObj.dismissed_ids) ? existingTasksObj.dismissed_ids : [];
    const allDismissed = Array.from(new Set([...localDismissed, ...remoteDismissed]));
    localStorage.setItem('span_plan_dismissed_focus_ids', JSON.stringify(allDismissed));

    // Filtrer les tâches Focus existantes pour purger définitivement celles supprimées
    let cleanedFocusItems = Array.isArray(existingTasksObj.items) ? existingTasksObj.items : [];
    if (allDismissed.length > 0) {
      cleanedFocusItems = cleanedFocusItems.filter(ft => {
        if (!ft) return false;
        if (allDismissed.includes(ft.id)) return false;
        if (ft.title && allDismissed.includes('title:' + ft.title.trim().toLowerCase())) return false;
        if (ft.parentEventId && allDismissed.includes(ft.parentEventId)) return false;
        return true;
      });
    }

    // Synchroniser directement les modifications de SpanPlanState.tasks vers cleanedFocusItems (les items consommés par Focus)
    const planTasks = (window.SpanPlanState && window.SpanPlanState.tasks) || [];
    const catMap = { work: 'Work', life: 'Home', fun: 'Fun' };

    planTasks.forEach(pt => {
      if (!pt || !pt.id) return;
      if (allDismissed.includes(String(pt.id))) return;

      const isEv = pt.type === 'event' || !!pt.isEvent;
      let match = cleanedFocusItems.find(ft => 
        (ft && ft.id && (String(ft.id) === String(pt.id) || String(ft.id) === String(pt.focusId))) ||
        (ft && ft.planId && String(ft.planId) === String(pt.id))
      );

      const targetFocusId = match ? match.id : (pt.focusId || pt.id);

      if (match) {
        match.scheduledDate = pt.date || null;
        match.scheduledTime = pt.time || '';
        match.duration = pt.duration || 30;
        match.estimate = Math.max(1, Math.round((pt.duration || 30) / 30));
        match.title = pt.title;
        match.isEvent = isEv;
        match.planId = pt.id;
        if (pt.focusId) match.focusId = pt.focusId;
        if (isEv) {
          match.completed = false;
        } else if (typeof pt.completed === 'boolean') {
          match.completed = pt.completed;
        }
      } else {
        cleanedFocusItems.push({
          id: targetFocusId,
          planId: pt.id,
          title: pt.title || 'Untitled',
          category: catMap[pt.context] || 'Work',
          estimate: Math.max(1, Math.round((pt.duration || 30) / 30)),
          duration: pt.duration || 30,
          completed: !isEv && !!pt.completed,
          isFavorite: false,
          isEvent: isEv,
          parentEventId: null,
          scheduledDate: pt.date || null,
          scheduledTime: pt.time || ''
        });
      }

      // Synchroniser les sous-tâches dans cleanedFocusItems STRICTEMENT par ID
      const validSubIds = new Set((pt.subtasks || []).map(s => String(s.id)));
      // Supprimer les sous-tâches qui n'appartiennent plus à ce bloc
      cleanedFocusItems = cleanedFocusItems.filter(ft => {
        if (!ft || !ft.parentEventId) return true;
        const isChildOfThis = String(ft.parentEventId) === String(targetFocusId) || String(ft.parentEventId) === String(pt.id);
        if (isChildOfThis) {
          return validSubIds.has(String(ft.id));
        }
        return true;
      });

      if (Array.isArray(pt.subtasks) && pt.subtasks.length > 0) {
        pt.subtasks.forEach(st => {
          if (!st || !st.id || allDismissed.includes(String(st.id))) return;

          let existingSub = cleanedFocusItems.find(ft => String(ft.id) === String(st.id));
          if (existingSub) {
            existingSub.completed = !!st.completed;
            if (st.title) existingSub.title = st.title;
            existingSub.parentEventId = String(targetFocusId);
          } else {
            cleanedFocusItems.push({
              id: st.id,
              title: st.title || 'Subtask',
              category: catMap[st.context] || catMap[pt.context] || 'Work',
              estimate: 1,
              duration: 30,
              completed: !!st.completed,
              isFavorite: false,
              isEvent: false,
              parentEventId: String(targetFocusId),
              scheduledDate: pt.date || null,
              scheduledTime: null
            });
          }
        });
      }
    });

    // Incorporer les mises à jour locales de span_tasks si présentes
    let localFocusItems = [];
    try {
      localFocusItems = JSON.parse(localStorage.getItem('span_tasks')) || [];
    } catch (e) {}

    if (Array.isArray(localFocusItems) && localFocusItems.length > 0) {
      const localFocusMap = new Map();
      localFocusItems.forEach(lft => {
        if (lft && lft.id) localFocusMap.set(String(lft.id), lft);
      });

      cleanedFocusItems.forEach(ft => {
        if (!ft || !ft.id) return;
        const match = localFocusMap.get(String(ft.id));
        if (match) {
          if (typeof match.isFavorite === 'boolean') ft.isFavorite = match.isFavorite;
        }
      });
    }


    const updatedTasksObj = {
      ...existingTasksObj,
      items: cleanedFocusItems,
      plan_items: (window.SpanPlanState && window.SpanPlanState.tasks) || [],
      dismissed_ids: allDismissed
    };

    const payload = {
      id: SYNC_USER_ID,
      tasks: updatedTasksObj,
      updated_at: new Date().toISOString()
    };
    await supabaseClient.from('user_state').upsert(payload);

    // Synchronisation miroir vers user_sync (Architecture Zero-Knowledge / Stock Tracker)
    try {
      const pinHash = localStorage.getItem('span_pin_hash') || null;
      let recHash = null;
      if (typeof SpanSecurity !== 'undefined' && SpanSecurity.getOrCreateRecoveryKey && typeof sha256 === 'function') {
        recHash = await sha256(SpanSecurity.getOrCreateRecoveryKey());
      }
      const syncDataPayload = {
        tasks: (window.SpanPlanState && window.SpanPlanState.tasks) || [],
        pin_hash: pinHash,
        recovery_hash: recHash,
        updated_at: new Date().toISOString()
      };
      await supabaseClient.from('user_sync').upsert({
        id: SYNC_USER_ID,
        data: syncDataPayload,
        updated_at: new Date().toISOString()
      });
    } catch (syncErr) {
      console.warn('user_sync table write warning:', syncErr.message);
    }
  } catch (err) {
    console.warn('Cloud sync write warning:', err.message);
  } finally {
    setTimeout(() => {
      isCloudSyncInProgress = false;
    }, 1200);
  }
}

// FUSION INTELLIGENTE ET APPLICATION DIRECTE
async function loadPlanFromCloud() {
  if (!supabaseClient) return;
  try {
    // 0. Synchronisation des paramètres de sécurité depuis user_sync
    try {
      const { data: syncRow } = await supabaseClient
        .from('user_sync')
        .select('data')
        .eq('id', SYNC_USER_ID)
        .maybeSingle();

      if (syncRow && syncRow.data) {
        const remoteData = syncRow.data;
        if (remoteData.pin_hash && !localStorage.getItem('span_pin_hash')) {
          localStorage.setItem('span_pin_hash', remoteData.pin_hash);
          if (typeof SpanSecurity !== 'undefined' && SpanSecurity.isAppLocked()) {
            SpanSecurity.showLockScreen();
          }
        }
        if (remoteData.recovery_hash) {
          sessionStorage.setItem('span_remote_recovery_hash', remoteData.recovery_hash);
        }
        if (typeof SpanSecurity !== 'undefined' && SpanSecurity.updateSecurityUI) {
          SpanSecurity.updateSecurityUI();
        }
      }
    } catch (secErr) {
      console.warn('user_sync read check warning:', secErr.message);
    }

    const { data, error } = await supabaseClient
      .from('user_state')
      .select('tasks')
      .eq('id', SYNC_USER_ID)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('Cloud sync read warning:', error.message);
      return;
    }

    if (data && data.tasks) {
      let focusTasks = [];
      let planTasks = [];

      if (Array.isArray(data.tasks)) {
        focusTasks = data.tasks;
      } else if (data.tasks && typeof data.tasks === 'object') {
        focusTasks = data.tasks.items || [];
        planTasks = data.tasks.plan_items || [];
      }

      // Fusionner les listes de tâches supprimées / ignorées
      let localDismissed = [];
      try {
        localDismissed = JSON.parse(localStorage.getItem('span_plan_dismissed_focus_ids')) || [];
      } catch (e) {}
      const remoteDismissed = Array.isArray(data.tasks.dismissed_ids) ? data.tasks.dismissed_ids : [];
      const allDismissed = new Set([...localDismissed, ...remoteDismissed]);
      localStorage.setItem('span_plan_dismissed_focus_ids', JSON.stringify(Array.from(allDismissed)));

      const isDismissed = (t) => {
        if (!t) return true;
        if (t.id && allDismissed.has(t.id)) return true;
        if (t.focusId && allDismissed.has(t.focusId)) return true;
        return false;
      };

      const isMockSampleTask = (t) => {
        if (!t || !t.id) return true;
        const title = (t.title || '').trim().toLowerCase();
        if (t.id === 'p_sample_today_1' || t.id === 'p_sample_today_2' || t.id === 'sub_standup_1') return true;
        if (title === 'team standup meeting #work' || title === 'grocery shopping #life' || title === 'grocery shopping #home' || title === 'préparer mes 3 points clés #work') return true;
        return false;
      };

      // 1. D'ABORD : Restaurer le calendrier complet Plan depuis le cloud (plan_items)
      if (planTasks && Array.isArray(planTasks)) {
        isCloudSyncInProgress = true;

        // Éliminer les tâches tests mock ET les tâches supprimées
        const cleanRemoteTasks = planTasks.filter(t => !isMockSampleTask(t) && !isDismissed(t));
        const localTasks = ((window.SpanPlanState && window.SpanPlanState.tasks) || []).filter(t => !isMockSampleTask(t) && !isDismissed(t));

        const localTasksMap = new Map();
        localTasks.forEach(task => {
          if (task && task.id) localTasksMap.set(task.id, task);
        });

        const mergedMap = new Map();

        // 1. Examiner les tâches distantes du cloud
        cleanRemoteTasks.forEach(remoteTask => {
          if (!remoteTask || !remoteTask.id) return;
          const localTask = localTasksMap.get(remoteTask.id);
          if (!localTask) {
            mergedMap.set(remoteTask.id, remoteTask);
          } else {
            // Fusion intelligente : protéger les sous-tâches et modifications locales récentes
            const localSubtasks = Array.isArray(localTask.subtasks) ? localTask.subtasks : [];
            const remoteSubtasks = Array.isArray(remoteTask.subtasks) ? remoteTask.subtasks : [];
            
            const remoteIsNewer = Boolean(
              !localTask.updated_at ||
              (remoteTask.updated_at && new Date(remoteTask.updated_at).getTime() >= new Date(localTask.updated_at).getTime())
            );

            let finalSubtasks = remoteSubtasks;
            if (!remoteIsNewer) {
              const mergedSubtasks = remoteSubtasks.map(rsub => {
                const lmatch = localSubtasks.find(lsub => String(lsub.id) === String(rsub.id));
                if (lmatch) {
                  return {
                    ...rsub,
                    title: lmatch.title || rsub.title,
                    actionType: lmatch.actionType !== undefined ? lmatch.actionType : rsub.actionType,
                    completed: (typeof lmatch.completed === 'boolean') ? lmatch.completed : rsub.completed
                  };
                }
                return rsub;
              });
              localSubtasks.forEach(lsub => {
                if (lsub && lsub.id && !mergedSubtasks.some(m => String(m.id) === String(lsub.id))) {
                  mergedSubtasks.push(lsub);
                }
              });
              finalSubtasks = mergedSubtasks;
            } else {
              finalSubtasks = remoteSubtasks;
            }

            const winner = remoteIsNewer 
              ? { ...remoteTask, subtasks: finalSubtasks } 
              : { ...localTask, subtasks: finalSubtasks };

            mergedMap.set(remoteTask.id, winner);
          }
        });

        // 2. Fusionner les tâches créées localement qui ne sont pas encore sur le cloud
        localTasks.forEach(task => {
          if (task && task.id && !mergedMap.has(task.id)) {
            mergedMap.set(task.id, task);
          }
        });

        const mergedList = Array.from(mergedMap.values());
        window.SpanPlanState.tasks = mergedList;
        localStorage.setItem('span_plan_tasks', JSON.stringify(mergedList));
      }

      // 2. ENSUITE : Rapprocher les tâches Span Focus sans créer de doublons ni réinsérer les supprimées
      if (focusTasks && focusTasks.length > 0) {
        const cleanFocusTasks = focusTasks.filter(ft => !isMockSampleTask(ft) && !isDismissed(ft));
        try {
          localStorage.setItem('span_tasks', JSON.stringify(cleanFocusTasks));
        } catch (e) {}

        if (typeof syncFocusTasksToPlanBacklog === 'function') {
          syncFocusTasksToPlanBacklog(false, cleanFocusTasks);
        }
      }

      // Mettre à jour le stockage local propre
      localStorage.setItem('span_plan_tasks', JSON.stringify(window.SpanPlanState.tasks));

      if (typeof executeAutoRollover === 'function') executeAutoRollover();
      if (typeof renderPlanGrid === 'function') renderPlanGrid(true);
      if (typeof renderDateStrip === 'function') renderDateStrip();
      if (typeof renderBacklogDrawer === 'function') renderBacklogDrawer();
      if (typeof updateCounters === 'function') updateCounters();
    }
  } catch (err) {
    console.warn('Cloud sync merge bypass:', err.message);
  } finally {
    isCloudSyncInProgress = false;
  }
}

// ABONNEMENT EN TEMPS RÉEL (WEBSOCKET SUPABASE)
function setupRealtimeSubscription() {
  if (!supabaseClient) return;

  if (realtimeSubscription) {
    supabaseClient.removeChannel(realtimeSubscription);
  }

  realtimeSubscription = supabaseClient
    .channel('realtime_span_plan_' + SYNC_USER_ID)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_state',
        filter: `id=eq.${SYNC_USER_ID}`
      },
      (payload) => {
        // Ignorer l'écho immédiat de notre propre écriture (moins de 1.5s)
        if (Date.now() - lastPlanCloudWriteTime < 1500) {
          return;
        }
        if (payload.new && payload.new.tasks) {
          if (!isCloudSyncInProgress) {
            loadPlanFromCloud();
          }
        }
      }
    )
    .subscribe();
}

// RÉACTUALISATION AUTOMATIQUE QUAND ON ROUVRE L'APP SUR MOBILE
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadPlanFromCloud();
  }
});

window.addEventListener('focus', () => {
  loadPlanFromCloud();
});

window.addEventListener('DOMContentLoaded', () => {
  updateSyncKeyDisplay();

  const inputKey = document.getElementById('inputSyncKey');
  if (inputKey) {
    inputKey.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      const inputSecret = document.getElementById('inputSyncSecret');
      if (inputSecret) inputSecret.value = val;
    });
  }

  setupRealtimeSubscription();

  setTimeout(() => {
    loadPlanFromCloud();
  }, 150);
});

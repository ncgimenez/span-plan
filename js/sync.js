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

  SYNC_USER_ID = key;
  localStorage.setItem('span_sync_user', key);
  localStorage.setItem('span_account_id', key);
  localStorage.setItem('span_sync_key_manually_set', 'true');
  sessionStorage.removeItem('span_session_unlocked');
  
  syncKeychainInputs(key);
  updateSyncKeyDisplay();

  setupRealtimeSubscription();
  await loadPlanFromCloud();
  if (typeof SpanSecurity !== 'undefined' && SpanSecurity.updateSecurityUI) {
    SpanSecurity.updateSecurityUI();
  }
  if (typeof showToast === 'function') showToast("Span Plan synchronisé avec succès !", 'success');
  else alert("Span Plan linked successfully!");
}

function updateSyncKeyDisplay() {
  const el = document.getElementById('displaySyncKey');
  if (el) el.textContent = SYNC_USER_ID;
  const accEl = document.getElementById('displayAccountId');
  if (accEl) accEl.textContent = SYNC_USER_ID;
  syncKeychainInputs(SYNC_USER_ID);
}

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

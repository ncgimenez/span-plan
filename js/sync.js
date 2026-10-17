// Configuration Supabase partagée avec Span Focus
const SUPABASE_URL = 'https://xzoukiveknyuxmbrcsvb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8g571gv3CFOyJ0lMtaAf4w_CcITQovd';

const supabaseClient = (typeof supabase !== 'undefined') 
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
  : null;

function getOrCreateSyncId() {
  let id = localStorage.getItem('span_sync_user');
  if (!id) {
    id = 'span_' + Math.random().toString(36).substring(2, 8) + '_' + Date.now().toString(36);
    localStorage.setItem('span_sync_user', id);
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

  SYNC_USER_ID = key;
  localStorage.setItem('span_sync_user', key);
  
  syncKeychainInputs(key);
  updateSyncKeyDisplay();

  setupRealtimeSubscription();
  await loadPlanFromCloud();
  if (typeof showToast === 'function') showToast("Span Plan synchronisé avec succès !", 'success');
  else alert("Span Plan linked successfully!");
}

function updateSyncKeyDisplay() {
  const el = document.getElementById('displaySyncKey');
  if (el) el.textContent = SYNC_USER_ID;
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
        if (t.title && allDismissed.has('title:' + t.title.trim().toLowerCase())) return true;
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

        const mergedMap = new Map();

        // 1. Tâches du cloud (source de vérité)
        cleanRemoteTasks.forEach(task => {
          if (task && task.id) mergedMap.set(task.id, task);
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

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

// ENVOI VERS SUPABASE
async function syncPlanToCloud() {
  if (isCloudSyncInProgress || !supabaseClient) return;
  try {
    const { data: existingData } = await supabaseClient
      .from('user_state')
      .select('tasks')
      .eq('id', SYNC_USER_ID)
      .maybeSingle();

    const existingTasksObj = (existingData && existingData.tasks && typeof existingData.tasks === 'object' && !Array.isArray(existingData.tasks))
      ? existingData.tasks
      : {};

    const updatedTasksObj = {
      ...existingTasksObj,
      plan_items: (window.SpanPlanState && window.SpanPlanState.tasks) || []
    };

    const payload = {
      id: SYNC_USER_ID,
      tasks: updatedTasksObj,
      updated_at: new Date().toISOString()
    };
    await supabaseClient.from('user_state').upsert(payload);
  } catch (err) {
    console.warn('Cloud sync write warning:', err.message);
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

      // 1. D'ABORD : Restaurer le calendrier complet Plan depuis le cloud (plan_items)
      if (planTasks && Array.isArray(planTasks)) {
        isCloudSyncInProgress = true;

        const isMockSampleTask = (t) => {
          if (!t || !t.id) return true;
          const title = (t.title || '').trim().toLowerCase();
          if (t.id === 'p_sample_today_1' || t.id === 'p_sample_today_2' || t.id === 'sub_standup_1') return true;
          if (title === 'team standup meeting #work' || title === 'grocery shopping #life' || title === 'grocery shopping #home' || title === 'préparer mes 3 points clés #work') return true;
          return false;
        };

        // Éliminer définitivement toute fausse tâche de test (p_sample_today_1, p_sample_today_2, mock standup)
        const cleanRemoteTasks = planTasks.filter(t => !isMockSampleTask(t));
        const localTasks = ((window.SpanPlanState && window.SpanPlanState.tasks) || []).filter(t => !isMockSampleTask(t));

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

      // 2. ENSUITE : Rapprocher les tâches Span Focus sans créer de doublons
      if (focusTasks && focusTasks.length > 0) {
        try {
          const currentFocus = localStorage.getItem('span_tasks');
          if (!currentFocus || currentFocus === '[]') {
            localStorage.setItem('span_tasks', JSON.stringify(focusTasks));
          }
        } catch (e) {}

        if (typeof syncFocusTasksToPlanBacklog === 'function') {
          syncFocusTasksToPlanBacklog(false, focusTasks);
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
        if (payload.new && payload.new.tasks) {
          // Évite une boucle si c'est cet appareil qui vient d'écrire
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

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
    const payload = {
      id: SYNC_USER_ID,
      plan_tasks: (window.SpanPlanState && window.SpanPlanState.tasks) || [],
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
      .select('plan_tasks')
      .eq('id', SYNC_USER_ID)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.warn('Cloud sync read warning:', error.message);
      return;
    }

    if (data && data.plan_tasks && Array.isArray(data.plan_tasks)) {
      isCloudSyncInProgress = true;

      const localTasks = (window.SpanPlanState && window.SpanPlanState.tasks) || [];
      const remoteTasks = data.plan_tasks;

      // Fusion par ID : respecte les nouveautés distantes et conserve les ajouts récents
      const mergedMap = new Map();

      // On insère d'abord les tâches distantes
      remoteTasks.forEach(task => {
        if (task && task.id) mergedMap.set(task.id, task);
      });

      // On fusionne avec les tâches locales
      localTasks.forEach(task => {
        if (task && task.id) {
          // Si la tâche n'existait pas sur le cloud, on la préserve
          if (!mergedMap.has(task.id)) {
            mergedMap.set(task.id, task);
          }
        }
      });

      const mergedList = Array.from(mergedMap.values());

      window.SpanPlanState.tasks = mergedList;
      localStorage.setItem('span_plan_tasks', JSON.stringify(mergedList));
      
      if (typeof executeAutoRollover === 'function') executeAutoRollover();
      if (typeof renderPlanGrid === 'function') renderPlanGrid();
      if (typeof renderBacklogDrawer === 'function') renderBacklogDrawer();
      if (typeof updateCounters === 'function') updateCounters();

      isCloudSyncInProgress = false;

      // Si le local avait des éléments non encore présents sur le cloud, on synchronise
      if (mergedList.length > remoteTasks.length) {
        syncPlanToCloud();
      }
    }
  } catch (err) {
    console.warn('Cloud sync merge bypass:', err.message);
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
        if (payload.new && payload.new.plan_tasks) {
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

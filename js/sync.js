// Supabase Configuration shared with Span Focus
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

function copyCurrentSyncKey() {
  navigator.clipboard.writeText(SYNC_USER_ID).then(() => {
    alert("Sync key copied to clipboard!");
  }).catch(() => {
    alert("Failed to copy sync key.");
  });
}

// Automatic synchronization between the visible username field and hidden password field
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
  
  // Align secret password field for iOS Keychain prompt
  syncKeychainInputs(key);
  updateSyncKeyDisplay();

  await loadPlanFromCloud();
  alert("Span Plan linked successfully!");
}

function updateSyncKeyDisplay() {
  const el = document.getElementById('displaySyncKey');
  if (el) el.textContent = SYNC_USER_ID;
  syncKeychainInputs(SYNC_USER_ID);
}

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
    console.warn('Cloud sync write error:', err.message);
  }
}

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

    if (data && data.plan_tasks && Array.isArray(data.plan_tasks) && data.plan_tasks.length > 0) {
      isCloudSyncInProgress = true;
      window.SpanPlanState.tasks = data.plan_tasks;
      localStorage.setItem('span_plan_tasks', JSON.stringify(data.plan_tasks));
      
      if (typeof executeAutoRollover === 'function') executeAutoRollover();
      if (typeof renderPlanGrid === 'function') renderPlanGrid();
      if (typeof renderBacklogDrawer === 'function') renderBacklogDrawer();
      if (typeof updateCounters === 'function') updateCounters();
      isCloudSyncInProgress = false;
    }
  } catch (err) {
    console.warn('Cloud sync connection bypass:', err.message);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  updateSyncKeyDisplay();

  // Watch for manual inputs or password manager autofills
  const inputKey = document.getElementById('inputSyncKey');
  if (inputKey) {
    inputKey.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      const inputSecret = document.getElementById('inputSyncSecret');
      if (inputSecret) inputSecret.value = val;
    });
  }

  // Load cloud data asynchronously without locking the UI
  setTimeout(() => {
    loadPlanFromCloud();
  }, 100);
});

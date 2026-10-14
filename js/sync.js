const SUPABASE_URL = 'https://xzoukiveknyuxmbrcsvb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8g571gv3CFOyJ0lMtaAf4w_CcITQovd';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getOrCreateSyncId() {
  let id = localStorage.getItem('span_sync_user');
  if (!id) {
    id = 'span_' + Math.random().toString(36).substring(2, 8) + '_' + Date.now().toString(36);
    localStorage.setItem('span_sync_user', id);
  }
  return id;
}

let SYNC_USER_ID = getOrCreateSyncId();

function copyCurrentSyncKey() {
  navigator.clipboard.writeText(SYNC_USER_ID).then(() => {
    alert("Clé de synchronisation copiée !");
  });
}

async function handleLinkClick() {
  const input = document.getElementById('inputSyncKey');
  if (!input) return;
  const key = input.value.trim();
  if (!key) return;

  SYNC_USER_ID = key;
  localStorage.setItem('span_sync_user', key);
  updateSyncKeyDisplay();
  await loadPlanFromCloud();
  alert("Span Plan connecté au compte !");
}

function updateSyncKeyDisplay() {
  const el = document.getElementById('displaySyncKey');
  if (el) el.textContent = SYNC_USER_ID;
}

async function syncPlanToCloud() {
  try {
    const payload = {
      id: SYNC_USER_ID,
      plan_tasks: window.SpanPlanState.tasks,
      updated_at: new Date().toISOString()
    };
    await supabaseClient.from('user_state').upsert(payload);
  } catch (err) {
    console.error('Erreur cloud plan:', err);
  }
}

async function loadPlanFromCloud() {
  try {
    const { data } = await supabaseClient
      .from('user_state')
      .select('plan_tasks')
      .eq('id', SYNC_USER_ID)
      .single();

    if (data && data.plan_tasks) {
      window.SpanPlanState.tasks = data.plan_tasks;
      localStorage.setItem('span_plan_tasks', JSON.stringify(data.plan_tasks));
      if (typeof renderAllBuckets === 'function') renderAllBuckets();
    }
  } catch (err) {
    console.error('Erreur lecture cloud plan:', err);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  updateSyncKeyDisplay();
  loadPlanFromCloud();
});

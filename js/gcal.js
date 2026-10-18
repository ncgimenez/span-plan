// Google Calendar OAuth 2.0 & Bidirectional Sync for Span Plan
const GCAL_DEFAULT_CLIENT_ID = localStorage.getItem('span_gcal_client_id') || '784381920192-sampleclientid.apps.googleusercontent.com';
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';

let gcalTokenClient = null;
let gcalAccessToken = localStorage.getItem('span_gcal_access_token') || null;
let gcalTokenExpiresAt = parseInt(localStorage.getItem('span_gcal_token_expires') || '0', 10);
let gcalConnectedEmail = localStorage.getItem('span_gcal_email') || '';
let gcalTargetCalendarId = localStorage.getItem('span_gcal_calendar_id') || '';

function isGcalConnected() {
  if (!gcalAccessToken) return false;
  if (Date.now() > gcalTokenExpiresAt) return false;
  return true;
}

// Initialisation de Google Identity Services
function initGoogleAuth() {
  const clientId = localStorage.getItem('span_gcal_client_id') || GCAL_DEFAULT_CLIENT_ID;
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    return;
  }

  try {
    gcalTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GCAL_SCOPE,
      callback: (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          handleGcalTokenSuccess(tokenResponse);
        } else if (tokenResponse && tokenResponse.error) {
          console.error('Google OAuth error:', tokenResponse);
          if (typeof showToast === 'function') {
            showToast('Google OAuth sign-in failed: ' + tokenResponse.error, 'danger');
          }
        }
      }
    });
  } catch (err) {
    console.warn('GCal init error:', err);
  }
}

function handleGcalTokenSuccess(response) {
  gcalAccessToken = response.access_token;
  const expiresInSeconds = parseInt(response.expires_in || '3599', 10);
  gcalTokenExpiresAt = Date.now() + (expiresInSeconds * 1000);

  localStorage.setItem('span_gcal_access_token', gcalAccessToken);
  localStorage.setItem('span_gcal_token_expires', String(gcalTokenExpiresAt));

  // Tenter de récupérer l'email de l'utilisateur
  fetchGoogleUserProfile();

  updateGcalUiState();
  if (typeof showToast === 'function') {
    showToast('Google Calendar connected successfully!', 'success');
  }

  // Lancer la première synchronisation
  syncGoogleCalendar();
}

async function fetchGoogleUserProfile() {
  if (!gcalAccessToken) return;
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${gcalAccessToken}` }
    });
    if (res.ok) {
      const info = await res.json();
      if (info.email) {
        gcalConnectedEmail = info.email;
        localStorage.setItem('span_gcal_email', gcalConnectedEmail);
        updateGcalUiState();
      }
    }
  } catch (e) {
    console.warn('Userinfo fetch warning:', e);
  }
}

function connectGoogleCalendar() {
  const customClientId = localStorage.getItem('span_gcal_client_id');
  
  if (!gcalTokenClient) {
    initGoogleAuth();
  }

  if (!gcalTokenClient) {
    // Si l'utilisateur n'a pas encore configuré de client ID personnalisé
    const promptedId = prompt(
      "Pour connecter Google Calendar, entrez votre Client ID Google OAuth (Web Application) depuis Google Cloud Console :\n\n(Ou cliquez sur OK si vous souhaitez utiliser le Client ID par défaut)",
      customClientId || ""
    );
    if (promptedId && promptedId.trim()) {
      localStorage.setItem('span_gcal_client_id', promptedId.trim());
      initGoogleAuth();
    }
  }

  if (gcalTokenClient) {
    gcalTokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    alert("Veuillez renseigner un Client ID Google Cloud OAuth valide dans les réglages.");
  }
}

function disconnectGoogleCalendar() {
  if (gcalAccessToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
    try {
      google.accounts.oauth2.revoke(gcalAccessToken, () => {});
    } catch (e) {}
  }

  gcalAccessToken = null;
  gcalTokenExpiresAt = 0;
  gcalConnectedEmail = '';
  gcalTargetCalendarId = '';

  localStorage.removeItem('span_gcal_access_token');
  localStorage.removeItem('span_gcal_token_expires');
  localStorage.removeItem('span_gcal_email');
  localStorage.removeItem('span_gcal_calendar_id');

  updateGcalUiState();
  if (typeof showToast === 'function') {
    showToast('Google Calendar disconnected', 'info');
  }
}

// Trouver ou créer le calendrier dédié "Span Plan"
async function getOrCreateSpanCalendar() {
  if (!gcalAccessToken) return null;
  if (gcalTargetCalendarId) return gcalTargetCalendarId;

  try {
    // 1. Lister les calendriers existants
    const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${gcalAccessToken}` }
    });
    
    if (listRes.ok) {
      const data = await listRes.json();
      const existing = (data.items || []).find(c => c.summary === 'Span Plan');
      if (existing) {
        gcalTargetCalendarId = existing.id;
        localStorage.setItem('span_gcal_calendar_id', gcalTargetCalendarId);
        return gcalTargetCalendarId;
      }
    }

    // 2. Créer le calendrier "Span Plan" s'il n'existe pas
    const createRes = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gcalAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary: 'Span Plan',
        description: 'Synchronized time blocks and schedule from Span Plan',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'
      })
    });

    if (createRes.ok) {
      const newCal = await createRes.json();
      gcalTargetCalendarId = newCal.id;
      localStorage.setItem('span_gcal_calendar_id', gcalTargetCalendarId);
      return gcalTargetCalendarId;
    }
  } catch (err) {
    console.error('Failed to get or create Span Calendar:', err);
  }

  // Repli sur le calendrier principal si la création échoue
  return 'primary';
}

// Synchronisation bidirectionnelle
async function syncGoogleCalendar() {
  if (!isGcalConnected()) {
    connectGoogleCalendar();
    return;
  }

  const syncBtn = document.getElementById('btnGcalSyncNow');
  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.innerHTML = '🔄 Syncing...';
  }

  try {
    const calendarId = await getOrCreateSpanCalendar();
    if (!calendarId) throw new Error('Impossible to access Google Calendar');

    // SENS 1 : Pousser les blocs Span vers Google Calendar
    await pushSpanBlocksToGoogle(calendarId);

    // SENS 2 : Télécharger les nouveaux événements de Google vers Span
    await pullGoogleEventsToSpan(calendarId);

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    localStorage.setItem('span_gcal_last_sync', timeStr);

    if (typeof showToast === 'function') {
      showToast(`Google Calendar synced (${timeStr})`, 'success');
    }
  } catch (err) {
    console.error('GCal Sync error:', err);
    if (typeof showToast === 'function') {
      showToast('Calendar sync warning: ' + err.message, 'danger');
    }
  } finally {
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.innerHTML = '🔄 Sync Now';
    }
    updateGcalUiState();
  }
}

// Couleurs officielles Google Calendar :
// 9 = Blueberry / Lavande (Work) 🟣
// 10 = Basil / Émeraude (Life) 🟢
// 11 = Flamingo / Rose (Fun) 🔴
function getGcalColorIdForContext(context) {
  switch ((context || 'work').toLowerCase()) {
    case 'life': return '10';
    case 'fun':  return '11';
    case 'work':
    default:     return '9';
  }
}

function getCategoryDot(context) {
  switch ((context || 'work').toLowerCase()) {
    case 'life': return '🟢';
    case 'fun':  return '🔴';
    case 'work':
    default:     return '🟣';
  }
}

async function pushSpanBlocksToGoogle(calendarId) {
  const allTasks = (window.SpanPlanState && window.SpanPlanState.tasks) || [];
  const scheduledTasks = allTasks.filter(t => !!t.date && !!t.time);

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';

  for (const task of scheduledTasks) {
    // Calculer les heures ISO
    const startIso = `${task.date}T${task.time}:00`;
    const [h, m] = task.time.split(':').map(Number);
    const duration = task.duration || 45;
    const endMinutesTotal = h * 60 + m + duration;
    const endH = String(Math.floor(endMinutesTotal / 60)).padStart(2, '0');
    const endM = String(endMinutesTotal % 60).padStart(2, '0');
    const endIso = `${task.date}T${endH}:${endM}:00`;

    const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    let description = task.type === 'event' ? '📅 Span Event' : '📋 Span Task';
    if (subtasks.length > 0) {
      description += '\n\nChecklist:\n' + subtasks.map(s => `[${s.completed ? 'x' : ' '}] ${s.title}`).join('\n');
    }

    const payload = {
      summary: `${getCategoryDot(task.context)} ${task.title}`,
      description: description,
      colorId: getGcalColorIdForContext(task.context),
      start: { dateTime: new Date(startIso).toISOString(), timeZone: timeZone },
      end: { dateTime: new Date(endIso).toISOString(), timeZone: timeZone }
    };

    try {
      if (task.gcalEventId) {
        // Mettre à jour l'événement existant
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${task.gcalEventId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${gcalAccessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      } else {
        // Créer l'événement
        const createRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${gcalAccessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        if (createRes.ok) {
          const created = await createRes.json();
          task.gcalEventId = created.id;
        }
      }
    } catch (e) {
      console.warn(`Error pushing task ${task.id} to GCal:`, e);
    }
  }

  // Sauvegarder les gcalEventId associés
  if (typeof savePlanState === 'function') {
    savePlanState();
  }
}

async function pullGoogleEventsToSpan(calendarId) {
  try {
    const timeMin = new Date(Date.now() - (7 * 24 * 3600 * 1000)).toISOString();
    const timeMax = new Date(Date.now() + (30 * 24 * 3600 * 1000)).toISOString();

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true`, {
      headers: { Authorization: `Bearer ${gcalAccessToken}` }
    });

    if (!res.ok) return;

    const data = await res.json();
    const remoteEvents = data.items || [];
    const allTasks = (window.SpanPlanState && window.SpanPlanState.tasks) || [];

    let importedCount = 0;

    remoteEvents.forEach(evt => {
      if (!evt.start || (!evt.start.dateTime && !evt.start.date)) return;
      
      // Vérifier si cet événement existe déjà dans Span
      const existing = allTasks.find(t => t.gcalEventId === evt.id || (t.id && t.id === evt.id));
      if (existing) return;

      // Extraire date et heure
      const rawStart = evt.start.dateTime || `${evt.start.date}T09:00:00`;
      const dateObj = new Date(rawStart);
      const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      const timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;

      // Calcul de la durée
      let duration = 45;
      if (evt.end && evt.end.dateTime) {
        const endObj = new Date(evt.end.dateTime);
        const diffMinutes = Math.round((endObj.getTime() - dateObj.getTime()) / 60000);
        if (diffMinutes > 0) duration = diffMinutes;
      }

      // Détecter le contexte selon la couleur ou le titre
      let context = 'work';
      if (evt.colorId === '10' || (evt.summary && evt.summary.includes('🟢'))) context = 'life';
      else if (evt.colorId === '11' || (evt.summary && evt.summary.includes('🔴'))) context = 'fun';

      // Nettoyer le titre
      let cleanTitle = (evt.summary || 'Google Event').replace(/^[🟣🟢🔴]\s*/, '').trim();

      const newEvent = {
        id: 'gcal_' + evt.id,
        gcalEventId: evt.id,
        title: cleanTitle,
        type: 'event',
        date: dateStr,
        time: timeStr,
        duration: duration,
        context: context,
        completed: false,
        subtasks: []
      };

      allTasks.push(newEvent);
      importedCount++;
    });

    if (importedCount > 0 && typeof savePlanState === 'function') {
      savePlanState();
    }
  } catch (e) {
    console.warn('Error pulling events from GCal:', e);
  }
}

function updateGcalUiState() {
  const connected = isGcalConnected();
  const badge = document.getElementById('gcalStatusBadge');
  const btnConnect = document.getElementById('btnGcalConnect');
  const btnDisconnect = document.getElementById('btnGcalDisconnect');
  const syncBtn = document.getElementById('btnGcalSyncNow');
  const detailsBox = document.getElementById('gcalConnectedDetails');
  const emailSpan = document.getElementById('gcalConnectedEmail');
  const lastSyncSpan = document.getElementById('gcalLastSyncTime');

  if (badge) {
    badge.className = `sync-status-badge ${connected ? 'live' : ''}`;
    badge.textContent = connected ? '● Connected' : '○ Not connected';
  }

  if (btnConnect) btnConnect.style.display = connected ? 'none' : 'inline-flex';
  if (btnDisconnect) btnDisconnect.style.display = connected ? 'inline-flex' : 'none';
  if (syncBtn) syncBtn.style.display = connected ? 'inline-flex' : 'none';
  if (detailsBox) detailsBox.style.display = connected ? 'flex' : 'none';

  if (emailSpan && connected) {
    emailSpan.textContent = gcalConnectedEmail || 'Google Account';
  }

  if (lastSyncSpan) {
    const last = localStorage.getItem('span_gcal_last_sync');
    lastSyncSpan.textContent = last ? `Last sync: ${last}` : 'Never synced';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    initGoogleAuth();
    updateGcalUiState();
  }, 200);
});

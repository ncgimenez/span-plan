// Google Calendar OAuth 2.0 & Bidirectional Sync for Span Plan
const GCAL_DEFAULT_CLIENT_ID = '720058518059-jo6mru0q8htqt4k7armu4bhfqojols0o.apps.googleusercontent.com';
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events email';

let gcalTokenClient = null;
let gcalAccessToken = localStorage.getItem('span_gcal_access_token') || null;
let gcalTokenExpiresAt = parseInt(localStorage.getItem('span_gcal_token_expires') || '0', 10);
let gcalConnectedEmail = localStorage.getItem('span_gcal_email') || '';
let gcalTargetCalendarId = localStorage.getItem('span_gcal_calendar_id') || 'auto_span';
let isCalendarsListLoaded = false;

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
            showToast('Google OAuth sign-in failed: ' + (tokenResponse.error_description || tokenResponse.error), 'danger');
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

function toggleGcalConfigBox() {
  const box = document.getElementById('gcalClientIdConfigBox');
  if (!box) return;
  box.style.display = box.style.display === 'none' ? 'flex' : 'none';
  if (box.style.display === 'flex') {
    const input = document.getElementById('inputGcalClientId');
    if (input) {
      input.value = localStorage.getItem('span_gcal_client_id') || GCAL_DEFAULT_CLIENT_ID;
      input.focus();
    }
  }
}

function saveCustomGcalClientId() {
  const input = document.getElementById('inputGcalClientId');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  localStorage.setItem('span_gcal_client_id', val);
  initGoogleAuth();
  const box = document.getElementById('gcalClientIdConfigBox');
  if (box) box.style.display = 'none';
  if (typeof showToast === 'function') {
    showToast('Client ID enregistré ! Lancement de la connexion...', 'success');
  }
  setTimeout(connectGoogleCalendar, 150);
}

function connectGoogleCalendar() {
  const activeClientId = localStorage.getItem('span_gcal_client_id') || GCAL_DEFAULT_CLIENT_ID;
  
  if (!activeClientId || activeClientId.includes('sampleclientid')) {
    toggleGcalConfigBox();
    if (typeof showToast === 'function') {
      showToast('Entrez votre Google Client ID ci-dessous', 'info');
    }
    return;
  }

  if (!gcalTokenClient) {
    initGoogleAuth();
  }

  if (gcalTokenClient) {
    gcalTokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      if (typeof showToast === 'function') {
        showToast("Chargement de Google Identity Services en cours, veuillez patienter un instant...", 'info');
      } else {
        alert("Chargement de Google Identity Services en cours, réessayez dans quelques secondes...");
      }
    } else {
      alert("Impossible d'initialiser Google Identity Services. Vérifiez votre Client ID.");
    }
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
  gcalTargetCalendarId = 'auto_span';
  isCalendarsListLoaded = false;

  localStorage.removeItem('span_gcal_access_token');
  localStorage.removeItem('span_gcal_token_expires');
  localStorage.removeItem('span_gcal_email');
  localStorage.removeItem('span_gcal_calendar_id');

  const select = document.getElementById('selectGcalTargetCalendar');
  if (select) {
    select.innerHTML = `
      <option value="auto_span">📅 Calendrier dédié "Span Plan" (Isolé - Recommandé)</option>
      <option value="primary">👤 Mon calendrier principal</option>
    `;
    select.value = 'auto_span';
  }
  const helperBox = document.getElementById('gcalTargetHelperBox');
  if (helperBox) {
    helperBox.style.display = 'none';
  }

  updateGcalUiState();
  if (typeof showToast === 'function') {
    showToast('Google Calendar disconnected', 'info');
  }
}

// GESTION DU CALENDRIER CIBLE (DÉDIÉ SPAN PLAN OU PRINCIPAL)
async function loadUserCalendarsList() {
  if (!gcalAccessToken) return [];
  try {
    const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${gcalAccessToken}` }
    });
    if (listRes.ok) {
      const data = await listRes.json();
      const items = data.items || [];
      
      const primary = items.find(c => c.primary);
      if (primary && primary.id && !gcalConnectedEmail) {
        gcalConnectedEmail = primary.id;
        localStorage.setItem('span_gcal_email', gcalConnectedEmail);
      }

      renderCalendarPickerUI(items);
      isCalendarsListLoaded = true;
      return items;
    }
  } catch (e) {
    console.warn('Failed to load user calendars:', e);
  }
  return [];
}
window.loadUserCalendarsList = loadUserCalendarsList;

function renderCalendarPickerUI(items = []) {
  const select = document.getElementById('selectGcalTargetCalendar');
  const helperBox = document.getElementById('gcalTargetHelperBox');
  if (!select) return;

  const savedTarget = localStorage.getItem('span_gcal_calendar_id') || 'auto_span';
  const spanCal = items.find(c => c.summary === 'Span Plan');

  let html = '';
  if (spanCal) {
    html += `<option value="${spanCal.id}" ${(savedTarget === spanCal.id || savedTarget === 'auto_span') ? 'selected' : ''}>📅 Calendrier dédié "Span Plan" (Isolé - Recommandé)</option>`;
  } else {
    html += `<option value="auto_span" ${savedTarget === 'auto_span' ? 'selected' : ''}>📅 Calendrier dédié "Span Plan" (Isolé - Recommandé)</option>`;
  }

  items.forEach(c => {
    if (spanCal && c.id === spanCal.id) return;
    const isPrimary = !!c.primary;
    const label = isPrimary ? `👤 Mon calendrier principal (${c.summary || c.id})` : `📁 ${c.summary || c.id}`;
    const isSelected = (savedTarget === c.id) || (isPrimary && savedTarget === 'primary');
    html += `<option value="${c.id}" ${isSelected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  });

  select.innerHTML = html;

  if (helperBox) {
    if (!spanCal && (savedTarget === 'auto_span' || !savedTarget)) {
      helperBox.style.display = 'block';
      helperBox.innerHTML = `
        <div style="font-size: 11px; color: var(--text-muted); background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.2); padding: 8px 10px; border-radius: 8px; margin-top: 6px; line-height: 1.4;">
          💡 <strong>Calendrier 100% séparé :</strong> Vos blocs seront créés dans un calendrier isolé « Span Plan ». Si vous ne le voyez pas encore, vous pouvez aussi le créer en 5 secondes sur <a href="https://calendar.google.com/calendar/u/0/r/settings/createcalendar" target="_blank" style="color: #818cf8; text-decoration: underline;">Google Agenda</a> (<em>Autres agendas ➔ + ➔ Créer un agenda "Span Plan"</em>).
        </div>
      `;
    } else {
      helperBox.style.display = 'none';
    }
  }
}
window.renderCalendarPickerUI = renderCalendarPickerUI;

function handleGcalTargetCalendarChange(value) {
  gcalTargetCalendarId = value;
  localStorage.setItem('span_gcal_calendar_id', value);
  const helperBox = document.getElementById('gcalTargetHelperBox');
  if (helperBox) {
    helperBox.style.display = value === 'auto_span' ? 'block' : 'none';
  }
  if (typeof showToast === 'function') {
    const label = (value === 'auto_span' || value.includes('Span Plan')) ? 'Calendrier dédié Span Plan' : 'Calendrier sélectionné';
    showToast(`Calendrier cible : ${label}`, 'info');
  }
}
window.handleGcalTargetCalendarChange = handleGcalTargetCalendarChange;

// Trouver ou créer le calendrier dédié "Span Plan"
async function getOrCreateSpanCalendar() {
  if (!gcalAccessToken) return null;
  const savedTarget = localStorage.getItem('span_gcal_calendar_id') || gcalTargetCalendarId || 'auto_span';

  // 1. Si l'utilisateur a explicitement choisi un calendrier précis existant (qui n'est pas 'auto_span')
  if (savedTarget && savedTarget !== 'auto_span') {
    return savedTarget;
  }

  try {
    // 2. Vérifier si le calendrier "Span Plan" existe déjà dans le compte de l'utilisateur
    const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${gcalAccessToken}` }
    });
    
    if (listRes.ok) {
      const data = await listRes.json();
      const items = data.items || [];
      const primary = items.find(c => c.primary);
      if (primary && primary.id && !gcalConnectedEmail) {
        gcalConnectedEmail = primary.id;
        localStorage.setItem('span_gcal_email', gcalConnectedEmail);
        updateGcalUiState();
      }

      const existing = items.find(c => c.summary === 'Span Plan');
      if (existing) {
        gcalTargetCalendarId = existing.id;
        localStorage.setItem('span_gcal_calendar_id', gcalTargetCalendarId);
        renderCalendarPickerUI(items);
        return gcalTargetCalendarId;
      }
    }

    // 3. Tenter de créer automatiquement le calendrier dédié "Span Plan"
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
      loadUserCalendarsList();
      return gcalTargetCalendarId;
    }
  } catch (err) {
    console.warn('Dedicated calendar creation check:', err);
  }

  // 4. Si la création automatique échoue (parce que l'accès restreint protège les calendriers),
  // on ne pollue JAMAIS le calendrier principal sans confirmation explicite de l'utilisateur !
  const shouldUsePrimary = confirm(
    "Le calendrier dédié 'Span Plan' n'a pas encore été trouvé dans votre Google Agenda.\n\n" +
    "• Cliquez sur 'OK' pour synchroniser temporairement sur votre calendrier principal.\n" +
    "• Cliquez sur 'Annuler' pour ouvrir Google Agenda et créer le calendrier dédié 'Span Plan' en 5 secondes (recommandé)."
  );

  if (shouldUsePrimary) {
    gcalTargetCalendarId = 'primary';
    localStorage.setItem('span_gcal_calendar_id', 'primary');
    loadUserCalendarsList();
    return 'primary';
  } else {
    window.open('https://calendar.google.com/calendar/u/0/r/settings/createcalendar', '_blank');
    return null;
  }
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
  // Exporter STRICTEMENT les événements réels (Option A)
  const scheduledTasks = allTasks.filter(t => t.type === 'event' && !!t.date && (!!t.time || !!t.allDay));

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';

  for (const task of scheduledTasks) {
    let startObj, endObj;

    if (task.allDay || !task.time) {
      const [y, m, d] = (task.endDate || task.date).split('-').map(Number);
      const nextDay = new Date(y, m - 1, d + 1);
      const endDStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
      startObj = { date: task.date };
      endObj = { date: endDStr };
    } else {
      const startIso = `${task.date}T${task.time}:00`;
      const [h, m] = task.time.split(':').map(Number);
      const duration = task.duration || 30;
      const endMinutesTotal = h * 60 + m + duration;
      const endH = String(Math.floor(endMinutesTotal / 60)).padStart(2, '0');
      const endM = String(endMinutesTotal % 60).padStart(2, '0');
      const endIso = `${task.date}T${endH}:${endM}:00`;
      startObj = { dateTime: new Date(startIso).toISOString(), timeZone: timeZone };
      endObj = { dateTime: new Date(endIso).toISOString(), timeZone: timeZone };
    }

    const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    let descParts = [];
    if (task.notes && task.notes.trim()) {
      descParts.push(task.notes.trim());
    }
    if (subtasks.length > 0) {
      descParts.push('Checklist:\n' + subtasks.map(s => `[${s.completed ? 'x' : ' '}] ${s.title}`).join('\n'));
    }
    descParts.push('📅 Span Event');
    const description = descParts.join('\n\n');

    const payload = {
      summary: `${getCategoryDot(task.context)} ${task.title}`,
      description: description,
      location: task.location || '',
      colorId: getGcalColorIdForContext(task.context),
      start: startObj,
      end: endObj
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
        location: evt.location || '',
        notes: evt.description || '',
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

  if (connected && !isCalendarsListLoaded) {
    loadUserCalendarsList();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  let attempts = 0;
  const pollInit = () => {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
      initGoogleAuth();
      updateGcalUiState();
    } else if (attempts < 15) {
      attempts++;
      setTimeout(pollInit, 250);
    }
  };
  pollInit();
  updateGcalUiState();
});

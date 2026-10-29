// ==============================================================
// SPAN PLAN - CALENDAR LAYOUT & GRID RENDERING ENGINE
// ==============================================================

function formatMinutesDuration(totalM) {
  if (totalM <= 0) return '0h';
  const h = Math.floor(totalM / 60);
  const m = totalM % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function getTaskDurationOnDate(t, dateStr) {
  const dur = t.duration || 30;
  if (!t.time || !dateStr) return dur;
  const startM = timeToMinutes(t.time);
  if (startM + dur > 1440) {
    if (dateStr === t.date) return Math.max(0, 1440 - startM);
    if (dateStr > t.date) return Math.max(0, Math.min(1440, (startM + dur) - 1440));
  }
  return dur;
}

function renderDayCapacityHtml(timedTasks, dateStr = null) {
  const workM = timedTasks.filter(t => t.context === 'work').reduce((acc, t) => acc + getTaskDurationOnDate(t, dateStr), 0);
  const lifeM = timedTasks.filter(t => t.context === 'life').reduce((acc, t) => acc + getTaskDurationOnDate(t, dateStr), 0);
  const funM  = timedTasks.filter(t => t.context === 'fun').reduce((acc, t) => acc + getTaskDurationOnDate(t, dateStr), 0);
  const totalM = workM + lifeM + funM;

  if (totalM <= 0) return ''; // Pas de texte encombrant ni de barre inutile si journée libre

  const maxBudget = Math.max(480, totalM); // Baseline 8h
  const pctWork = Math.min(100, (workM / maxBudget) * 100);
  const pctLife = Math.min(100, (lifeM / maxBudget) * 100);
  const pctFun  = Math.min(100, (funM  / maxBudget) * 100);

  const breakdownTitle = `${timedTasks.length} item${timedTasks.length > 1 ? 's' : ''} scheduled • Work: ${formatMinutesDuration(workM)} · Life: ${formatMinutesDuration(lifeM)} · Fun: ${formatMinutesDuration(funM)}`;

  return `
    <div class="cal-day-capacity-pill" title="${breakdownTitle}">
      <span class="capacity-total-txt">${formatMinutesDuration(totalM)}</span>
      <div class="capacity-mini-bar">
        <span class="cap-bar-seg seg-work" style="width: ${pctWork}%;"></span>
        <span class="cap-bar-seg seg-life" style="width: ${pctLife}%;"></span>
        <span class="cap-bar-seg seg-fun"  style="width: ${pctFun}%;"></span>
      </div>
    </div>
  `;
}

function handleCanvasHoverMove(e) {
  if (isPointerDragging || hasMovedBeyondThreshold || draggedTaskId || window.draggedSubtaskInfo || window.draggedBatchSubtasksInfo || isDrawingMarquee) {
    const existing = document.getElementById('gridHoverSlot');
    if (existing) existing.remove();
    return;
  }
  if (e.target.closest('.schedule-block-item') || e.target.closest('.resize-handle') || e.target.closest('.now-timeline-marker')) {
    const existing = document.getElementById('gridHoverSlot');
    if (existing) existing.remove();
    return;
  }

  const canvas = e.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const offsetY = Math.max(0, e.clientY - rect.top);

  let minutes = Math.round((offsetY / HOUR_HEIGHT) * 60);
  minutes = Math.round(minutes / 15) * 15;
  minutes = Math.max(0, Math.min(23 * 60 + 45, minutes));

  const top = ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');

  let slot = document.getElementById('gridHoverSlot');
  if (!slot) {
    slot = document.createElement('div');
    slot.id = 'gridHoverSlot';
    canvas.appendChild(slot);
  } else if (slot.parentElement !== canvas) {
    slot.remove();
    canvas.appendChild(slot);
  }

  slot.className = 'grid-hover-slot';
  slot.style.top = `${top}px`;
  slot.innerHTML = `<span class="hover-slot-icon">+</span><span>${h}:${m} (45m)</span>`;
}

function handleCanvasHoverLeave(e) {
  const slot = document.getElementById('gridHoverSlot');
  if (slot) slot.remove();
}

function isMobileScreen() {
  return window.innerWidth <= 768;
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function calculateVisibleDates() {
  const dates = [];
  const count = isMobileScreen() ? 1 : visibleDaysCount;
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + currentTimelineOffset);

  if (count === 7 || count === 5) {
    const monday = getMonday(baseDate);
    for (let i = 0; i < count; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d);
    }
  } else {
    for (let i = 0; i < count; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      dates.push(d);
    }
  }
  return dates;
}

function renderTimeRulerHtml(visibleDates = []) {
  let html = '';
  for (let h = START_HOUR; h <= END_HOUR + 1; h++) {
    const top = (h - START_HOUR) * HOUR_HEIGHT;
    const label = (h === 24 || h === END_HOUR + 1) ? '00:00' : `${String(h).padStart(2, '0')}:00`;
    const isNight = (h < 7 || h >= 24);
    html += `
      <div class="cal-time-label-row ${isNight ? 'is-night' : ''} ${h >= 24 ? 'is-day-end' : ''}" style="top: ${top}px;">
        <span>${label}</span>
      </div>
    `;
  }

  const hasToday = visibleDates.some(d => getLocalDateString(d) === TODAY_STR);
  if (hasToday) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = START_HOUR * 60;
    const endMinutes = (END_HOUR + 1) * 60;
    if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
      const nowTop = Math.round(((currentMinutes - startMinutes) / 60) * HOUR_HEIGHT);
      const currH = String(now.getHours()).padStart(2, '0');
      const currM = String(now.getMinutes()).padStart(2, '0');
      html += `
        <div class="cal-time-now-badge" style="top: ${nowTop}px;" title="Current time: ${currH}:${currM}">
          <span>${currH}:${currM}</span>
        </div>
      `;
    }
  }

  return html;
}

function renderColumnHourLines() {
  let html = '';
  for (let h = START_HOUR; h <= END_HOUR + 1; h++) {
    const top = (h - START_HOUR) * HOUR_HEIGHT;
    const isNight = (h < 7 || h >= 24);
    html += `
      <div class="cal-hour-line ${isNight ? 'is-night' : ''} ${h >= 24 ? 'is-day-end' : ''}" style="top: ${top}px;"></div>
    `;
  }
  return html;
}

function quickAddAllDayPrompt(dateStr) {
  openCreateModalWithDefaults(dateStr, '');
}

function renderAllDayContinuousRibbonHtml(visibleDates) {
  if (!visibleDates || visibleDates.length === 0) return '';
  const visibleDateStrs = visibleDates.map(d => getLocalDateString(d));
  const visStartStr = visibleDateStrs[0];
  const visEndStr = visibleDateStrs[visibleDateStrs.length - 1];

  const allTasks = window.SpanPlanState.tasks || [];
  const items = [];

  allTasks.forEach(task => {
    const isMultiDay = !!(task.date && task.endDate && task.endDate > task.date);
    const isAllDay = !!task.allDay || (!task.time && !!task.date) || isMultiDay;
    if (!isAllDay) return;

    const contextMatch = isTaskCategoryVisible(task);
    const tagMatch = !currentTagFilter || (task.title && task.title.toLowerCase().includes(`#${currentTagFilter.toLowerCase()}`));
    if (!contextMatch || !tagMatch) return;

    const rec = task.recurrence || 'none';

    if (rec === 'none') {
      const tStart = task.date || visStartStr;
      const tEnd = (task.endDate && task.endDate >= tStart) ? task.endDate : tStart;
      if (tEnd < visStartStr || tStart > visEndStr) return;

      let colStart = visibleDateStrs.indexOf(tStart);
      const startsBefore = (colStart === -1);
      if (startsBefore) colStart = 0;

      let colEnd = visibleDateStrs.indexOf(tEnd);
      const endsAfter = (colEnd === -1);
      if (endsAfter) colEnd = visibleDateStrs.length - 1;

      items.push({
        task,
        colStart,
        colEnd,
        spanCols: (colEnd - colStart + 1),
        isMultiDay: isMultiDay || (colEnd > colStart) || startsBefore || endsAfter,
        startsBefore,
        endsAfter
      });
    } else {
      visibleDateStrs.forEach((ds, cIdx) => {
        if (isTaskOccurringOnDate(task, ds)) {
          items.push({
            task,
            colStart: cIdx,
            colEnd: cIdx,
            spanCols: 1,
            isMultiDay: false,
            startsBefore: false,
            endsAfter: false
          });
        }
      });
    }
  });

  // Tri : bannières multi-jours les plus longues en haut, puis par colonne de départ
  items.sort((a, b) => {
    if (b.spanCols !== a.spanCols) return b.spanCols - a.spanCols;
    if (a.colStart !== b.colStart) return a.colStart - b.colStart;
    return (a.task.title || '').localeCompare(b.task.title || '');
  });

  // Algorithme glouton d'affectation des pistes (lignes horizontales)
  const tracks = [];
  items.forEach(item => {
    let assigned = -1;
    for (let r = 0; r < tracks.length; r++) {
      const collision = tracks[r].some(occ => !(item.colEnd < occ.start || item.colStart > occ.end));
      if (!collision) {
        assigned = r;
        tracks[r].push({ start: item.colStart, end: item.colEnd });
        break;
      }
    }
    if (assigned === -1) {
      assigned = tracks.length;
      tracks.push([{ start: item.colStart, end: item.colEnd }]);
    }
    item.track = assigned;
  });

  const totalTracks = Math.max(1, tracks.length);

  const dropCellsHtml = visibleDates.map((dateObj, c) => {
    const dateStr = getLocalDateString(dateObj);
    return `
      <div class="cal-allday-drop-cell" 
           style="grid-column: ${c + 1}; grid-row: 1 / -1;"
           data-date="${dateStr}"
           ondragover="allowDockDrop(event)" 
           ondragleave="removeDockDropHighlight(event)"
           ondrop="handleDropToDock(event, '${dateStr}')"
           onclick="quickAddAllDayPrompt('${dateStr}')"
           title="Click or drop to add all-day event on ${dateStr}">
      </div>
    `;
  }).join('');

  const ribbonsHtml = items.map(item => {
    const { task, colStart, colEnd, isMultiDay, startsBefore, endsAfter, track } = item;
    const isEvent = task.type === 'event';
    const recIcon = (task.recurrence && task.recurrence !== 'none') ? '<span class="recurrence-badge" title="Repeats: ' + task.recurrence + '">🔁</span> ' : '';
    const childSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const doneSubCount = childSubtasks.filter(s => s.completed).length;
    const progressPillHtml = childSubtasks.length > 0 
      ? `<span class="event-progress-pill" onclick="event.stopPropagation(); openSubtasksModal('${task.id}')" title="Subtasks (${doneSubCount}/${childSubtasks.length})">${doneSubCount}/${childSubtasks.length}</span>` 
      : '';

    const rangeTooltip = (task.date && task.endDate && task.endDate > task.date) ? ` • ${task.date} → ${task.endDate}` : '';
    const dateRangeLabel = isMultiDay ? `<span class="ribbon-date-range">${task.date.slice(5)} → ${task.endDate ? task.endDate.slice(5) : ''}</span>` : '';

    const multiDayClasses = [
      isMultiDay ? 'is-multiday-span' : '',
      startsBefore ? 'starts-before' : '',
      endsAfter ? 'ends-after' : ''
    ].filter(Boolean).join(' ');

    let alldayLocHtml = '';
    const ribbonUrl = extractTaskUrl(task);
    if (ribbonUrl) {
      alldayLocHtml = `<a href="${ribbonUrl}" target="_blank" rel="noopener noreferrer" class="ribbon-link-pill" onclick="event.stopPropagation()" title="Ouvrir : ${escapeHtml(ribbonUrl)}"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></a>`;
    } else if (task.location && task.location.trim()) {
      alldayLocHtml = `<span class="ribbon-location-pill" title="Lieu : ${escapeHtml(task.location.trim())}">📍</span>`;
    }

    return `
      <div class="cal-allday-ribbon cat-${task.context || 'work'} ${task.completed ? 'completed' : ''} ${multiDayClasses} ${task.important ? 'is-important' : ''}"
           id="allday_${task.id}"
           style="grid-column: ${colStart + 1} / ${colEnd + 2}; grid-row: ${track + 1}; z-index: 2;"
           draggable="true"
           ondragstart="handleDragStart(event, '${task.id}')"
           ondragend="handleDragEnd(event)"
           onclick="event.stopPropagation(); openEditModal('${task.id}')"
           title="${escapeHtml(task.title)}${rangeTooltip}">
        <div class="ribbon-content">
          ${!isEvent ? `
            <div class="subtask-mini-checkbox ${task.completed ? 'checked' : ''}" 
                 onclick="event.stopPropagation(); toggleTaskCompletion('${task.id}')">
              ${task.completed ? '✓' : ''}
            </div>
          ` : '<span style="font-size:10.5px; flex-shrink:0;">📅</span>'}
          <span class="ribbon-title">${recIcon}${renderTitleWithTagsHtml(task.title)}</span>
          ${dateRangeLabel}
          ${alldayLocHtml}
          ${progressPillHtml}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="cal-allday-section">
      <div class="cal-gutter-allday">
        <span class="allday-label">ALL-DAY</span>
      </div>
      <div class="cal-allday-grid" style="grid-template-columns: repeat(${visibleDates.length}, 1fr); grid-template-rows: repeat(${totalTracks}, auto);">
        ${dropCellsHtml}
        ${ribbonsHtml}
      </div>
    </div>
  `;
}

function renderPlanGrid(forceRebuild = false) {
  const grid = document.getElementById('plannerGrid');
  if (!grid) return;

  const visibleDates = calculateVisibleDates();
  const visibleDateStrs = visibleDates.map(d => getLocalDateString(d));

  // Sauvegarder le scroll global du viewport actuel
  const viewport = document.getElementById('calScrollViewport');
  const prevScroll = viewport ? viewport.scrollTop : null;

  // Calculer les données par jour (avec support des récurrences et multi-jours)
  const dayDataMap = new Map();
  visibleDates.forEach(dateObj => {
    const dateStr = getLocalDateString(dateObj);
    const dayTasks = (window.SpanPlanState.tasks || []).filter(t => {
      const occurs = isTaskOccurringOnDate(t, dateStr);
      const contextMatch = isTaskCategoryVisible(t);
      const tagMatch = !currentTagFilter || (t.title && t.title.toLowerCase().includes(`#${currentTagFilter.toLowerCase()}`));
      return occurs && contextMatch && tagMatch;
    });
    dayDataMap.set(dateStr, {
      dateObj,
      timedTasks: dayTasks.filter(t => !t.allDay && !!t.time),
      unscheduledTasks: dayTasks.filter(t => t.allDay || !t.time)
    });
  });

  // Construction des en-têtes de colonnes (Badge jour + Capacité horaire)
  const headerCellsHtml = visibleDates.map(dateObj => {
    const dateStr = getLocalDateString(dateObj);
    const isToday = (dateStr === TODAY_STR);
    const weekdayShort = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const dayNumber = dateObj.getDate();
    const { timedTasks } = dayDataMap.get(dateStr);

    const capacityHtml = renderDayCapacityHtml(timedTasks, dateStr);

    return `
      <div class="cal-day-header-cell ${isToday ? 'is-today' : ''}" data-date="${dateStr}">
        <div class="cal-day-title-row">
          <div class="cal-day-left-badge">
            <span class="cal-day-name">${isToday ? 'TODAY' : weekdayShort}</span>
            <div class="cal-day-disc ${isToday ? 'is-today-disc' : ''}">
              <span class="cal-day-date-number">${dayNumber}</span>
            </div>
          </div>
          ${capacityHtml}
        </div>
      </div>
    `;
  }).join('');

  const hourLinesTemplate = renderColumnHourLines();

  const gridColumnsHtml = visibleDates.map(dateObj => {
    const dateStr = getLocalDateString(dateObj);
    const isToday = (dateStr === TODAY_STR);
    const { timedTasks } = dayDataMap.get(dateStr);

    return `
      <div class="cal-day-column ${isToday ? 'is-today' : ''}" data-date="${dateStr}">
        <div class="cal-day-hour-lines">
          ${hourLinesTemplate}
        </div>
        <div class="schedule-grid-canvas" 
             id="canvas_${dateStr}" 
             data-date="${dateStr}"
             onpointerdown="handleCanvasPointerDown(event, '${dateStr}')"
             ondblclick="handleCanvasDoubleClick(event, '${dateStr}')"
             onpointermove="handleCanvasHoverMove(event)"
             onpointerleave="handleCanvasHoverLeave(event)"
             ondragover="allowCanvasDrop(event)" 
             ondragleave="removeCanvasDropHighlight(event)"
             ondrop="handleCanvasDrop(event, '${dateStr}')">
          <div class="cal-marquee"></div>
          ${renderTimedBlocks(timedTasks, dateStr)}
          ${isToday ? renderNowLineHtml() : ''}
        </div>
      </div>
    `;
  }).join('');

  grid.innerHTML = `
    <div class="cal-unified-container is-view-${visibleDates.length}d">
      <div class="cal-sticky-header">
        <div class="cal-header-top-row">
          <div class="cal-gutter-header">
            <span class="cal-tz-label">TIME</span>
          </div>
          <div class="cal-columns-header" style="grid-template-columns: repeat(${visibleDates.length}, 1fr);">
            ${headerCellsHtml}
          </div>
        </div>
        ${renderAllDayContinuousRibbonHtml(visibleDates)}
      </div>

      <div class="cal-scroll-viewport" id="calScrollViewport">
        <div class="cal-scroll-content">
          <div class="cal-time-ruler">
            ${renderTimeRulerHtml(visibleDates)}
          </div>
          <div class="cal-grid-columns" style="grid-template-columns: repeat(${visibleDates.length}, 1fr);">
            ${gridColumnsHtml}
          </div>
        </div>
      </div>
    </div>
  `;

  // Restaurer le scroll fluide
  const newViewport = document.getElementById('calScrollViewport');
  if (newViewport && prevScroll !== null) {
    newViewport.scrollTop = prevScroll;
  }

  updateRangeLabel(visibleDates);
  if (typeof renderDateStrip === 'function') renderDateStrip();
  if (typeof renderMiniMonthCalendar === 'function') renderMiniMonthCalendar();
}

// ==============================================================
// MINI MONTH CALENDAR (DATEPICKER & RANGE INDICATOR)
// ==============================================================
let miniCalYear = (new Date()).getFullYear();
let miniCalMonth = (new Date()).getMonth(); // 0-indexed
let isMiniCalCollapsed = localStorage.getItem('span_plan_mini_cal_collapsed') === 'true';

function updateMiniCalCollapseUI() {
  const widget = document.getElementById('miniCalendarWidget');
  const icon = document.getElementById('miniCalCollapseIcon');
  if (widget) {
    widget.classList.toggle('is-collapsed', isMiniCalCollapsed);
  }
  if (icon) {
    icon.textContent = isMiniCalCollapsed ? '▸' : '▾';
  }
}
window.updateMiniCalCollapseUI = updateMiniCalCollapseUI;

function toggleMiniCalCollapse() {
  isMiniCalCollapsed = !isMiniCalCollapsed;
  localStorage.setItem('span_plan_mini_cal_collapsed', isMiniCalCollapsed ? 'true' : 'false');
  updateMiniCalCollapseUI();
}
window.toggleMiniCalCollapse = toggleMiniCalCollapse;

function navigateMiniCal(deltaMonth) {
  miniCalMonth += deltaMonth;
  if (miniCalMonth < 0) {
    miniCalMonth = 11;
    miniCalYear--;
  } else if (miniCalMonth > 11) {
    miniCalMonth = 0;
    miniCalYear++;
  }
  renderMiniMonthCalendar(deltaMonth > 0 ? 'slide-left' : 'slide-right');
}

// SWIPE TACTILE & TRACKPAD SUR LE MINI CALENDRIER (Changement de mois fluide)
function setupMiniCalSwipe() {
  const widget = document.getElementById('miniCalendarWidget');
  if (!widget || widget._swipeSetupDone) return;
  widget._swipeSetupDone = true;

  let miniTouchStartX = 0;
  let miniTouchStartY = 0;
  let miniTouchStartTime = 0;

  widget.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    miniTouchStartX = t.clientX;
    miniTouchStartY = t.clientY;
    miniTouchStartTime = Date.now();
  }, { passive: true });

  widget.addEventListener('touchend', (e) => {
    if (!miniTouchStartX) return;
    const t = e.changedTouches[0];
    const diffX = t.clientX - miniTouchStartX;
    const diffY = t.clientY - miniTouchStartY;
    const elapsed = Date.now() - miniTouchStartTime;

    if (Math.abs(diffX) > 28 && Math.abs(diffX) > Math.abs(diffY) * 1.2 && elapsed < 600) {
      if (diffX < 0) {
        navigateMiniCal(1); // Swipe vers la gauche -> mois suivant
      } else {
        navigateMiniCal(-1); // Swipe vers la droite -> mois précédent
      }
    }
    miniTouchStartX = 0;
    miniTouchStartY = 0;
  }, { passive: true });

  // Geste trackpad horizontal sur le mini calendrier
  let lastMiniWheelTime = 0;
  widget.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) > 22 && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.3) {
      const now = Date.now();
      if (now - lastMiniWheelTime > 360) {
        if (e.deltaX > 0) {
          navigateMiniCal(1);
        } else {
          navigateMiniCal(-1);
        }
        lastMiniWheelTime = now;
      }
    }
  }, { passive: true });
}

function selectDateFromMiniCal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetDate = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const count = isMobileScreen() ? 1 : visibleDaysCount;
  if (count === 7 || count === 5) {
    const targetMonday = getMonday(targetDate);
    const todayMonday = getMonday(today);
    const diffTime = targetMonday.getTime() - todayMonday.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    currentTimelineOffset = diffDays;
  } else {
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    currentTimelineOffset = diffDays;
  }

  renderPlanGrid(true);
  applyDynamicScroll();
}

function renderMiniMonthCalendar(animClass = null) {
  updateMiniCalCollapseUI();
  setupMiniCalSwipe();
  const widget = document.getElementById('miniCalendarWidget');
  if (!widget) return;

  const displayDate = new Date(miniCalYear, miniCalMonth, 1);
  const monthName = displayDate.toLocaleDateString('en-US', { month: 'short' });

  let gridEl = document.getElementById('miniCalGrid');
  if (!gridEl) {
    widget.innerHTML = `
      <div class="mini-cal-header" onclick="toggleMiniCalCollapse()" title="Cliquer pour plier / déplier le calendrier">
        <div class="mini-cal-title-wrap">
          <span class="mini-cal-collapse-icon" id="miniCalCollapseIcon">${isMiniCalCollapsed ? '▸' : '▾'}</span>
          <span class="mini-cal-title" id="miniCalMonthYear">${monthName} ${miniCalYear}</span>
        </div>
        <div class="mini-cal-nav" onclick="event.stopPropagation()">
          <button type="button" class="mini-nav-btn" onclick="navigateMiniCal(-1)" title="Previous month">‹</button>
          <button type="button" class="mini-nav-btn" onclick="navigateMiniCal(1)" title="Next month">›</button>
        </div>
      </div>
      <div class="mini-cal-body" id="miniCalBody">
        <div class="mini-cal-weekdays">
          <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
        </div>
        <div class="mini-cal-grid" id="miniCalGrid"></div>
      </div>
    `;
    gridEl = document.getElementById('miniCalGrid');
  }
  if (!gridEl) return;

  const titleEl = document.getElementById('miniCalMonthYear');
  if (titleEl) {
    titleEl.textContent = `${monthName} ${miniCalYear}`;
  }

  // Obtenir les dates de la vue principale actuellement affichées
  const visibleDates = calculateVisibleDates();
  const visibleDateStrs = new Set(visibleDates.map(d => getLocalDateString(d)));
  const firstVisibleStr = visibleDates.length > 0 ? getLocalDateString(visibleDates[0]) : null;

  // Calculer l'ensemble des dates ayant des événements/tâches (incluant récurrences et multi-jours)
  const datesWithTasks = new Set();
  const allTasks = window.SpanPlanState.tasks || [];
  const checkCur = new Date(miniCalYear, miniCalMonth - 1, 20);
  const checkEnd = new Date(miniCalYear, miniCalMonth + 1, 15);
  while (checkCur <= checkEnd) {
    const ds = getLocalDateString(checkCur);
    if (allTasks.some(t => isTaskOccurringOnDate(t, ds))) {
      datesWithTasks.add(ds);
    }
    checkCur.setDate(checkCur.getDate() + 1);
  }

  // Premier jour du mois
  const firstDay = new Date(miniCalYear, miniCalMonth, 1);
  let startDayOfWeek = firstDay.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6;

  // Dernier jour du mois courant
  const lastDay = new Date(miniCalYear, miniCalMonth + 1, 0);
  const totalDaysInMonth = lastDay.getDate();

  // Dernier jour du mois précédent
  const prevMonthLastDay = new Date(miniCalYear, miniCalMonth, 0).getDate();

  let cellsHtml = '';

  // Jours du mois précédent
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dNum = prevMonthLastDay - i;
    const prevMonthDate = new Date(miniCalYear, miniCalMonth - 1, dNum);
    const dateStr = getLocalDateString(prevMonthDate);
    const isInRange = visibleDateStrs.has(dateStr);
    const isRangeStart = (dateStr === firstVisibleStr);
    const hasEvents = datesWithTasks.has(dateStr);
    cellsHtml += `
      <div class="mini-cal-day other-month ${isInRange ? 'is-in-range' : ''} ${isRangeStart ? 'is-range-start' : ''} ${hasEvents ? 'has-events' : ''}" 
           onclick="selectDateFromMiniCal('${dateStr}')">
        ${dNum}
      </div>
    `;
  }

  // Jours du mois courant
  for (let d = 1; d <= totalDaysInMonth; d++) {
    const curDate = new Date(miniCalYear, miniCalMonth, d);
    const dateStr = getLocalDateString(curDate);
    const isToday = (dateStr === TODAY_STR);
    const isInRange = visibleDateStrs.has(dateStr);
    const isRangeStart = (dateStr === firstVisibleStr);
    const hasEvents = datesWithTasks.has(dateStr);

    cellsHtml += `
      <div class="mini-cal-day ${isToday ? 'is-today' : ''} ${isInRange ? 'is-in-range' : ''} ${isRangeStart ? 'is-range-start' : ''} ${hasEvents ? 'has-events' : ''}" 
           onclick="selectDateFromMiniCal('${dateStr}')"
           title="${dateStr}">
        ${d}
      </div>
    `;
  }

  // Jours du mois suivant
  const totalRenderedSoFar = startDayOfWeek + totalDaysInMonth;
  const remainingCells = (totalRenderedSoFar % 7 === 0) ? 0 : 7 - (totalRenderedSoFar % 7);
  for (let nextD = 1; nextD <= remainingCells; nextD++) {
    const nextDate = new Date(miniCalYear, miniCalMonth + 1, nextD);
    const dateStr = getLocalDateString(nextDate);
    const isInRange = visibleDateStrs.has(dateStr);
    const isRangeStart = (dateStr === firstVisibleStr);
    const hasEvents = datesWithTasks.has(dateStr);

    cellsHtml += `
      <div class="mini-cal-day other-month ${isInRange ? 'is-in-range' : ''} ${isRangeStart ? 'is-range-start' : ''} ${hasEvents ? 'has-events' : ''}" 
           onclick="selectDateFromMiniCal('${dateStr}')">
        ${nextD}
      </div>
    `;
  }

  gridEl.innerHTML = cellsHtml;
  if (animClass) {
    gridEl.classList.remove('slide-left', 'slide-right');
    void gridEl.offsetWidth; // retrigger reflow
    gridEl.classList.add(animClass);
  }
}

// TOGGLE SIDEBAR (⌘B / [)
function toggleSidebar(forceOpen = null) {
  const shell = document.getElementById('appShell');
  if (!shell) return;
  const isCurrentlyCollapsed = shell.classList.contains('sidebar-collapsed');
  let shouldOpen;
  if (forceOpen !== null) {
    shouldOpen = !!forceOpen;
  } else {
    shouldOpen = isCurrentlyCollapsed;
  }
  shell.classList.toggle('sidebar-collapsed', !shouldOpen);
  localStorage.setItem('span_plan_sidebar_collapsed', !shouldOpen ? '1' : '0');
}

// ALGORITHME DE RÉSOLUTION DES CHEVAUCHEMENTS D'HORAIRES (MULTI-COLONNES STYLE GOOGLE/APPLE CALENDAR)
function computeOverlapLayout(tasks, dateStr = null) {
  if (!tasks || tasks.length === 0) return [];

  const parsed = tasks.map(t => {
    const taskStartM = timeToMinutes(t.time || '00:00');
    const totalDuration = t.duration || 30;
    const isOvernight = (taskStartM + totalDuration > 1440);

    let start = taskStartM;
    let duration = totalDuration;
    let isContinuation = false;

    if (isOvernight && dateStr) {
      if (dateStr === t.date) {
        // Premier jour de l'événement nocturne : s'arrête exactement à minuit (1440)
        start = taskStartM;
        duration = 1440 - taskStartM;
      } else if (dateStr > t.date) {
        // Jour suivant (glissement sur le début du jour suivant) : de 00:00 jusqu'au restant
        start = 0;
        duration = Math.min(1440, (taskStartM + totalDuration) - 1440);
        isContinuation = true;
      }
    }

    const end = start + duration;
    return { task: t, start, end, duration, isContinuation, isOvernight, totalDuration };
  });

  // Tri par heure de début croissante, puis par durée décroissante
  parsed.sort((a, b) => a.start - b.start || b.duration - a.duration);

  const clusters = [];
  let currentCluster = [];
  let clusterEnd = -1;

  parsed.forEach(item => {
    if (currentCluster.length === 0) {
      currentCluster.push(item);
      clusterEnd = item.end;
    } else {
      if (item.start < clusterEnd) {
        currentCluster.push(item);
        if (item.end > clusterEnd) clusterEnd = item.end;
      } else {
        clusters.push(currentCluster);
        currentCluster = [item];
        clusterEnd = item.end;
      }
    }
  });
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  const results = [];
  clusters.forEach(cluster => {
    const columns = [];
    cluster.forEach(item => {
      let placed = false;
      for (let i = 0; i < columns.length; i++) {
        if (columns[i] <= item.start) {
          item.colIndex = i;
          columns[i] = item.end;
          placed = true;
          break;
        }
      }
      if (!placed) {
        item.colIndex = columns.length;
        columns.push(item.end);
      }
    });

    const totalCols = Math.max(1, columns.length);
    cluster.forEach(item => {
      item.totalCols = totalCols;
      results.push(item);
    });
  });

  return results;
}

// LIGNES D'HEURES DE 00:00 À 23:00 (NUIT ATTÉNUÉE 00h-07h, JOUR & SOIRÉE CLAIRE 07h-23h)
function renderHourLines() {
  let html = '';
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const top = (h - START_HOUR) * HOUR_HEIGHT;
    const label = `${String(h).padStart(2, '0')}:00`;
    const isNight = (h < 7);
    html += `
      <div class="hour-row ${isNight ? 'is-night' : ''}" style="top: ${top}px;">
        <span class="hour-label">${label}</span>
        <div class="hour-line"></div>
      </div>
    `;
  }
  return html;
}

function renderNowLineHtml() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = START_HOUR * 60;
  const endMinutes = (END_HOUR + 1) * 60;

  if (currentMinutes < startMinutes || currentMinutes > endMinutes) return '';

  const top = ((currentMinutes - startMinutes) / 60) * HOUR_HEIGHT;

  return `
    <div class="now-timeline-marker" style="top: ${top}px;">
      <span class="now-dot"></span>
    </div>
  `;
}

function renderEmptyDayGuidanceHtml() {
  return '';
}

function renderTimedBlocks(tasks, dateStr) {
  const layoutItems = computeOverlapLayout(tasks, dateStr);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return layoutItems.map(({ task, start, duration, colIndex, totalCols, isContinuation, isOvernight, totalDuration }) => {
    const isEvent = task.type === 'event';
    const isSelected = selectedTaskIds.has(task.id);
    const isLiveNow = (dateStr === TODAY_STR && currentMinutes >= start && currentMinutes < (start + duration));
    const startMinutes = START_HOUR * 60;
    let top = Math.round(((start - startMinutes) / 60) * HOUR_HEIGHT) + 1;
    top = Math.max(0, top);

    const height = Math.max(22, Math.round((duration / 60) * HOUR_HEIGHT) - 2);

    const endTotal = start + duration;
    const endH = String(Math.floor(endTotal / 60)).padStart(2, '0');
    const endM = String(endTotal % 60).padStart(2, '0');

    let timeRangeStr = '';
    if (isContinuation) {
      timeRangeStr = `00:00 – ${endH}:${endM} (suite)`;
    } else if (isOvernight) {
      const fullEndM = (timeToMinutes(task.time) + totalDuration) % 1440;
      const fullEndH = String(Math.floor(fullEndM / 60)).padStart(2, '0');
      const fullEndMin = String(fullEndM % 60).padStart(2, '0');
      timeRangeStr = `${task.time} – ${fullEndH}:${fullEndMin} (+1j)`;
    } else {
      timeRangeStr = `${task.time} – ${endH}:${endM}`;
    }

    const continuationPrefix = isContinuation ? '<span class="overnight-continuation-badge" title="Suite de la veille">↳ </span>' : '';
    const overnightClass = isContinuation ? 'is-overnight-continuation' : (isOvernight ? 'is-overnight-start' : '');

    const rolloverClass = task.isRollover ? 'rollover' : '';
    const rolloverPrefix = task.isRollover ? '⟳ ' : '';
    const recPrefix = (task.recurrence && task.recurrence !== 'none') ? '<span class="recurrence-badge" title="Repeats: ' + task.recurrence + '">🔁</span> ' : '';
    const eventClass = isEvent ? 'is-event' : '';
    const selectedClass = isSelected ? 'is-selected' : '';
    const liveClass = isLiveNow ? 'is-live-now' : '';
    const completedClass = task.completed ? 'is-completed' : '';

    const childSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const doneSubCount = childSubtasks.filter(s => s.completed).length;
    const isExpanded = window.expandedBlockAccordionIds && window.expandedBlockAccordionIds.has(task.id);
    const expandedClass = isExpanded ? 'is-expanded' : '';

    const isViewNarrow = (typeof visibleDaysCount !== 'undefined' && visibleDaysCount >= 5);
    const isNarrowCol = isViewNarrow || totalCols >= 2;
    const isUltraNarrow = (isViewNarrow && totalCols >= 2) || totalCols >= 3;
    const isCompact = height < 46;

    // Gestion propre, aérée et élégante des colonnes de chevauchement (avec gouttière nette et élévation)
    const isOverlapping = totalCols > 1;
    let positionStyle = `top: ${top}px; height: ${isExpanded ? 'auto' : `${height}px`};`;
    if (isOverlapping) {
      const marginEdge = isNarrowCol ? 2 : 4;
      const colGap = isUltraNarrow ? 3 : 5;
      const totalGaps = (totalCols - 1) * colGap;
      positionStyle += ` left: calc(${marginEdge}px + (100% - ${marginEdge * 2 + totalGaps}px) * ${colIndex} / ${totalCols} + ${colIndex * colGap}px); width: calc((100% - ${marginEdge * 2 + totalGaps}px) / ${totalCols}); z-index: ${6 + colIndex};`;
    }
    const narrowColClass = isUltraNarrow ? 'is-ultra-narrow-col is-narrow-col' : (isNarrowCol ? 'is-narrow-col' : '');
    const overlappingClass = isOverlapping ? 'is-overlapping' : '';
    const progressPillHtml = childSubtasks.length > 0 
      ? `<span class="event-progress-pill clickable-pill" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); toggleBlockAccordion(event, '${task.id}')" title="Sous-tâches (${doneSubCount}/${childSubtasks.length}) - Cliquer pour ${isExpanded ? 'replier' : 'déplier'}"><span class="progress-pill-icon">☑</span> <span class="progress-pill-count">${doneSubCount}/${childSubtasks.length}</span><span class="progress-pill-arrow">${isExpanded ? '▴' : '▾'}</span></span>` 
      : '';

    const remainingMinutes = Math.max(0, endTotal - currentMinutes);

    let subtasksHtml = '';
    const baseVisibleLimit = height >= 95 ? 2 : (height >= 75 ? 1 : 0);
    const zeroVisibleClass = (!isExpanded && baseVisibleLimit === 0) ? 'has-zero-subtasks-visible' : '';
    const overflowCount = Math.max(0, childSubtasks.length - baseVisibleLimit);
    const hasOverflow = overflowCount > 0;

    if (childSubtasks.length > 0) {
      const sortedSubtasks = [...childSubtasks].sort((a, b) => (a.completed ? 1 : 0) - (b.completed ? 1 : 0));

      subtasksHtml = `
        <div class="block-subtasks-container accordion-subtasks" data-count="${sortedSubtasks.length}" onpointerdown="event.stopPropagation()">
          ${sortedSubtasks.map((sub, idx) => {
            const subAction = getTaskActionType(sub);
            let subActionBadge = '';
            if (subAction === 'call') subActionBadge = '<span class="subtask-action-mini-badge" title="Call">📞</span>';
            else if (subAction === 'mail') subActionBadge = '<span class="subtask-action-mini-badge" title="Mail">✉️</span>';
            else if (subAction === 'pay') subActionBadge = '<span class="subtask-action-mini-badge" title="Paiement">💳</span>';

            return `
            <div class="block-subtask-row subtask-cat-${sub.context || 'work'} ${sub.completed ? 'completed' : ''} ${idx >= baseVisibleLimit ? 'subtask-overflow-item' : ''}" 
                 draggable="true"
                 onpointerdown="event.stopPropagation()"
                 ondragstart="handleSubtaskDragStart(event, '${task.id}', '${sub.id}')"
                 ondragend="handleSubtaskDragEnd(event)"
                 ondblclick="event.stopPropagation(); openSubtasksModal('${task.id}', false, '${sub.id}')"
                 title="${sub.completed ? 'Marquer comme non fait' : 'Marquer comme fait'} (double-cliquer pour modifier, glisser pour déplacer)">
              <div class="subtask-mini-checkbox ${sub.completed ? 'checked' : ''}"
                   onclick="event.stopPropagation(); toggleSubtaskCompletion('${task.id}', '${sub.id}')"
                   title="${sub.completed ? 'Marquer comme non fait' : 'Marquer comme fait'}">
                ${sub.completed ? '✓' : ''}
              </div>
              ${subActionBadge}
              <span class="subtask-row-title" 
                    onclick="event.stopPropagation(); openSubtasksModal('${task.id}', false, '${sub.id}')"
                    ondblclick="event.stopPropagation(); openSubtasksModal('${task.id}', false, '${sub.id}')"
                    title="Cliquer pour modifier">${renderTitleWithTagsHtml(sub.title)}</span>
              <button type="button" 
                      class="btn-subtask-quick-backlog" 
                      onpointerdown="event.stopPropagation()" 
                      onclick="event.stopPropagation(); moveSubtaskToBacklog('${task.id}', '${sub.id}')" 
                      title="Déplacer vers le Backlog">📥</button>
            </div>
          `;}).join('')}
          ${isExpanded ? `
            <button type="button" 
                    class="block-subtask-add-btn" 
                    onpointerdown="event.stopPropagation()"
                    onclick="event.stopPropagation(); quickAddSubtaskFromBlock('${task.id}')"
                    title="Ajouter une sous-tâche">
              + Ajouter sous-tâche
            </button>
          ` : ''}
          ${(isExpanded || (baseVisibleLimit > 0 && hasOverflow)) ? `
            <button type="button" 
                    class="subtasks-unfold-btn" 
                    onpointerdown="event.stopPropagation()"
                    onclick="toggleBlockAccordion(event, '${task.id}')"
                    title="${isExpanded ? 'Replier les sous-tâches' : 'Déplier toutes les sous-tâches'}">
              <span class="unfold-btn-text">${isExpanded ? 'Moins' : `+${overflowCount} autre${overflowCount > 1 ? 's' : ''}`}</span>
              <span class="unfold-btn-arrow">${isExpanded ? '▴' : '▾'}</span>
            </button>
          ` : ''}
        </div>
      `;
    }

    const taskUrl = extractTaskUrl(task);
    const cornerLinkHtml = taskUrl ? `
      <a href="${taskUrl}" target="_blank" rel="noopener noreferrer" 
         class="block-corner-link-btn" 
         onpointerdown="event.stopPropagation()" 
         onclick="event.stopPropagation()" 
         title="Ouvrir le lien web : ${escapeHtml(taskUrl)}">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
      </a>
    ` : '';

    let locationHtml = '';
    if (task.location && task.location.trim()) {
      const locRaw = task.location.trim();
      const locAsUrl = extractTaskUrl({ location: locRaw });
      // Si task.location est UNIQUEMENT une URL, on n'affiche pas la pastille texte de lieu
      // car le bouton vectoriel dans le coin inférieur droit s'en charge déjà parfaitement !
      const isPureUrl = Boolean(locAsUrl && (
        locRaw.toLowerCase() === locAsUrl.toLowerCase() ||
        locRaw.toLowerCase() === locAsUrl.replace(/^https?:\/\//i, '').toLowerCase() ||
        locRaw.toLowerCase().startsWith('http://') ||
        locRaw.toLowerCase().startsWith('https://') ||
        locRaw.toLowerCase().startsWith('www.')
      ));

      if (!isPureUrl) {
        locationHtml = `
          <span class="block-location-pill" 
                onpointerdown="event.stopPropagation()"
                onclick="event.stopPropagation(); openEditModal('${task.id}')" 
                title="Lieu : ${escapeHtml(locRaw)}">
            📍 ${escapeHtml(locRaw)}
          </span>
        `;
      }
    }

    let notesHtml = '';
    if (task.notes && task.notes.trim()) {
      const cleanNotesPreview = task.notes.trim().slice(0, 150);
      notesHtml = `
        <span class="block-notes-pill" 
              onpointerdown="event.stopPropagation()"
              onclick="event.stopPropagation(); openEditModal('${task.id}')" 
              title="Notes : ${escapeHtml(cleanNotesPreview)}">
          📝
        </span>
      `;
    }

    let innerContentHtml = '';
    if (isCompact) {
      innerContentHtml = `
        <div class="schedule-block-compact-row">
          ${!isEvent ? `
            <div class="checkbox ${task.completed ? 'checked' : ''}" 
                 onclick="event.stopPropagation(); toggleTaskCompletion('${task.id}')" 
                 title="${task.completed ? 'Mark incomplete' : 'Mark completed'}">
              ${task.completed ? '✓' : ''}
            </div>
          ` : ''}
          <span class="schedule-block-title">${continuationPrefix}${rolloverPrefix}${recPrefix}${renderTitleWithTagsHtml(task.title)}</span>
          <span class="compact-time">${isContinuation ? `00:00 – ${endH}:${endM}` : `${task.time}–${endH}:${endM}`}</span>
          ${locationHtml}
          ${notesHtml}
          ${isLiveNow ? `
            <span class="live-status-pill mini"><span class="live-status-dot"></span>LIVE <span class="live-meta-remaining">${remainingMinutes}m</span></span>
          ` : ''}
          <div class="schedule-block-top-actions">
            ${progressPillHtml}
            ${!isEvent ? `<button type="button" class="btn-block-quick-add-subtask" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); quickAddSubtaskFromBlock('${task.id}')" title="Ajouter une sous-tâche">➕</button>` : ''}
            <button type="button" class="btn-task-menu" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); openTaskPopover(event, '${task.id}')" title="Options">⋮</button>
          </div>
        </div>
        ${subtasksHtml}
      `;
    } else {
      const displayTimeStr = (isNarrowCol && !isOvernight && !isContinuation) 
        ? `${task.time}–${endH}:${endM}` 
        : timeRangeStr;

      innerContentHtml = `
        <div class="schedule-block-top">
          ${!isEvent ? `
            <div class="checkbox ${task.completed ? 'checked' : ''}" 
                 onclick="event.stopPropagation(); toggleTaskCompletion('${task.id}')" 
                 title="${task.completed ? 'Mark incomplete' : 'Mark completed'}">
              ${task.completed ? '✓' : ''}
            </div>
          ` : ''}
          <span class="schedule-block-title">${continuationPrefix}${rolloverPrefix}${recPrefix}${renderTitleWithTagsHtml(task.title)}</span>
          <div class="schedule-block-top-actions">
            ${isNarrowCol ? '' : progressPillHtml}
            ${!isEvent ? `<button type="button" class="btn-block-quick-add-subtask" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); quickAddSubtaskFromBlock('${task.id}')" title="Ajouter une sous-tâche">➕</button>` : ''}
            <button type="button" class="btn-task-menu" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); openTaskPopover(event, '${task.id}')" title="Options">⋮</button>
          </div>
        </div>
        <div class="schedule-block-meta">
          <span class="schedule-block-time">${displayTimeStr}</span>
          ${isNarrowCol ? progressPillHtml : ''}
          ${isLiveNow ? `
            <span class="live-status-pill mini"><span class="live-status-dot"></span>LIVE <span class="live-meta-remaining">${remainingMinutes}m</span></span>
          ` : ''}
          ${locationHtml}
          ${notesHtml}
        </div>
        ${subtasksHtml}
      `;
    }

    const hasSubtasksClass = childSubtasks.length > 0 ? 'has-subtasks' : '';
    const shortBlockClass = height < 52 ? 'is-short-block' : '';
    const overflowAttr = childSubtasks.length > 0 ? `data-overflow-count="${overflowCount}"` : '';
    const notesTooltip = (task.notes && task.notes.trim()) ? `\n📝 ${task.notes.trim().slice(0, 100)}` : '';
    const locTooltip = (task.location && task.location.trim()) ? `\n📍 ${task.location.trim()}` : '';

    const importantClass = task.important ? 'is-important' : '';

    return `
      <div class="schedule-block-item cat-${task.context || 'work'} ${rolloverClass} ${eventClass} ${selectedClass} ${liveClass} ${completedClass} ${isCompact ? 'is-compact' : ''} ${hasSubtasksClass} ${shortBlockClass} ${expandedClass} ${narrowColClass} ${overlappingClass} ${overnightClass} ${importantClass} ${zeroVisibleClass} ${taskUrl ? 'has-corner-link' : ''}" 
           id="block_${task.id}${isContinuation ? '_cont' : ''}"
           data-task-id="${task.id}"
           data-date="${dateStr}"
           data-is-continuation="${isContinuation ? 'true' : 'false'}"
           ${overflowAttr}
           data-original-height="${height}"
           style="--block-height: ${height}px; ${positionStyle}"
           onpointerdown="handleBlockPointerDown(event, '${task.id}', '${dateStr}')"
           ondblclick="event.stopPropagation(); openEditModal('${task.id}')"
           onclick="event.stopPropagation()"
           ondragover="handleBlockDragOver(event, '${task.id}')"
           ondragleave="handleBlockDragLeave(event, '${task.id}')"
           ondrop="handleBlockDrop(event, '${task.id}')"
           title="${isEvent ? '📅 Event: ' : '📋 Task: '}${escapeHtml(task.title)} (${timeRangeStr})${locTooltip}${notesTooltip}${taskUrl ? `\n🔗 ${taskUrl}` : ''}">
        ${innerContentHtml}
        ${cornerLinkHtml}
        <div class="resize-handle" 
             onmousedown="startResize(event, '${task.id}')"
             ontouchstart="startResize(event, '${task.id}')"
             onclick="event.stopPropagation()"
             title="Drag to resize duration"></div>
      </div>
    `;
  }).join('');
}

window.expandedBlockAccordionIds = window.expandedBlockAccordionIds || new Set();

function toggleBlockAccordion(event, taskId) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (!window.expandedBlockAccordionIds) {
    window.expandedBlockAccordionIds = new Set();
  }
  const blockEl = document.getElementById(`block_${taskId}`) || document.getElementById(`block_${taskId}_cont`);
  const isExpanded = window.expandedBlockAccordionIds.has(taskId);
  if (isExpanded) {
    window.expandedBlockAccordionIds.delete(taskId);
    if (blockEl) {
      blockEl.classList.remove('is-expanded');
      blockEl.style.height = blockEl.dataset.originalHeight ? `${blockEl.dataset.originalHeight}px` : '';
      const btn = blockEl.querySelector('.subtasks-unfold-btn');
      if (btn) {
        const remaining = parseInt(blockEl.dataset.overflowCount || '1', 10);
        btn.innerHTML = `<span class="unfold-btn-text">+${remaining} autre${remaining > 1 ? 's' : ''}</span><span class="unfold-btn-arrow">▾</span>`;
        btn.title = 'Déplier toutes les sous-tâches';
      }
      const miniBtn = blockEl.querySelector('.subtasks-mini-unfold-btn');
      if (miniBtn) {
        miniBtn.textContent = '▾';
        miniBtn.title = 'Déplier sous-tâches';
      }
    }
  } else {
    window.expandedBlockAccordionIds.add(taskId);
    if (blockEl) {
      blockEl.classList.add('is-expanded');
      blockEl.style.height = 'auto';
      const btn = blockEl.querySelector('.subtasks-unfold-btn');
      if (btn) {
        btn.innerHTML = `<span class="unfold-btn-text">Moins</span><span class="unfold-btn-arrow">▴</span>`;
        btn.title = 'Replier les sous-tâches';
      }
      const miniBtn = blockEl.querySelector('.subtasks-mini-unfold-btn');
      if (miniBtn) {
        miniBtn.textContent = '▴';
        miniBtn.title = 'Replier';
      }
    }
  }
}

function handleTaskRowClick(e, id) {
  closeQuickAddPopover();
  e.stopPropagation();
  if (e.metaKey || e.ctrlKey || e.shiftKey) {
    toggleTaskSelection(id);
    return;
  }
  if (selectedTaskIds.has(id)) {
    clearSelection();
  } else {
    selectTaskExclusively(id);
  }
}

function renderUnscheduledList(tasks) {
  if (tasks.length === 0) {
    return '';
  }

  return tasks.map(task => {
    const isEvent = task.type === 'event';
    const rolloverClass = task.isRollover ? 'rollover' : '';
    const rolloverPrefix = task.isRollover ? '⟳ ' : '';
    const eventClass = isEvent ? 'is-event' : '';
    const isSelected = selectedTaskIds.has(task.id);
    const childSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const doneSubCount = childSubtasks.filter(s => s.completed).length;
    const progressPillHtml = childSubtasks.length > 0 
      ? `<span class="event-progress-pill" onclick="event.stopPropagation(); openSubtasksModal('${task.id}')" title="Subtasks (${doneSubCount}/${childSubtasks.length})">${doneSubCount}/${childSubtasks.length}</span>` 
      : '';

    const importantClass = task.important ? 'is-important' : '';
    const backlogUrl = extractTaskUrl(task);
    const backlogLinkHtml = backlogUrl ? `
      <a href="${backlogUrl}" target="_blank" rel="noopener noreferrer" 
         class="task-row-link-btn" 
         onpointerdown="event.stopPropagation()" 
         onclick="event.stopPropagation()" 
         title="Ouvrir le lien web : ${escapeHtml(backlogUrl)}">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
      </a>
    ` : '';

    return `
      <li class="task-item cat-${task.context || 'work'} ${rolloverClass} ${eventClass} ${isSelected ? 'is-selected' : ''} ${importantClass}"
          draggable="true"
          ondragstart="handleDragStart(event, '${task.id}')"
          ondragend="handleDragEnd(event)">
        <div class="task-row-main" onclick="handleTaskRowClick(event, '${task.id}')" ondblclick="openEditModal('${task.id}')">
          ${isEvent ? `
            <span class="event-icon" title="Event (non-checkable)">📅</span>
          ` : `
            <div class="checkbox" onclick="event.stopPropagation(); toggleTaskCompletion('${task.id}')" title="Toggle completion">
              ${task.completed ? '✓' : ''}
            </div>
          `}
          <span class="task-text">
            ${rolloverPrefix}${renderTitleWithTagsHtml(task.title)}
          </span>
          ${backlogLinkHtml}
          <div class="schedule-block-top-actions">
            ${progressPillHtml}
            <button type="button" class="btn-block-quick-add-subtask" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); quickAddSubtaskFromBlock('${task.id}')" title="Ajouter une sous-tâche">➕</button>
            <button type="button" class="btn-task-menu" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); openTaskPopover(event, '${task.id}')" title="Options">⋮</button>
          </div>
        </div>
      </li>
    `;
  }).join('');
}

// SMART SCROLL (1H30 AVANT LE 1ER EVENT OU HEURE ACTUELLE)
function applyDynamicScroll(onlyIfUnscrolled = false) {
  const viewport = document.getElementById('calScrollViewport');
  if (!viewport) return;

  if (onlyIfUnscrolled && viewport.scrollTop > 10) return;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const visibleDates = calculateVisibleDates();
  const visibleDateStrs = new Set(visibleDates.map(d => getLocalDateString(d)));
  const visibleTimedTasks = (window.SpanPlanState.tasks || []).filter(t => visibleDateStrs.has(t.date) && !!t.time);

  let targetMinutes = 8.5 * 60; // 08:30 par défaut

  if (visibleDateStrs.has(TODAY_STR)) {
    targetMinutes = Math.max(0, currentMinutes - 60);
  } else if (visibleTimedTasks.length > 0) {
    let earliestMinutes = 24 * 60;
    visibleTimedTasks.forEach(t => {
      const parts = (t.time || '00:00').split(':');
      const m = parseInt(parts[0], 10) * 60 + (parseInt(parts[1], 10) || 0);
      if (m < earliestMinutes) earliestMinutes = m;
    });
    targetMinutes = Math.max(0, earliestMinutes - 60);
  }

  const scrollPx = Math.max(0, (targetMinutes / 60) * HOUR_HEIGHT);
  viewport.scrollTop = scrollPx;
}


// ==============================================================
// DATE STRIP (MOBILE NAVIGATION)
// ==============================================================
function renderDateStrip() {
  const strip = document.getElementById('mobileDateStrip');
  if (!strip) return;

  const centerOffset = currentTimelineOffset;
  let html = '';

  for (let i = -3; i <= 3; i++) {
    const offset = centerOffset + i;
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const dateStr = getLocalDateString(d);
    const isToday = (dateStr === TODAY_STR);
    const isSelected = (offset === currentTimelineOffset);

    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const dayNum = d.getDate();

    const dayTasks = (window.SpanPlanState && window.SpanPlanState.tasks) 
      ? window.SpanPlanState.tasks.filter(t => t.date === dateStr) 
      : [];
    const hasTasks = dayTasks.length > 0;

    html += `
      <button type="button" 
              class="date-strip-item ${isToday ? 'is-today' : ''} ${isSelected ? 'active' : ''}" 
              onclick="selectDateFromStrip(${offset})"
              title="${dateStr}">
        <span class="strip-day-name">${dayName}</span>
        <span class="strip-day-num">${dayNum}</span>
        ${hasTasks ? '<span class="strip-task-dot"></span>' : ''}
      </button>
    `;
  }

  strip.innerHTML = html;

  // Mise à jour du compteur To-do dans le switch segmenté
  const visibleDates = calculateVisibleDates();
  if (visibleDates.length > 0) {
    const currentDateStr = getLocalDateString(visibleDates[0]);
    const unscheduledCount = (window.SpanPlanState && window.SpanPlanState.tasks)
      ? window.SpanPlanState.tasks.filter(t => t.date === currentDateStr && !t.time).length
      : 0;
    const todoCountEl = document.getElementById('mobileTodoCount');
    if (todoCountEl) todoCountEl.textContent = unscheduledCount;
  }

  // Mise à jour de l'état actif dans la barre inférieure
  const navBtnToday = document.getElementById('mobileNavToday');
  if (navBtnToday) {
    navBtnToday.classList.toggle('active', currentTimelineOffset === 0);
  }
}

function selectDateFromStrip(targetOffset) {
  currentTimelineOffset = targetOffset;
  if (currentMobileDayView === 'backlog') {
    setMobileDayView('agenda');
  }
  renderPlanGrid(true);
  renderDateStrip();
  applyDynamicScroll();
}


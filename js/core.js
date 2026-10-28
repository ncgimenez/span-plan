/**
 * @fileoverview SpanCore - Centralized Domain Model, Utilities & Reactive Store for the Span Suite (Plan, Focus, Loop)
 * @version 2.0.0
 * 
 * Standardized Universal Data Contract:
 * - Dates & Time formatting
 * - Safe HTML escaping & URL extraction
 * - Smart Action Type resolution ('call', 'mail', 'pay', 'other')
 * - Universal Task & Subtask normalization (harmonizing 'context' & 'category', 'duration' & 'estimate')
 * - SpanReactiveStore: Event-driven reactive store with observer subscriptions & local persistence
 */

/**
 * @typedef {'work'|'life'|'fun'} SpanContext
 * @typedef {'Work'|'Home'|'Fun'} SpanCategory
 * @typedef {'task'|'event'} SpanEntityType
 * @typedef {'call'|'mail'|'pay'|'other'|null} SpanActionType
 * 
 * @typedef {Object} SpanSubtask
 * @property {string} id - Unique identifier
 * @property {string} title - Subtask description
 * @property {boolean} completed - Checkbox state
 * @property {SpanContext} context - Canonical context
 * @property {SpanCategory} category - Legacy compatibility category
 * @property {SpanActionType} [actionType] - Detected or explicit action
 * 
 * @typedef {Object} SpanTask
 * @property {string} id - Unique identifier (e.g. 't_123' or UUID)
 * @property {string} title - Task title
 * @property {SpanEntityType} type - 'task' or 'event'
 * @property {boolean} isEvent - Backward-compatibility boolean (type === 'event')
 * @property {SpanContext} context - Canonical context ('work', 'life', 'fun')
 * @property {SpanCategory} category - Backward-compatibility category ('Work', 'Home', 'Fun')
 * @property {number} duration - Duration in minutes (e.g. 15, 30, 45, 60...)
 * @property {number} estimate - Number of 30min pomodoro blocks (Math.max(1, Math.round(duration / 30)))
 * @property {boolean} completed - Task completion status
 * @property {boolean} important - Starred/priority flag
 * @property {boolean} isFavorite - Backward-compatibility flag (same as important)
 * @property {string|null} date - Scheduled date 'YYYY-MM-DD'
 * @property {string|null} scheduledDate - Backward-compatibility scheduled date
 * @property {string|null} time - Scheduled start time 'HH:MM'
 * @property {string|null} scheduledTime - Backward-compatibility scheduled time
 * @property {boolean} [allDay] - Whether scheduled across entire day
 * @property {SpanActionType} [actionType] - Action badge
 * @property {SpanSubtask[]} [subtasks] - Nested checklist items
 * @property {string} [notes] - Additional details or Markdown notes
 * @property {string} [url] - Attached web link
 * @property {string} [location] - Location or physical spot
 * @property {string} [created_at] - ISO timestamp
 * @property {string} [updated_at] - ISO timestamp
 */

(function(global) {
  'use strict';

  /**
   * Returns a local date string in YYYY-MM-DD format (respecting device local timezone, not UTC).
   * @param {Date|string} [dateObj=new Date()]
   * @returns {string} 'YYYY-MM-DD'
   */
  function getLocalDateString(dateObj = new Date()) {
    if (typeof dateObj === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateObj)) return dateObj;
      dateObj = new Date(dateObj);
    }
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
      dateObj = new Date();
    }
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Converts 'HH:MM' string to total minutes from midnight (0 - 1439).
   * @param {string} timeStr e.g. "09:30"
   * @returns {number}
   */
  function timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.trim().split(':');
    if (parts.length < 2) return 0;
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return (h * 60) + m;
  }

  /**
   * Converts total minutes from midnight to normalized 'HH:MM' string.
   * @param {number} totalMins 
   * @returns {string} e.g. "14:15"
   */
  function minutesToTime(totalMins) {
    const norm = ((parseInt(totalMins, 10) || 0) % 1440 + 1440) % 1440;
    const h = String(Math.floor(norm / 60)).padStart(2, '0');
    const m = String(norm % 60).padStart(2, '0');
    return `${h}:${m}`;
  }

  /**
   * Formats hour integer to 'HH:00'.
   * @param {number} h 
   * @returns {string} e.g. "08:00"
   */
  function formatHour(h) {
    const norm = ((parseInt(h, 10) || 0) % 24 + 24) % 24;
    return `${String(norm).padStart(2, '0')}:00`;
  }

  /**
   * Safely escapes HTML special characters to prevent injection.
   * @param {string} str 
   * @returns {string}
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Extracts clean web URL from task explicit url, location, or notes.
   * @param {Object} task 
   * @returns {string|null}
   */
  function extractTaskUrl(task) {
    if (!task) return null;
    const urlRegex = /(https?:\/\/[^\s<>"'\)]+|www\.[^\s<>"'\)]+)/i;
    
    // 1. Direct explicit url field
    if (task.url && typeof task.url === 'string') {
      let clean = task.url.trim();
      if (clean.startsWith('www.')) clean = 'https://' + clean;
      return clean;
    }
    // 2. Check location
    if (task.location && typeof task.location === 'string') {
      const locMatch = task.location.match(urlRegex);
      if (locMatch) {
        let clean = locMatch[0].trim();
        if (clean.startsWith('www.')) clean = 'https://' + clean;
        return clean;
      }
    }
    // 3. Check notes
    if (task.notes && typeof task.notes === 'string') {
      const noteMatch = task.notes.match(urlRegex);
      if (noteMatch) {
        let clean = noteMatch[0].trim();
        if (clean.startsWith('www.')) clean = 'https://' + clean;
        return clean;
      }
    }
    return null;
  }

  /**
   * Resolves the effective action type for a task or subtask ('call', 'mail', 'pay', 'other', or null).
   * @param {Object} task 
   * @returns {SpanActionType}
   */
  function getTaskActionType(task) {
    if (!task) return null;
    // Explicit override
    if (task.actionType) {
      const val = String(task.actionType).toLowerCase().trim();
      if (val === 'call' || val === 'mail' || val === 'pay' || val === 'other') return val;
      if (val === 'none' || val === 'standard') return 'other';
    }
    // Title auto-detection
    const title = (task.title || '').toLowerCase();
    if (/\b(call|appel|appeler|phone|tél|tel|ring)\b/i.test(title)) return 'call';
    if (/\b(mail|email|e-mail|écrire|courriel|send mail)\b/i.test(title)) return 'mail';
    if (/\b(pay|payer|paiement|facture|invoice|bill|virement|regler|règlement)\b/i.test(title)) return 'pay';
    return null;
  }

  /**
   * Universal Task Normalizer - Standardizes any task or event object across Plan & Focus.
   * Guarantees that context/category, duration/estimate, type/isEvent, date/scheduledDate,
   * and important/isFavorite exist simultaneously and consistently.
   * 
   * @param {Object} raw 
   * @returns {SpanTask}
   */
  function normalizeTask(raw) {
    if (!raw || typeof raw !== 'object') {
      return {
        id: 't_' + Math.random().toString(36).slice(2, 9),
        title: 'Nouvelle tâche',
        type: 'task',
        isEvent: false,
        context: 'work',
        category: 'Work',
        duration: 30,
        estimate: 1,
        completed: false,
        important: false,
        isFavorite: false,
        date: null,
        scheduledDate: null,
        time: null,
        scheduledTime: null,
        allDay: false,
        actionType: null,
        subtasks: []
      };
    }

    const task = { ...raw };

    // 1. Context / Category Normalization
    let ctx = 'work';
    if (task.context) {
      const c = String(task.context).toLowerCase().trim();
      if (['work', 'code', 'study', 'write', 'job'].includes(c)) ctx = 'work';
      else if (['life', 'home', 'admin', 'personal', 'famille'].includes(c)) ctx = 'life';
      else if (['fun', 'health', 'self', 'loisir', 'sport'].includes(c)) ctx = 'fun';
    } else if (task.category) {
      const c = String(task.category).toLowerCase().trim();
      if (['work'].includes(c)) ctx = 'work';
      else if (['home', 'life'].includes(c)) ctx = 'life';
      else if (['fun'].includes(c)) ctx = 'fun';
    }
    task.context = ctx;
    task.category = (ctx === 'work' ? 'Work' : (ctx === 'life' ? 'Home' : 'Fun'));

    // 2. Type / isEvent Normalization
    const isEv = Boolean(task.type === 'event' || task.isEvent);
    task.type = isEv ? 'event' : 'task';
    task.isEvent = isEv;

    // 3. Duration / Estimate Normalization (30m pomodoro blocks)
    let dur = 30;
    if (typeof task.duration === 'number' && !isNaN(task.duration) && task.duration > 0) {
      dur = Math.round(task.duration);
    } else if (typeof task.estimate === 'number' && !isNaN(task.estimate) && task.estimate > 0) {
      dur = Math.round(task.estimate * 30);
    }
    task.duration = dur;
    task.estimate = Math.max(1, Math.round(dur / 30));

    // 4. Date / ScheduledDate
    const d = task.date || task.scheduledDate || null;
    task.date = d;
    task.scheduledDate = d;

    // 5. Time / ScheduledTime
    const t = task.time || task.scheduledTime || null;
    task.time = t;
    task.scheduledTime = t;

    // 6. Important / isFavorite
    const imp = Boolean(task.important || task.isFavorite);
    task.important = imp;
    task.isFavorite = imp;

    // 7. Completed status
    task.completed = !isEv && Boolean(task.completed);
    task.allDay = Boolean(task.allDay);

    // 8. Action Type
    task.actionType = getTaskActionType(task);

    // 9. Subtasks Normalization
    if (Array.isArray(task.subtasks)) {
      task.subtasks = task.subtasks.map(st => {
        let subCtx = ctx;
        if (st.context) {
          const sc = String(st.context).toLowerCase().trim();
          subCtx = ['life', 'home'].includes(sc) ? 'life' : (sc === 'fun' ? 'fun' : 'work');
        } else if (st.category) {
          const sc = String(st.category).toLowerCase().trim();
          subCtx = ['home', 'life'].includes(sc) ? 'life' : (sc === 'fun' ? 'fun' : 'work');
        }
        return {
          id: st.id || ('st_' + Math.random().toString(36).slice(2, 9)),
          title: st.title || 'Sous-tâche',
          completed: Boolean(st.completed),
          context: subCtx,
          category: (subCtx === 'work' ? 'Work' : (subCtx === 'life' ? 'Home' : 'Fun')),
          actionType: st.actionType || getTaskActionType(st)
        };
      });
    } else {
      task.subtasks = [];
    }

    return task;
  }

  /**
   * SpanReactiveStore - Light, High-Performance Event-Driven Store for Span applications.
   * Manages in-memory state, local persistence, cross-tab broadcast notifications, and undo/redo history.
   */
  class SpanReactiveStore {
    /**
     * @param {string} storageKey 
     * @param {Object} [options={}]
     */
    constructor(storageKey, options = {}) {
      this.storageKey = storageKey;
      this.tasks = [];
      this.subscribers = new Set();
      this.history = [];
      this.maxHistory = options.maxHistory || 25;
      this.broadcastChannelName = options.broadcastChannel || 'span_suite_bridge';
      this.bridge = null;

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          this.bridge = new BroadcastChannel(this.broadcastChannelName);
          if (typeof this.bridge.unref === 'function') {
            this.bridge.unref();
          }
        } catch (e) {}
      }
    }

    /**
     * Loads tasks from localStorage and normalizes each record.
     * @returns {SpanTask[]}
     */
    load() {
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(this.storageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              this.tasks = parsed.map(t => normalizeTask(t));
            }
          }
        }
      } catch (e) {
        console.warn('SpanReactiveStore.load failed:', e);
      }
      return this.tasks;
    }

    /**
     * Persists current state to localStorage and broadcasts to peer tabs.
     * @param {'local'|'remote'|'sync'} [source='local']
     */
    save(source = 'local') {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.storageKey, JSON.stringify(this.tasks));
        }
      } catch (e) {
        console.warn('SpanReactiveStore.save failed:', e);
      }

      if (this.bridge && source === 'local') {
        try {
          this.bridge.postMessage({
            type: 'STORE_UPDATED',
            storageKey: this.storageKey,
            timestamp: Date.now()
          });
        } catch (e) {}
      }
    }

    /**
     * Subscribes a listener function to store mutations.
     * @param {Function} listener - Callback (event, payload, tasks) => void
     * @returns {Function} Unsubscribe handle
     */
    subscribe(listener) {
      if (typeof listener === 'function') {
        this.subscribers.add(listener);
        return () => this.subscribers.delete(listener);
      }
      return () => {};
    }

    /**
     * Dispatches notification to all registered subscribers.
     * @param {string} event 
     * @param {Object} payload 
     */
    notify(event = 'change', payload = {}) {
      this.subscribers.forEach(fn => {
        try {
          fn(event, payload, this.tasks);
        } catch (err) {
          console.error('SpanReactiveStore subscriber error:', err);
        }
      });
    }

    /**
     * Records snapshot to undo stack.
     */
    pushUndoState() {
      try {
        this.history.push(JSON.stringify(this.tasks));
        if (this.history.length > this.maxHistory) {
          this.history.shift();
        }
      } catch (e) {}
    }

    /**
     * Reverts to previous recorded state.
     * @returns {boolean}
     */
    undo() {
      if (this.history.length === 0) return false;
      const prevJson = this.history.pop();
      try {
        const parsed = JSON.parse(prevJson);
        if (Array.isArray(parsed)) {
          this.tasks = parsed.map(t => normalizeTask(t));
          this.save('local');
          this.notify('undo', { tasks: this.tasks });
          return true;
        }
      } catch (e) {}
      return false;
    }

    /**
     * Returns in-memory tasks array.
     * @returns {SpanTask[]}
     */
    getTasks() {
      return this.tasks;
    }

    /**
     * Returns task by ID.
     * @param {string} id 
     * @returns {SpanTask|null}
     */
    getTask(id) {
      return this.tasks.find(t => String(t.id) === String(id)) || null;
    }

    /**
     * Sets tasks wholesale (e.g. from sync or sample load).
     * @param {Array} newTasks 
     * @param {'local'|'remote'|'sync'} [source='local']
     */
    setTasks(newTasks, source = 'local') {
      if (source === 'local') this.pushUndoState();
      this.tasks = (Array.isArray(newTasks) ? newTasks : []).map(t => normalizeTask(t));
      this.save(source);
      this.notify('set', { source });
    }

    /**
     * Prepends or inserts a new task.
     * @param {Object} task 
     * @param {'local'|'remote'|'sync'} [source='local']
     * @returns {SpanTask}
     */
    addTask(task, source = 'local') {
      if (source === 'local') this.pushUndoState();
      const normalized = normalizeTask(task);
      this.tasks.unshift(normalized);
      this.save(source);
      this.notify('add', { task: normalized, source });
      return normalized;
    }

    /**
     * Updates an existing task by ID with partial diff.
     * @param {string} id 
     * @param {Object} diff 
     * @param {'local'|'remote'|'sync'} [source='local']
     * @returns {SpanTask|null}
     */
    updateTask(id, diff, source = 'local') {
      const idx = this.tasks.findIndex(t => String(t.id) === String(id));
      if (idx === -1) return null;
      if (source === 'local') this.pushUndoState();
      const updated = normalizeTask({
        ...this.tasks[idx],
        ...diff,
        updated_at: new Date().toISOString()
      });
      this.tasks[idx] = updated;
      this.save(source);
      this.notify('update', { id, task: updated, source });
      return updated;
    }

    /**
     * Removes a task by ID.
     * @param {string} id 
     * @param {'local'|'remote'|'sync'} [source='local']
     * @returns {boolean}
     */
    deleteTask(id, source = 'local') {
      const idx = this.tasks.findIndex(t => String(t.id) === String(id));
      if (idx === -1) return false;
      if (source === 'local') this.pushUndoState();
      const deleted = this.tasks[idx];
      this.tasks.splice(idx, 1);
      this.save(source);
      this.notify('delete', { id, task: deleted, source });
      return true;
    }
  }

  /**
   * Helper factory to create a store.
   * @param {string} storageKey 
   * @param {Object} [options={}]
   * @returns {SpanReactiveStore}
   */
  function createStore(storageKey, options = {}) {
    const store = new SpanReactiveStore(storageKey, options);
    store.load();
    return store;
  }

  const SpanCore = {
    getLocalDateString,
    timeToMinutes,
    minutesToTime,
    formatHour,
    escapeHtml,
    extractTaskUrl,
    getTaskActionType,
    normalizeTask,
    SpanReactiveStore,
    createStore
  };

  // Browser global export
  if (typeof window !== 'undefined') {
    window.SpanCore = SpanCore;
    window.SpanReactiveStore = SpanReactiveStore;
    if (!window.getLocalDateString) window.getLocalDateString = getLocalDateString;
    if (!window.timeToMinutes) window.timeToMinutes = timeToMinutes;
    if (!window.minutesToTime) window.minutesToTime = minutesToTime;
    if (!window.formatHour) window.formatHour = formatHour;
    if (!window.escapeHtml) window.escapeHtml = escapeHtml;
    if (!window.extractTaskUrl) window.extractTaskUrl = extractTaskUrl;
    if (!window.getTaskActionType) window.getTaskActionType = getTaskActionType;
    if (!window.normalizeTask) window.normalizeTask = normalizeTask;
  }

  // Node.js module export for native unit testing
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpanCore;
  }

})(typeof window !== 'undefined' ? window : this);

/**
 * SpanCore - Centralized Utilities for the Span Suite (Plan, Focus, Loop)
 * Standardized date formatting, time math, HTML escaping, URL extraction, and action detection.
 */
(function(window) {
  'use strict';

  /**
   * Returns a local date string in YYYY-MM-DD format (respecting device local timezone, not UTC).
   * @param {Date|string} dateObj 
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
   * @returns {'call'|'mail'|'pay'|'other'|null}
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

  const SpanCore = {
    getLocalDateString,
    timeToMinutes,
    minutesToTime,
    formatHour,
    escapeHtml,
    extractTaskUrl,
    getTaskActionType
  };

  // Expose on SpanCore namespace
  window.SpanCore = SpanCore;

  // Global backward-compatibility aliases
  if (!window.getLocalDateString) window.getLocalDateString = getLocalDateString;
  if (!window.timeToMinutes) window.timeToMinutes = timeToMinutes;
  if (!window.minutesToTime) window.minutesToTime = minutesToTime;
  if (!window.formatHour) window.formatHour = formatHour;
  if (!window.escapeHtml) window.escapeHtml = escapeHtml;
  if (!window.extractTaskUrl) window.extractTaskUrl = extractTaskUrl;
  if (!window.getTaskActionType) window.getTaskActionType = getTaskActionType;

})(typeof window !== 'undefined' ? window : this);

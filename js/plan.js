:root {
  --bg: #0d0d0f;
  --card-bg: #18181b;
  --card-sub-bg: #141416;
  --card-border: rgba(255, 255, 255, 0.08);
  --card-border-hover: rgba(255, 255, 255, 0.2);
  --card-hover: rgba(255, 255, 255, 0.06);
  --text-main: #f4f4f6;
  --text-muted: #8e8e98;
  --accent: #e4e4e7; 
  --accent-active: #ffffff;
  --streak: #e2b340;
  --danger: #ef4444;
  --now-line: #ef4444;

  /* PALETTE SPAN */
  --color-work: #818cf8; /* Indigo */
  --color-life: #10b981; /* Emerald */
  --color-fun: #fb7185;  /* Coral */

  --hour-height: 54px;
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif;
}

[data-theme="light"] {
  --bg: #f8f8fa;
  --card-bg: #ffffff;
  --card-sub-bg: #f3f3f6;
  --card-border: rgba(0, 0, 0, 0.08);
  --card-border-hover: rgba(0, 0, 0, 0.2);
  --card-hover: rgba(0, 0, 0, 0.03);
  --text-main: #18181b;
  --text-muted: #71717a;
  --accent: #27272a;
  --accent-active: #09090b;

  --color-work: #818cf8;
  --color-life: #10b981;
  --color-fun: #fb7185;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

html, body {
  height: 100%;
  height: -webkit-fill-available;
}

body {
  background-color: var(--bg);
  color: var(--text-main);
  font-family: var(--font);
  height: 100dvh;
  display: flex;
  justify-content: center;
  align-items: stretch;
  overflow: hidden;
  transition: background-color 0.25s ease, color 0.25s ease;
}

.desktop-shell {
  width: 100%;
  max-width: 1600px;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: env(safe-area-inset-top, 8px) 12px env(safe-area-inset-bottom, 8px) 12px;
  box-sizing: border-box;
  position: relative;
}

/* TOP APP HEADER */
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 2px 8px 2px;
  gap: 8px;
  flex-shrink: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.brand-badge {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid var(--card-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 12px;
  color: var(--accent);
}

.brand-name {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.brand-app {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
}

/* CONTEXT SWITCHER : POINTS SUR MOBILE, EXPANSION SI ACTIF */
.context-switch {
  display: flex;
  align-items: center;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 20px;
  padding: 2px 4px;
  gap: 4px;
}

.context-btn {
  background: none;
  border: none;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  color: var(--text-muted);
}

/* Pastille point par défaut */
.context-btn::before {
  content: "";
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.context-btn[data-context="all"]::before { background: var(--text-muted); }
.context-btn.cat-work::before { background: var(--color-work); }
.context-btn.cat-life::before { background: var(--color-life); }
.context-btn.cat-fun::before  { background: var(--color-fun); }

/* Version mobile : texte masqué si inactif, révélé si actif */
@media (max-width: 680px) {
  .context-btn:not(.active) span {
    display: none;
  }
  .context-btn:not(.active) {
    padding: 6px;
  }
}

.context-btn.active {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-main);
}

.context-btn.active.cat-work { background: rgba(129, 140, 248, 0.2); color: var(--color-work); }
.context-btn.active.cat-life { background: rgba(16, 185, 129, 0.2);  color: var(--color-life); }
.context-btn.active.cat-fun  { background: rgba(251, 113, 133, 0.2); color: var(--color-fun);  }

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.plan-bridge-btn, .icon-btn {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  color: var(--text-main);
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all 0.2s ease;
}

.icon-btn.mini {
  padding: 4px 7px;
  font-size: 11px;
}

.backlog-counter-pill {
  background: rgba(255, 255, 255, 0.12);
  padding: 1px 5px;
  border-radius: 8px;
  font-size: 10px;
}

/* TIMELINE CONTROLS */
.timeline-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 2px 8px 2px;
  gap: 8px;
  flex-shrink: 0;
}

.timeline-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-arrow-btn {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  color: var(--text-main);
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.today-jump-btn {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  color: var(--text-main);
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.current-range-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  margin-left: 4px;
}

.view-mode-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pill-group {
  display: flex;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  padding: 2px;
}

.pill-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.pill-btn.active {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-main);
}

/* QUICK ADD BAR */
.quick-add-container {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 10px;
  padding: 6px 10px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.quick-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-main);
  font-size: 13px;
  min-width: 0;
}

.quick-select {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  outline: none;
  cursor: pointer;
}

.quick-select option {
  background: #18181b;
  color: #fff;
}

.btn-quick-add {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: var(--text-main);
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
}

/* WORKSPACE */
.workspace-main {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
  overflow: hidden;
  gap: 10px;
}

.planner-board-container {
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  display: flex;
  width: 100%;
}

.planner-grid {
  display: flex;
  flex-direction: row;
  gap: 10px;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
}

.planner-grid.view-single {
  justify-content: center;
}

.planner-grid.view-single .day-column {
  max-width: 760px;
  width: 100%;
  flex: 0 1 760px;
}

/* DAY COLUMN */
.day-column {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  flex: 1 0 280px;
  min-width: 260px;
  max-width: 440px;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.day-column.is-today {
  border-color: rgba(255, 255, 255, 0.22);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
}

.day-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--card-border);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  background: rgba(255, 255, 255, 0.02);
  flex-shrink: 0;
}

.day-title-wrap {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.day-name {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.day-column.is-today .day-name {
  color: var(--color-life);
}

.day-date {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}

.day-meta-est {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

/* HORAIRE VERTICAL : CYCLE 24H */
.day-schedule-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  position: relative;
  background: var(--card-sub-bg);
  -webkit-overflow-scrolling: touch;
}

.schedule-grid-canvas {
  position: relative;
  height: calc(24 * var(--hour-height)); /* 24 heures complètes = 1296px */
  width: 100%;
}

.hour-row {
  position: absolute;
  left: 0;
  right: 0;
  height: var(--hour-height);
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  display: flex;
  align-items: flex-start;
  pointer-events: none;
}

.hour-label {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.3);
  padding: 2px 6px;
  width: 44px;
  text-align: right;
  flex-shrink: 0;
}

.hour-line {
  flex: 1;
  height: 1px;
}

/* NOW LINE */
.now-timeline-marker {
  position: absolute;
  left: 0;
  right: 0;
  height: 1.5px;
  background: var(--now-line);
  z-index: 15;
  display: flex;
  align-items: center;
  pointer-events: none;
}

.now-timeline-marker::before {
  content: "";
  position: absolute;
  left: 42px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--now-line);
  box-shadow: 0 0 6px var(--now-line);
  transform: translate(-50%, 0);
}

.now-badge {
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  background: var(--now-line);
  padding: 1px 4px;
  border-radius: 3px;
  position: absolute;
  left: 6px;
}

/* BLOCS HORAIRES */
.schedule-block-item {
  position: absolute;
  left: 48px;
  right: 8px;
  background: #18181b;
  border: 1px solid var(--card-border);
  border-left: 3.5px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 6px 8px;
  cursor: grab;
  z-index: 5;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  overflow: visible;
  box-sizing: border-box;
}

.schedule-block-item:active {
  cursor: grabbing;
}

.schedule-block-item.dragging {
  opacity: 0.45;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
  z-index: 50;
}

.schedule-block-item.is-resizing {
  user-select: none;
  border-color: rgba(255, 255, 255, 0.35);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
  z-index: 40;
}

.resize-handle {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 8px;
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.resize-handle::after {
  content: "";
  width: 20px;
  height: 2px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.2);
}

.schedule-block-item:hover .resize-handle::after,
.resize-handle:hover::after {
  background: var(--text-main);
  transform: scaleY(1.4);
}

.schedule-block-item.cat-work { border-left-color: var(--color-work) !important; }
.schedule-block-item.cat-life { border-left-color: var(--color-life) !important; }
.schedule-block-item.cat-fun  { border-left-color: var(--color-fun) !important;  }

.schedule-block-item.rollover .schedule-block-title {
  color: var(--streak) !important;
  font-style: italic;
  font-weight: 500;
}

.schedule-block-top {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.schedule-block-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.schedule-block-time {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
}

.schedule-block-sub {
  font-size: 10px;
  color: var(--text-muted);
  font-weight: 500;
  padding-left: 22px;
}

.schedule-grid-canvas.drag-over {
  background: rgba(255, 255, 255, 0.02);
}

/* DOCK INFÉRIEUR CALÉ AU RAS */
.day-dock {
  border-top: 1px solid var(--card-border);
  background: var(--card-bg);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 80px;
  max-height: 240px;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.day-dock.drag-over {
  background: rgba(255, 255, 255, 0.06);
  outline: 1.5px dashed rgba(255, 255, 255, 0.3);
}

.dock-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 2px 2px 2px;
}

.dock-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}

.dock-count-pill {
  font-size: 10px;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 5px;
  border-radius: 6px;
}

.dock-task-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow-y: auto;
  max-height: 190px;
  padding-right: 2px;
}

/* TASK ITEM */
.task-item {
  background: #18181b;
  border: 1px solid var(--card-border);
  border-left: 3.5px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 7px 9px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  cursor: grab;
  transition: all 0.15s ease;
  position: relative;
}

[data-theme="light"] .task-item {
  background: #ffffff;
}

.task-item.cat-work { border-left-color: var(--color-work) !important; }
.task-item.cat-life { border-left-color: var(--color-life) !important; }
.task-item.cat-fun  { border-left-color: var(--color-fun) !important;  }

.task-item.rollover .task-text {
  color: var(--streak) !important;
  font-style: italic;
  font-weight: 500;
}

.task-row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.checkbox {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 10px;
}

.task-item.completed .checkbox,
.schedule-block-item.completed .checkbox {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg);
}

.task-text {
  font-size: 12.5px;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 450;
  flex: 1;
  cursor: pointer;
}

.task-item.completed .task-text,
.schedule-block-item.completed .schedule-block-title {
  color: var(--text-muted) !important;
  text-decoration: line-through;
  font-style: normal !important;
}

.btn-task-menu {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
  cursor: pointer;
  border-radius: 4px;
  opacity: 0.6;
}

.task-inline-tag {
  display: inline-flex;
  align-items: center;
  font-size: 9.5px;
  font-weight: 600;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 4px;
  border-radius: 4px;
  cursor: pointer;
  margin: 0 2px;
}

/* POPOVER */
.task-popover-menu {
  position: fixed;
  background: #1c1c1f;
  border: 1px solid var(--card-border-hover);
  border-radius: 12px;
  padding: 5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
  z-index: 250;
  min-width: 170px;
}

[data-theme="light"] .task-popover-menu {
  background: #ffffff;
}

.popover-item {
  background: none;
  border: none;
  color: var(--text-main);
  font-size: 12px;
  font-weight: 500;
  padding: 7px 10px;
  border-radius: 7px;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.popover-item.danger { color: var(--danger); }

/* DRAWER */
.backlog-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 310px;
  background: #141416;
  border-left: 1px solid var(--card-border);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 90;
  box-shadow: -8px 0 25px rgba(0, 0, 0, 0.5);
}

[data-theme="light"] .backlog-drawer {
  background: #ffffff;
}

.backlog-drawer.open {
  transform: translateX(0);
}

@media (min-width: 900px) {
  .backlog-drawer.pinned {
    position: relative !important;
    transform: none !important;
    box-shadow: none !important;
    flex-shrink: 0;
  }
}

.drawer-header {
  padding: 10px 12px;
  border-bottom: 1px solid var(--card-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.drawer-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.drawer-actions {
  display: flex;
  gap: 4px;
}

.drawer-quick-add {
  padding: 8px 10px;
  display: flex;
  gap: 6px;
  border-bottom: 1px solid var(--card-border);
}

.drawer-quick-add input {
  flex: 1;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  padding: 5px 8px;
  color: var(--text-main);
  font-size: 12px;
  outline: none;
}

.drawer-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px;
}

/* MODALES */
.modal-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(10px);
  z-index: 200;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-card {
  width: 100%;
  max-width: 420px;
  background: #18181b;
  border: 1px solid var(--card-border);
  border-radius: 16px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

[data-theme="light"] .modal-card {
  background: #ffffff;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modal-label {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.06em;
  font-weight: 600;
}

.modal-input {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  padding: 8px 10px;
  color: var(--text-main);
  font-size: 13.5px;
  outline: none;
}

.form-row {
  display: flex;
  gap: 8px;
}

.form-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.category-pills {
  display: flex;
  gap: 6px;
}

.cat-pill {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  color: var(--text-muted);
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.cat-pill.cat-work { color: var(--color-work); }
.cat-pill.cat-life { color: var(--color-life); }
.cat-pill.cat-fun  { color: var(--color-fun);  }

.cat-pill.active {
  background: rgba(255, 255, 255, 0.15);
  color: var(--text-main);
}

.cat-pill.active.cat-work { background: rgba(129, 140, 248, 0.2); }
.cat-pill.active.cat-life { background: rgba(16, 185, 129, 0.2); }
.cat-pill.active.cat-fun  { background: rgba(251, 113, 133, 0.2); }

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-cancel {
  background: transparent;
  border: none;
  color: var(--text-muted);
  padding: 7px 12px;
  font-size: 12px;
  cursor: pointer;
}

.btn-save {
  background: var(--text-main);
  color: var(--bg);
  border: none;
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}

.btn-theme-toggle {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  color: var(--text-main);
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
}

.backup-section {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.btn-backup {
  flex: 1;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  color: var(--text-main);
  padding: 8px;
  border-radius: 8px;
  font-size: 11px;
  cursor: pointer;
  text-align: center;
}

/* NAVIGATION MOBILE AU BAS DE L'ÉCRAN */
.mobile-nav {
  position: fixed !important;
  bottom: 0 !important;
  left: 0 !important;
  right: 0 !important;
  height: calc(48px + env(safe-area-inset-bottom, 0px)) !important;
  background: rgba(13, 13, 15, 0.95) !important;
  backdrop-filter: blur(12px) !important;
  border-top: 1px solid var(--card-border) !important;
  display: flex !important;
  justify-content: center !important;
  align-items: flex-start !important;
  padding-top: 4px !important;
  padding-bottom: env(safe-area-inset-bottom, 0px) !important;
  z-index: 100 !important;
}

[data-theme="light"] .mobile-nav {
  background: rgba(248, 248, 250, 0.95) !important;
}

.nav-items {
  width: 100%;
  max-width: 440px;
  display: flex;
  justify-content: space-around;
}

.nav-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11.5px;
  font-weight: 600;
  padding: 5px 10px;
  cursor: pointer;
}

.nav-btn.active {
  color: var(--text-main);
}

@media (min-width: 768px) {
  .mobile-nav {
    display: none !important;
  }
}

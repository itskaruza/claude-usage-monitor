const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

let data = null;
let sessionCountdown = null;

// ─── Cycle Calculations ───────────────────────────────────────

// Parse "Fri 2:00 AM" → next Friday 2:00 AM (local time)
function parseResetText(text) {
  if (!text) return null;
  const match = text.match(/(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  const dayName = match[1].charAt(0).toUpperCase() + match[1].slice(1, 3).toLowerCase();
  const targetDay = DAY_MAP[dayName];
  let hour = parseInt(match[2]);
  const min = parseInt(match[3]);
  const ampm = match[4].toUpperCase();
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;

  const now = new Date();
  const result = new Date(now);
  let daysForward = (targetDay - now.getDay() + 7) % 7;
  result.setDate(now.getDate() + daysForward);
  result.setHours(hour, min, 0, 0);
  if (result <= now) result.setDate(result.getDate() + 7);
  return result;
}

// Given next reset + cycle length, compute cycle start, day index, ideal %
function getCycleInfo(resetText, cycleLengthDays) {
  const nextReset = parseResetText(resetText);
  if (!nextReset) return null;
  const cycleStart = new Date(nextReset);
  cycleStart.setDate(cycleStart.getDate() - cycleLengthDays);

  const now = new Date();
  const totalMs = nextReset - cycleStart;
  const elapsedMs = Math.max(0, Math.min(now - cycleStart, totalMs));
  const progressPct = (elapsedMs / totalMs) * 100;
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  const dayIndex = Math.min(Math.floor(elapsedDays), cycleLengthDays - 1);

  return { cycleStart, nextReset, progressPct, dayIndex, cycleLengthDays };
}

// Build day labels from cycle start (e.g. Sun Mon Tue Wed Thu)
function buildDayLabels(cycleStart, cycleLengthDays) {
  const labels = [];
  for (let i = 0; i < cycleLengthDays; i++) {
    const d = new Date(cycleStart);
    d.setDate(d.getDate() + i);
    labels.push(DAY_NAMES[d.getDay()]);
  }
  return labels;
}

// ─── Rendering ────────────────────────────────────────────────

function renderDividers(containerId, cycleLengthDays) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  for (let i = 1; i < cycleLengthDays; i++) {
    const div = document.createElement('span');
    div.className = 'divider';
    div.style.left = `${(i / cycleLengthDays) * 100}%`;
    el.appendChild(div);
  }
}

function renderDayLabels(containerId, cycleInfo) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  if (!cycleInfo) return;
  const labels = buildDayLabels(cycleInfo.cycleStart, cycleInfo.cycleLengthDays);
  labels.forEach((label, i) => {
    const span = document.createElement('span');
    span.className = 'day-label';
    if (i === cycleInfo.dayIndex) span.classList.add('current');
    else if (i < cycleInfo.dayIndex) span.classList.add('past');
    span.textContent = label;
    el.appendChild(span);
  });
}

function renderBar(barId, percentage, cycleInfo) {
  const bar = document.getElementById(barId);
  const pct = Math.max(0, Math.min(100, percentage));
  bar.style.width = `${pct}%`;
  bar.classList.toggle('full', pct >= 99.5);

  if (cycleInfo) {
    const ideal = cycleInfo.progressPct;
    if (pct > ideal) {
      const splitPoint = (ideal / pct) * 100;
      bar.style.background = `linear-gradient(to right, #d4a574 ${splitPoint}%, #e74c3c ${splitPoint}%)`;
    } else {
      bar.style.background = '#d4a574';
    }
  } else {
    bar.style.background = '#d4a574';
  }
}

function renderBudgetMarker(markerId, cycleInfo) {
  const marker = document.getElementById(markerId);
  if (!cycleInfo) { marker.style.display = 'none'; return; }
  marker.style.left = `${cycleInfo.progressPct}%`;
  marker.style.display = cycleInfo.progressPct >= 100 ? 'none' : 'block';
}

function renderStatus(statusId, percentage, cycleInfo) {
  const el = document.getElementById(statusId);
  if (!cycleInfo) {
    el.textContent = 'No reset info — sync to load';
    el.className = 'status-indicator neutral';
    return;
  }
  const ideal = cycleInfo.progressPct;
  const labels = buildDayLabels(cycleInfo.cycleStart, cycleInfo.cycleLengthDays);
  const dayLabel = labels[cycleInfo.dayIndex];
  const dayPosition = `Day ${cycleInfo.dayIndex + 1}/${cycleInfo.cycleLengthDays}`;

  if (percentage === 0) {
    el.textContent = `${dayPosition} (${dayLabel})`;
    el.className = 'status-indicator neutral';
  } else if (percentage > ideal) {
    const overBy = (percentage - ideal).toFixed(1);
    el.textContent = `${dayLabel}: +${overBy}% over pace`;
    el.className = 'status-indicator over';
  } else {
    const underBy = (ideal - percentage).toFixed(1);
    el.textContent = `${dayLabel}: ${underBy}% under pace`;
    el.className = 'status-indicator on-track';
  }
}

function renderResetInfo(elementId, resetText) {
  const el = document.getElementById(elementId);
  el.textContent = resetText ? `Resets ${resetText}` : 'Resets —';
}

function renderSessionCountdown() {
  const el = document.getElementById('sessionReset');
  if (!sessionCountdown || sessionCountdown <= 0) {
    el.textContent = 'Resets in --';
    return;
  }
  const h = Math.floor(sessionCountdown / 3600);
  const m = Math.floor((sessionCountdown % 3600) / 60);
  el.textContent = `Resets in ${h}h ${m}m`;
}

function renderLastUpdated() {
  const el = document.getElementById('lastUpdated');
  if (!data || !data.lastUpdated) {
    el.textContent = 'Last updated: --';
    return;
  }
  const d = new Date(data.lastUpdated);
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) el.textContent = 'Last updated: just now';
  else if (diffMin < 60) el.textContent = `Last updated: ${diffMin}m ago`;
  else {
    const h = Math.floor(diffMin / 60);
    el.textContent = `Last updated: ${h}h ${diffMin % 60}m ago`;
  }
}

function renderAll() {
  if (!data) return;
  const cycleLen = data.cycleLengthDays || 7;

  // Session (simple bar, no cycle)
  document.getElementById('sessionPct').textContent = data.session.percentage;
  renderBar('sessionBar', data.session.percentage, null);

  // All Models
  const amCycle = getCycleInfo(data.allModels.resetText, cycleLen);
  document.getElementById('allModelsPct').textContent = data.allModels.percentage;
  renderDividers('allModelsDividers', cycleLen);
  renderBar('allModelsBar', data.allModels.percentage, amCycle);
  renderBudgetMarker('allModelsBudget', amCycle);
  renderStatus('allModelsStatus', data.allModels.percentage, amCycle);
  renderDayLabels('allModelsDays', amCycle);
  renderResetInfo('allModelsReset', data.allModels.resetText);

  // Sonnet Only
  const soCycle = getCycleInfo(data.sonnetOnly.resetText, cycleLen);
  document.getElementById('sonnetOnlyPct').textContent = data.sonnetOnly.percentage;
  renderDividers('sonnetOnlyDividers', cycleLen);
  renderBar('sonnetOnlyBar', data.sonnetOnly.percentage, soCycle);
  renderBudgetMarker('sonnetOnlyBudget', soCycle);
  renderStatus('sonnetOnlyStatus', data.sonnetOnly.percentage, soCycle);
  renderDayLabels('sonnetOnlyDays', soCycle);
  renderResetInfo('sonnetOnlyReset', data.sonnetOnly.resetText);

  renderSessionCountdown();
  renderLastUpdated();
}

// ─── Click-to-Edit ────────────────────────────────────────────

function setupEditing() {
  document.querySelectorAll('.pct-display').forEach(el => {
    el.addEventListener('click', () => {
      const field = el.dataset.field;
      const valueSpan = el.querySelector('.pct-value');
      const currentVal = parseInt(valueSpan.textContent) || 0;

      // Replace with input
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'pct-input';
      input.min = 0;
      input.max = 100;
      input.value = currentVal;

      // Hide the spans
      const signSpan = el.querySelector('.pct-sign');
      valueSpan.style.display = 'none';
      signSpan.style.display = 'none';
      el.insertBefore(input, valueSpan);

      input.focus();
      input.select();

      const commit = () => {
        let val = parseInt(input.value) || 0;
        val = Math.max(0, Math.min(100, val));

        if (field === 'session') {
          data.session.percentage = val;
        } else if (field === 'allModels') {
          data.allModels.percentage = val;
        } else if (field === 'sonnetOnly') {
          data.sonnetOnly.percentage = val;
        }

        data.lastUpdated = new Date().toISOString();
        window.api.saveUsage(data);

        // Restore spans
        input.remove();
        valueSpan.style.display = '';
        signSpan.style.display = '';
        renderAll();
      };

      const cancel = () => {
        input.remove();
        valueSpan.style.display = '';
        signSpan.style.display = '';
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { input.blur(); }
        if (e.key === 'Escape') {
          input.removeEventListener('blur', commit);
          cancel();
        }
      });
    });
  });
}

// ─── Session Timer Input ──────────────────────────────────────

function setupSessionTimer() {
  const hoursInput = document.getElementById('sessionHours');
  const minutesInput = document.getElementById('sessionMinutes');

  const updateFromInputs = () => {
    const h = parseInt(hoursInput.value) || 0;
    const m = parseInt(minutesInput.value) || 0;
    sessionCountdown = h * 3600 + m * 60;
    data.session.resetMinutes = Math.floor(sessionCountdown / 60);
    data.lastUpdated = new Date().toISOString();
    window.api.saveUsage(data);
    renderSessionCountdown();
  };

  hoursInput.addEventListener('change', updateFromInputs);
  minutesInput.addEventListener('change', updateFromInputs);

  // Populate from data
  if (data && data.session.resetMinutes > 0) {
    // Approximate remaining based on time since last update
    const elapsed = (Date.now() - new Date(data.lastUpdated).getTime()) / 1000;
    const remaining = Math.max(0, data.session.resetMinutes * 60 - elapsed);
    sessionCountdown = Math.floor(remaining);
    hoursInput.value = Math.floor(remaining / 3600) || '';
    minutesInput.value = Math.floor((remaining % 3600) / 60) || '';
  }
}

// ─── Auto-Reset Detection ─────────────────────────────────────

function checkAutoReset() {
  // Each bar now has its own reset time from the server.
  // The sync fetches fresh data every 15 minutes, so auto-reset is handled
  // by the sync itself — no local reset needed.
}

// ─── Title Bar Buttons ────────────────────────────────────────

function setupTitleBar() {
  document.getElementById('closeBtn').addEventListener('click', () => {
    window.api.closeWindow();
  });
  document.getElementById('minimizeBtn').addEventListener('click', () => {
    window.api.minimizeToTray();
  });
  document.getElementById('syncBtn').addEventListener('click', () => doSync());
}

let retryCount = 0;
let retryTimer = null;

async function doSync() {
  const btn = document.getElementById('syncBtn');
  if (btn.disabled) return;
  btn.classList.add('syncing');
  btn.disabled = true;
  showSyncStatus('Syncing...');

  const safetyTimeout = setTimeout(() => {
    btn.classList.remove('syncing');
    btn.disabled = false;
    showSyncError('Sync timed out');
    scheduleRetry();
  }, 65000);

  try {
    const result = await window.api.syncUsage();

    clearTimeout(safetyTimeout);
    btn.classList.remove('syncing');
    btn.disabled = false;

    if (!result || !result.ok) {
      showSyncError(result ? result.error : 'No response');
      scheduleRetry();
      return;
    }

    // Success — reset retry counter
    retryCount = 0;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }

    const d = result.data;
    if (d.session !== null) data.session.percentage = d.session;
    if (d.allModels !== null) data.allModels.percentage = d.allModels;
    if (d.sonnetOnly !== null) data.sonnetOnly.percentage = d.sonnetOnly;
    if (d.allModelsResetText) data.allModels.resetText = d.allModelsResetText;
    if (d.sonnetOnlyResetText) data.sonnetOnly.resetText = d.sonnetOnlyResetText;

    if (d.sessionResetHours !== null) {
      const totalMins = d.sessionResetHours * 60 + (d.sessionResetMinutes || 0);
      sessionCountdown = totalMins * 60;
      data.session.resetMinutes = totalMins;
      document.getElementById('sessionHours').value = d.sessionResetHours || '';
      document.getElementById('sessionMinutes').value = d.sessionResetMinutes || '';
    }

    data.lastUpdated = new Date().toISOString();
    await window.api.saveUsage(data);
    renderAll();
  } catch (err) {
    clearTimeout(safetyTimeout);
    btn.classList.remove('syncing');
    btn.disabled = false;
    showSyncError(err.message || 'Unknown error');
    scheduleRetry();
  }
}

function scheduleRetry() {
  if (retryTimer) return; // already scheduled
  retryCount++;
  if (retryCount > 5) {
    showSyncError('Sync failing — click ↻ to retry');
    retryCount = 0;
    return;
  }
  // Backoff: 15s, 30s, 60s, 120s, 240s
  const delay = Math.min(15000 * Math.pow(2, retryCount - 1), 240000);
  const delaySec = Math.round(delay / 1000);
  showSyncStatus('Retrying in ' + delaySec + 's...');
  retryTimer = setTimeout(() => {
    retryTimer = null;
    doSync();
  }, delay);
}

function showSyncStatus(msg) {
  const el = document.getElementById('lastUpdated');
  el.textContent = msg;
  el.style.color = '#d4a574';
}

function showSyncError(msg) {
  const el = document.getElementById('lastUpdated');
  el.textContent = 'Sync failed: ' + (msg || 'unknown error');
  el.style.color = '#e74c3c';
  setTimeout(() => {
    el.style.color = '';
    renderLastUpdated();
  }, 5000);
}

// ─── Timer ────────────────────────────────────────────────────

function tick() {
  if (sessionCountdown && sessionCountdown > 0) sessionCountdown--;
  renderSessionCountdown();
  renderLastUpdated();

  // Re-render bars/labels every second so progress marker moves smoothly
  // and day highlights update when midnight crosses
  if (data) {
    const cycleLen = data.cycleLengthDays || 7;
    const amCycle = getCycleInfo(data.allModels.resetText, cycleLen);
    const soCycle = getCycleInfo(data.sonnetOnly.resetText, cycleLen);
    renderBar('allModelsBar', data.allModels.percentage, amCycle);
    renderBar('sonnetOnlyBar', data.sonnetOnly.percentage, soCycle);
    renderBudgetMarker('allModelsBudget', amCycle);
    renderBudgetMarker('sonnetOnlyBudget', soCycle);
    renderStatus('allModelsStatus', data.allModels.percentage, amCycle);
    renderStatus('sonnetOnlyStatus', data.sonnetOnly.percentage, soCycle);
    renderDayLabels('allModelsDays', amCycle);
    renderDayLabels('sonnetOnlyDays', soCycle);
  }
}

// ─── Init ─────────────────────────────────────────────────────

async function init() {
  try {
    data = await window.api.loadUsage();

    // Migrate old data shape: ensure resetText + cycleLengthDays exist,
    // strip legacy fields so saved data stays clean
    if (!data.cycleLengthDays) data.cycleLengthDays = 7;
    if (data.allModels && data.allModels.resetText === undefined) data.allModels.resetText = null;
    if (data.sonnetOnly && data.sonnetOnly.resetText === undefined) data.sonnetOnly.resetText = null;
    delete data.weeklyResetDay;
    delete data.weeklyResetHour;

    renderAll();
    setupEditing();
    setupSessionTimer();
    setupTitleBar();

    // Tick every second for smooth countdown
    setInterval(tick, 1000);

    // Auto-sync every 15 minutes
    setInterval(() => doSync(), 15 * 60 * 1000);

    // Sync on startup — delay 5s to wait for network after PC restart
    setTimeout(() => doSync(), 5000);
  } catch (err) {
    document.body.innerHTML = '<pre style="color:red;padding:20px;font-size:12px;">INIT ERROR:\n' + err.stack + '</pre>';
  }
}

document.addEventListener('DOMContentLoaded', init);

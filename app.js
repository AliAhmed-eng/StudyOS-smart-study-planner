/* ============================================================
   StudyOS — app.js  (PWA Edition v3)

   KEY UPGRADES OVER v2:
   ✅ PWA Service Worker registration
   ✅ A2HS (Add to Home Screen) install prompt
   ✅ Online/offline detection + badge
   ✅ URL shortcut handler (?action=add)
   ✅ Notification permission requested properly
   ✅ All original features preserved & optimised
   ============================================================ */

'use strict';

// ============================================================
// 1. STATE
// ============================================================
const STATE = {
  tasks:               [],
  completedToday:      0,
  rewardUnlockCount:   0,
  streak:              0,
  bestStreak:          0,
  studyTimeMinutes:    0,
  weeklyStudyMinutes:  0,
  gameBestScore:       0,
  badges: {
    earlyFinisher3: false,
    tasks10:        false,
    noPendingToday: false,
    speedDemon:     false,
    consistent:     false,
    nightOwl:       false,
  }
};

let _taskIdCounter = 1;

// ============================================================
// 2. CONSTANTS
// ============================================================
const QUOTES = [
  "The secret of getting ahead is getting started. — Mark Twain",
  "Focus is the art of knowing what to ignore. — James Clear",
  "Small consistent actions create extraordinary results.",
  "Don't watch the clock; do what it does. Keep going. — Sam Levenson",
  "Success is the sum of small efforts repeated day in and day out.",
  "Your future self is watching you right now through memories.",
  "Study hard what interests you the most in the most undisciplined way. — Richard Feynman",
  "The expert at anything was once a beginner.",
  "Discipline is the bridge between goals and accomplishment.",
  "Every hour you study today is an investment in your future.",
];

const BADGE_DEFS = [
  { key: 'earlyFinisher3', icon: '⚡', name: 'Speed Demon',  desc: 'Finished 3 tasks early' },
  { key: 'tasks10',        icon: '🏆', name: 'Century Mark', desc: 'Completed 10 tasks total' },
  { key: 'noPendingToday', icon: '🌟', name: 'Perfect Day',  desc: 'No pending tasks today' },
  { key: 'speedDemon',     icon: '🚀', name: 'Rocket Mode',  desc: 'Completed a task in under 5 minutes' },
  { key: 'consistent',     icon: '🔥', name: 'On Fire',      desc: '3-day study streak' },
  { key: 'nightOwl',       icon: '🦉', name: 'Night Owl',    desc: 'Studied after 10 PM' },
];

// ============================================================
// 3. DOM HELPERS
// ============================================================
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ============================================================
// 4. PERSISTENCE
// ============================================================
function saveState() {
  try {
    const payload = {
      tasks:               STATE.tasks,
      completedToday:      STATE.completedToday,
      rewardUnlockCount:   STATE.rewardUnlockCount,
      streak:              STATE.streak,
      bestStreak:          STATE.bestStreak,
      studyTimeMinutes:    STATE.studyTimeMinutes,
      weeklyStudyMinutes:  STATE.weeklyStudyMinutes,
      gameBestScore:       STATE.gameBestScore,
      badges:              STATE.badges,
      taskIdCounter:       _taskIdCounter,
      lastSavedDate:       todayStr(),
      lastSavedWeek:       weekStr(),
    };
    localStorage.setItem('studyos_state', JSON.stringify(payload));
  } catch (e) {
    console.warn('[StudyOS] Save failed:', e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem('studyos_state');
    if (!raw) return;
    const s = JSON.parse(raw);

    // Reset daily counters on new day
    if (s.lastSavedDate !== todayStr()) {
      s.completedToday    = 0;
      s.rewardUnlockCount = 0;
      s.studyTimeMinutes  = 0;
    }

    // Reset weekly counter on new week
    if (s.lastSavedWeek !== weekStr()) {
      s.weeklyStudyMinutes = 0;
    }

    Object.assign(STATE, {
      tasks:               s.tasks               || [],
      completedToday:      s.completedToday       || 0,
      rewardUnlockCount:   s.rewardUnlockCount    || 0,
      streak:              s.streak               || 0,
      bestStreak:          s.bestStreak           || 0,
      studyTimeMinutes:    s.studyTimeMinutes     || 0,
      weeklyStudyMinutes:  s.weeklyStudyMinutes   || 0,
      gameBestScore:       s.gameBestScore        || 0,
      badges:              { ...STATE.badges, ...(s.badges || {}) },
    });
    _taskIdCounter = s.taskIdCounter || 1;

    // On reload, pause any tasks that were running (can't know elapsed time while closed)
    STATE.tasks.forEach(t => {
      if (t.status === 'running' && t.manualMode) {
        t.timerActive    = false;
        t.sessionStartTs = null;
        t.sessionEndTime = null;
        t.status         = 'paused';
      }
    });

  } catch (e) {
    console.warn('[StudyOS] Load failed:', e);
  }
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function weekStr() {
  const d   = new Date();
  const t   = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil((((t - new Date(Date.UTC(year, 0, 1))) / 86400000) + 1) / 7);
  return `${year}-W${week}`;
}

// ============================================================
// 5. PWA — SERVICE WORKER REGISTRATION
// ============================================================
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(reg => {
        console.log('[StudyOS] SW registered, scope:', reg.scope);

        // Check for updates every time the page loads
        reg.update();

        // Notify user when a new version is available
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateToast();
            }
          });
        });
      })
      .catch(err => console.warn('[StudyOS] SW registration failed:', err));
  });
}

function showUpdateToast() {
  const toast = document.createElement('div');
  toast.className = 'update-toast';
  toast.innerHTML = `
    <span>🆕 New version available!</span>
    <button onclick="location.reload()">Refresh</button>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('visible'), 100);
  setTimeout(() => toast.remove(), 10000);
}

// ============================================================
// 6. PWA — INSTALL PROMPT (A2HS)
// ============================================================
let _deferredInstallPrompt = null;

function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredInstallPrompt = e;

    const dismissed = localStorage.getItem('studyos_install_dismissed');
    if (!dismissed) {
      const banner = $('installBanner');
      if (banner) banner.style.display = 'flex';
    }
  });

  const installBtn = $('installBtn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!_deferredInstallPrompt) return;
      $('installBanner').style.display = 'none';
      _deferredInstallPrompt.prompt();
      const { outcome } = await _deferredInstallPrompt.userChoice;
      console.log('[StudyOS] A2HS outcome:', outcome);
      _deferredInstallPrompt = null;
    });
  }

  const dismissBtn = $('installDismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      $('installBanner').style.display = 'none';
      localStorage.setItem('studyos_install_dismissed', '1');
    });
  }

  // Hide banner once installed
  window.addEventListener('appinstalled', () => {
    const banner = $('installBanner');
    if (banner) banner.style.display = 'none';
    _deferredInstallPrompt = null;
    console.log('[StudyOS] App installed!');
  });
}

// ============================================================
// 7. ONLINE / OFFLINE DETECTION
// ============================================================
function initNetworkStatus() {
  const badge = $('offlineBadge');
  if (!badge) return;

  function update() {
    const isOnline = navigator.onLine;
    badge.style.display = isOnline ? 'none' : 'flex';
  }

  update();
  window.addEventListener('online',  update);
  window.addEventListener('offline', update);
}

// ============================================================
// 8. URL SHORTCUT HANDLER (?action=add)
// ============================================================
function handleURLShortcuts() {
  const params = new URLSearchParams(location.search);
  if (params.get('action') === 'add') {
    // Remove the query param without reloading
    history.replaceState({}, '', '/');
    // Open the add-task modal after the app has initialised
    setTimeout(() => openModal('addTaskModal'), 400);
  }
}

// ============================================================
// 9. CLOCK
// ============================================================
function startClock() {
  function tick() {
    const el = $('liveClock');
    if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
}

// ============================================================
// 10. QUOTE ROTATOR
// ============================================================
function startQuoteRotator() {
  let qi = Math.floor(Math.random() * QUOTES.length);
  const el = $('quoteText');
  if (!el) return;
  el.textContent = QUOTES[qi];

  setInterval(() => {
    qi = (qi + 1) % QUOTES.length;
    el.style.opacity = '0';
    setTimeout(() => {
      el.textContent       = QUOTES[qi];
      el.style.transition  = 'opacity 0.8s';
      el.style.opacity     = '1';
    }, 400);
  }, 15000);
}

// ============================================================
// 11. TASK CREATION
// ============================================================
function createTask(title, subject, startTime, finishTime) {
  const today   = new Date().toISOString().split('T')[0];
  const startDt = new Date(`${today}T${startTime}:00`);
  const finishDt = new Date(`${today}T${finishTime}:00`);

  if (finishDt <= startDt) finishDt.setDate(finishDt.getDate() + 1);

  const durationMs  = finishDt - startDt;
  const durationMin = Math.round(durationMs / 60000);

  return {
    id:          _taskIdCounter++,
    title,
    subject,
    startTime,
    finishTime,
    startTs:     startDt.getTime(),
    finishTs:    finishDt.getTime(),
    durationMs,
    durationMin,
    status:          'waiting',
    createdAt:       Date.now(),
    completedAt:     null,
    earlyMinutes:    0,
    delayMinutes:    0,
    isEarlyComplete: false,
    timerFired:      false,
    manualMode:      false,
    sessionStartTs:  null,
    sessionEndTime:  null,
    elapsedMs:       0,
  };
}

// ============================================================
// 12. MANUAL SESSION CONTROLS
// ============================================================
function startTask(taskId) {
  const task = findTask(taskId);
  if (!task || task.status === 'completed') return;

  const now           = Date.now();
  task.status         = 'running';
  task.manualMode     = true;
  task.timerActive    = true;
  task.sessionStartTs = now;

  const remainingMs   = Math.max(0, task.durationMs - task.elapsedMs);
  task.sessionEndTime = now + remainingMs;

  saveState();
  renderAll();
}

function pauseTask(taskId) {
  const task = findTask(taskId);
  if (!task || task.status !== 'running') return;

  if (task.sessionStartTs) {
    task.elapsedMs += Date.now() - task.sessionStartTs;
  }
  task.sessionStartTs = null;
  task.sessionEndTime = null;
  task.timerActive    = false;
  task.status         = 'paused';

  saveState();
  renderAll();
}

function completeTaskManual(taskId) {
  const task = findTask(taskId);
  if (!task || task.status === 'completed') return;

  if (task.sessionStartTs) {
    task.elapsedMs += Date.now() - task.sessionStartTs;
    task.sessionStartTs = null;
  }

  task.timerFired      = true;
  task.isEarlyComplete = true;
  task.sessionEndTime  = null;

  const earlyMs      = task.finishTs - Date.now();
  task.earlyMinutes  = Math.max(0, Math.round(earlyMs / 60000));

  completeTask(task, true);
}

// ============================================================
// 13. TIMER ENGINE
// ============================================================
let _pendingDoneTaskId = null;

function timerTick() {
  const now = Date.now();
  let changed = false;

  STATE.tasks.forEach(task => {
    if (task.status === 'completed' || task.status === 'pending') return;

    if (task.manualMode) {
      if (
        task.status === 'running' &&
        task.sessionEndTime &&
        now >= task.sessionEndTime &&
        !task.timerFired
      ) {
        if (task.sessionStartTs) {
          task.elapsedMs    += now - task.sessionStartTs;
          task.sessionStartTs = null;
        }
        task.sessionEndTime = null;
        task.timerFired     = true;
        task.status         = 'pending';
        changed             = true;
        triggerTaskDone(task);
      }
      return;
    }

    if (now >= task.finishTs && task.status === 'running' && !task.timerFired) {
      task.timerFired = true;
      task.status     = 'pending';
      changed         = true;
      triggerTaskDone(task);
    }
  });

  if (changed) saveState();
}

function triggerTaskDone(task) {
  if (_pendingDoneTaskId === task.id) return;

  playBeep();
  showBrowserNotification(task.title);

  _pendingDoneTaskId = task.id;
  $('sessionCompleteMsg').textContent = `"${task.title}" session has ended. Tap below to log your result.`;
  openModal('sessionCompleteModal');
}

// ============================================================
// 14. PROGRESS CALCULATION
// ============================================================
function calcProgress(task) {
  if (task.status === 'completed') return 100;
  if (task.status === 'waiting')   return 0;
  if (task.status === 'pending')   return 100;

  if (task.status === 'paused') {
    return Math.round(Math.min(100, Math.max(0, (task.elapsedMs / task.durationMs) * 100)));
  }

  if (task.status === 'running') {
    if (task.manualMode && task.sessionEndTime) {
      const remMs      = Math.max(0, task.sessionEndTime - Date.now());
      const consumedMs = task.durationMs - remMs;
      return Math.round(Math.min(100, Math.max(0, (consumedMs / task.durationMs) * 100)));
    }
    if (task.manualMode && task.sessionStartTs) {
      const total = task.elapsedMs + (Date.now() - task.sessionStartTs);
      return Math.round(Math.min(100, Math.max(0, (total / task.durationMs) * 100)));
    }
    const elapsed = Date.now() - task.startTs;
    return Math.round(Math.min(100, Math.max(0, (elapsed / task.durationMs) * 100)));
  }

  return 0;
}

// ============================================================
// 15. COUNTDOWN DISPLAY
// ============================================================
function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function getCountdownDisplay(task) {
  const now = Date.now();

  switch (task.status) {
    case 'waiting': {
      const rem = task.startTs - now;
      return { text: rem > 0 ? formatCountdown(rem) : '00:00:00', label: 'Starts in', cls: 'waiting' };
    }
    case 'paused':
      return { text: formatCountdown(task.elapsedMs), label: 'Elapsed (paused)', cls: 'waiting' };
    case 'running': {
      let remMs;
      if (task.manualMode && task.sessionEndTime) {
        remMs = Math.max(0, task.sessionEndTime - now);
      } else {
        remMs = Math.max(0, task.finishTs - now);
      }
      return { text: formatCountdown(remMs), label: 'Remaining', cls: remMs < 300000 ? 'urgent' : '' };
    }
    case 'pending':
      return { text: 'OVERDUE', label: 'Task ended', cls: 'urgent' };
    case 'completed':
      return {
        text:  '✓ DONE',
        label: task.earlyMinutes > 0 ? `${task.earlyMinutes}m early` : 'Completed',
        cls:   'done-text'
      };
    default:
      return { text: '--:--:--', label: '', cls: '' };
  }
}

// ============================================================
// 16. AUDIO
// ============================================================
let _audioUnlocked = false;

document.addEventListener('click',      () => { _audioUnlocked = true; }, { once: true });
document.addEventListener('touchstart', () => { _audioUnlocked = true; }, { once: true });

function playBeep() {
  if (!_audioUnlocked) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [
      { freq: 880,  dur: 0.12, start: 0    },
      { freq: 1046, dur: 0.12, start: 0.15 },
      { freq: 1318, dur: 0.20, start: 0.30 },
    ].forEach(({ freq, dur, start }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + 0.02);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    });
  } catch (_) {}
}

function playSuccessSound() {
  if (!_audioUnlocked) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523, 659, 784, 1046].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.15);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch (_) {}
}

// ============================================================
// 17. BROWSER NOTIFICATIONS
// ============================================================
function showBrowserNotification(taskName) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification('StudyOS — Session Ended!', {
      body: `"${taskName}" is finished 🎉`,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      vibrate: [200, 100, 200],
    });
  } catch (_) {}
}

function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// ============================================================
// 18. MARK COMPLETE EARLY
// ============================================================
function markCompleteEarly(taskId) {
  const task = findTask(taskId);
  if (!task || task.status !== 'running') return;

  const now      = Date.now();
  const earlyMs  = task.finishTs - now;
  const earlyMin = Math.max(0, Math.round(earlyMs / 60000));

  task.earlyMinutes    = earlyMin;
  task.isEarlyComplete = true;
  task.timerFired      = true;

  if (task.manualMode && task.sessionStartTs) {
    task.elapsedMs    += now - task.sessionStartTs;
    task.sessionStartTs = null;
  }

  completeTask(task);

  $('earlyCompleteMsg').textContent =
    earlyMin > 0
      ? `Excellent! You finished "${task.title}" ${earlyMin} minute${earlyMin !== 1 ? 's' : ''} early!`
      : `Task "${task.title}" completed!`;

  playSuccessSound();
  openModal('earlyCompleteModal');
}

// ============================================================
// 19. COMPLETE TASK (shared logic)
// ============================================================
function completeTask(task) {
  if (task.status === 'completed') return;

  task.status      = 'completed';
  task.completedAt = Date.now();
  task.timerFired  = true;

  const studiedMin = task.manualMode
    ? Math.round(task.elapsedMs / 60000)
    : Math.min(task.durationMin, Math.max(0, Math.round((task.completedAt - task.startTs) / 60000)));

  STATE.studyTimeMinutes   += studiedMin;
  STATE.weeklyStudyMinutes += studiedMin;
  STATE.completedToday++;

  checkRewardUnlock();
  checkBadges();
  updateStreak();
  saveState();
  renderAll();
}

// ============================================================
// 20. REWARD SYSTEM
// ============================================================
function checkRewardUnlock() {
  if (STATE.completedToday > 0 && STATE.completedToday % 3 === 0) {
    STATE.rewardUnlockCount++;
    setTimeout(() => openModal('rewardModal'), 800);
  }
  updateRewardPips();
}

function updateRewardPips() {
  const progress   = STATE.completedToday % 3;
  const isUnlocked = STATE.completedToday > 0 && STATE.completedToday % 3 === 0;
  const rpText     = $('rpText');
  if (rpText) rpText.textContent = isUnlocked ? '✅ Unlocked!' : `${progress}/3`;

  for (let i = 0; i < 3; i++) {
    const pip = $(`pip${i}`);
    if (!pip) continue;
    pip.className = 'rp-pip';
    if (isUnlocked)        pip.classList.add('done');
    else if (i < progress) pip.classList.add('active');
  }
}

// ============================================================
// 21. PENDING TASK
// ============================================================
let _pendingCompleteTaskId = null;

function completePendingTask(taskId) {
  const task = findTask(taskId);
  if (!task) return;

  _pendingCompleteTaskId = taskId;

  const delayMs  = Date.now() - task.finishTs;
  const delayMin = Math.round(delayMs / 60000);
  task.delayMinutes = Math.max(0, delayMin);

  const delayStr = delayMin >= 60
    ? `${Math.floor(delayMin / 60)}h ${delayMin % 60}m`
    : `${delayMin}m`;

  $('pendingCompleteMsg').textContent = `You delayed "${task.title}" by ${delayStr}. Mark as completed?`;
  openModal('pendingCompleteModal');
}

function restartTask(taskId) {
  const task = findTask(taskId);
  if (!task) return;

  Object.assign(task, {
    timerFired:      false,
    completedAt:     null,
    earlyMinutes:    0,
    delayMinutes:    0,
    isEarlyComplete: false,
    manualMode:      false,
    sessionStartTs:  null,
    sessionEndTime:  null,
    elapsedMs:       0,
    timerActive:     false,
    status:          'waiting',
  });

  saveState();
  renderAll();
}

function deleteTask(taskId) {
  STATE.tasks = STATE.tasks.filter(t => t.id !== taskId);
  saveState();
  renderAll();
}

// ============================================================
// 22. STATS & DASHBOARD
// ============================================================
function updateStats() {
  const all = STATE.tasks;
  const running   = all.filter(t => ['running', 'waiting', 'paused'].includes(t.status)).length;
  const completed = all.filter(t => t.status === 'completed').length;
  const pending   = all.filter(t => t.status === 'pending').length;
  const total     = all.length;

  const productivity = total > 0 ? Math.round((completed / total) * 100) : 0;
  const todayH = Math.floor(STATE.studyTimeMinutes / 60);
  const todayM = STATE.studyTimeMinutes % 60;
  const weekH  = Math.floor(STATE.weeklyStudyMinutes / 60);
  const weekM  = STATE.weeklyStudyMinutes % 60;

  setText('sTotal',       total);
  setText('sRunning',     running);
  setText('sCompleted',   completed);
  setText('sPending',     pending);
  setText('sProductivity', productivity + '%');
  setText('sStudyTime',   `${todayH}h ${todayM}m`);
  setText('sWeeklyTime',  `${weekH}h ${weekM}m`);
  setText('badgeRunning', running);
  setText('badgePending', pending);
  setText('streakCount',  STATE.streak);

  const bestEl = $('streakBest');
  if (bestEl) bestEl.textContent = STATE.bestStreak > 0 ? `| Best: ${STATE.bestStreak}` : '';

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const fill = $('overallFill');
  if (fill) fill.style.width = pct + '%';
  setText('overallPct', pct + '%');

  updateRewardPips();
}

function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = val;
}

// ============================================================
// 23. BADGES
// ============================================================
function checkBadges() {
  const completed = STATE.tasks.filter(t => t.status === 'completed');
  const pending   = STATE.tasks.filter(t => t.status === 'pending');
  const early     = completed.filter(t => t.isEarlyComplete);

  if (early.length >= 3)   STATE.badges.earlyFinisher3 = true;
  if (completed.length >= 10) STATE.badges.tasks10 = true;
  if (STATE.tasks.length > 0 && pending.length === 0 && completed.length === STATE.tasks.length) {
    STATE.badges.noPendingToday = true;
  }
  if (early.some(t => t.earlyMinutes >= (t.durationMin - 5) && t.durationMin > 5)) {
    STATE.badges.speedDemon = true;
  }
  if (STATE.streak >= 3)           STATE.badges.consistent = true;
  if (new Date().getHours() >= 22) STATE.badges.nightOwl   = true;

  renderBadges();
}

function renderBadges() {
  const grid = $('badgesGrid');
  if (!grid) return;
  grid.innerHTML = BADGE_DEFS.map(b => `
    <div class="badge-card ${STATE.badges[b.key] ? 'earned' : ''}">
      <div class="badge-icon">${b.icon}</div>
      <div class="badge-name">${b.name}</div>
      <div class="badge-desc">${b.desc}</div>
    </div>
  `).join('');
}

// ============================================================
// 24. STREAK
// ============================================================
function updateStreak() {
  const lastDate = localStorage.getItem('studyos_streak_date');
  const today    = todayStr();

  if (lastDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yd = yesterday.toISOString().split('T')[0];

    STATE.streak = (lastDate === yd) ? STATE.streak + 1 : 1;
    localStorage.setItem('studyos_streak_date', today);
  }

  if (STATE.streak > STATE.bestStreak) STATE.bestStreak = STATE.streak;
}

// ============================================================
// 25. TASK CARD BUILDER
// ============================================================
function buildTaskCard(task) {
  const cd          = getCountdownDisplay(task);
  const pct         = calcProgress(task);
  const { status }  = task;

  const STATUS_MAP = {
    running:   { cls: 'badge-running',   label: 'Live'    },
    paused:    { cls: 'badge-paused',    label: 'Paused'  },
    pending:   { cls: 'badge-pending',   label: 'Pending' },
    completed: { cls: 'badge-completed', label: 'Done'    },
    waiting:   { cls: 'badge-waiting',   label: 'Waiting' },
  };
  const { cls: badgeCls, label: statusLabel } = STATUS_MAP[status] || STATUS_MAP.waiting;

  // Build action buttons based on status
  let actionsHtml = '';
  const id = task.id;

  if (status === 'waiting') {
    actionsHtml = `
      <button class="btn-task start"  onclick="startTask(${id})">▶ Start</button>
      <button class="btn-task delete" onclick="deleteTask(${id})">🗑</button>
    `;
  } else if (status === 'running') {
    actionsHtml = `
      <button class="btn-task pause"  onclick="pauseTask(${id})">⏸ Pause</button>
      <button class="btn-task early"  onclick="completeTaskManual(${id})">✅ Complete</button>
      <button class="btn-task delete" onclick="deleteTask(${id})">🗑</button>
    `;
  } else if (status === 'paused') {
    actionsHtml = `
      <button class="btn-task start"  onclick="startTask(${id})">▶ Resume</button>
      <button class="btn-task early"  onclick="completeTaskManual(${id})">✅ Complete</button>
      <button class="btn-task delete" onclick="deleteTask(${id})">🗑</button>
    `;
  } else if (status === 'pending') {
    actionsHtml = `
      <button class="btn-task complete-pending" onclick="completePendingTask(${id})">✓ Mark Done</button>
      <button class="btn-task restart"          onclick="restartTask(${id})">↺ Restart</button>
      <button class="btn-task delete"           onclick="deleteTask(${id})">🗑</button>
    `;
  } else if (status === 'completed') {
    actionsHtml = `<button class="btn-task delete" onclick="deleteTask(${id})">🗑 Remove</button>`;
  }

  let extraInfo = '';
  if (status === 'completed' && task.isEarlyComplete && task.earlyMinutes > 0) {
    extraInfo = `<div class="task-early-info">⚡ Finished ${task.earlyMinutes}m early</div>`;
  }
  if (status === 'completed' && task.delayMinutes > 0) {
    const dm = task.delayMinutes;
    const ds = dm >= 60 ? `${Math.floor(dm / 60)}h ${dm % 60}m` : `${dm}m`;
    extraInfo = `<div class="task-delay-info">⏱ Delayed by ${ds}</div>`;
  }

  const modeLabel = task.manualMode ? '<span class="manual-badge">Manual</span>' : '';

  const countdownHtml = status !== 'completed'
    ? `<div class="task-countdown ${cd.cls}" id="cd-${id}">${cd.text}</div>
       <div class="task-countdown-label">${cd.label}</div>`
    : `<div class="task-countdown done-text">✓ Completed</div>`;

  return `
    <div class="task-card status-${status}" id="card-${id}">
      <div class="task-card-header">
        <div class="task-info">
          <div class="task-title">${escHtml(task.title)} ${modeLabel}</div>
          <div class="task-subject">${escHtml(task.subject)}</div>
        </div>
        <span class="task-status-badge ${badgeCls}">${statusLabel}</span>
      </div>
      <div class="task-time-row">
        <span>🕐 ${task.startTime}</span>
        <span class="task-time-sep">→</span>
        <span>🕓 ${task.finishTime}</span>
        <span class="task-time-sep">·</span>
        <span>${task.durationMin}m</span>
      </div>
      ${countdownHtml}
      <div class="task-progress-wrap">
        <div class="task-progress-meta">
          <span>Progress</span>
          <span id="pct-${id}">${pct}%</span>
        </div>
        <div class="task-progress-track">
          <div class="task-progress-fill" id="bar-${id}" style="width:${pct}%"></div>
        </div>
      </div>
      ${extraInfo}
      <div class="task-actions">${actionsHtml}</div>
    </div>
  `;
}

// ============================================================
// 26. RENDER
// ============================================================
function renderAll() {
  updateStats();
  updateFocusMode();

  const all = STATE.tasks;
  renderList('taskListAll',       'emptyAll',       all);
  renderList('taskListRunning',   'emptyRunning',   all.filter(t => ['running', 'waiting', 'paused'].includes(t.status)));
  renderList('taskListPending',   'emptyPending',   all.filter(t => t.status === 'pending'));
  renderList('taskListCompleted', 'emptyCompleted', all.filter(t => t.status === 'completed'));
}

function renderList(listId, emptyId, tasks) {
  const list  = $(listId);
  const empty = $(emptyId);
  if (!list) return;

  if (tasks.length === 0) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'flex';
  } else {
    if (empty) empty.style.display = 'none';
    list.innerHTML = tasks.map(buildTaskCard).join('');
  }
}

// ============================================================
// 27. LIVE UPDATE (patches countdown/progress in-place)
// ============================================================
function liveUpdateCards() {
  let needsFullRender = false;

  STATE.tasks.forEach(task => {
    const card = $(`card-${task.id}`);
    if (!card) { needsFullRender = true; return; }

    const cdEl = $(`cd-${task.id}`);
    if (cdEl) {
      const cd     = getCountdownDisplay(task);
      cdEl.textContent = cd.text;
      cdEl.className   = `task-countdown ${cd.cls}`;
    }

    const pct    = calcProgress(task);
    const barEl  = $(`bar-${task.id}`);
    const pctEl  = $(`pct-${task.id}`);
    if (barEl) barEl.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
  });

  if (needsFullRender) renderAll();
  updateFocusModeTimer();
}

// ============================================================
// 28. FOCUS MODE
// ============================================================
let _focusActive = false;

function toggleFocusMode() {
  _focusActive = !_focusActive;
  const overlay = $('focusOverlay');
  if (overlay) overlay.style.display = _focusActive ? 'flex' : 'none';
  if (_focusActive) updateFocusMode();
}

function updateFocusMode() {
  if (!_focusActive) return;
  const running = STATE.tasks.find(t => t.status === 'running');

  setText('focusTitle',   running ? running.title   : 'No active task running');
  setText('focusSubject', running ? running.subject : '');
  if (!running) {
    setText('focusTimer', '--:--:--');
    const fill = $('focusProgressFill');
    if (fill) fill.style.width = '0%';
  }
}

function updateFocusModeTimer() {
  if (!_focusActive) return;
  const running = STATE.tasks.find(t => t.status === 'running');
  if (!running) return;
  const cd = getCountdownDisplay(running);
  setText('focusTimer', cd.text);
  const fill = $('focusProgressFill');
  if (fill) fill.style.width = calcProgress(running) + '%';
}

// ============================================================
// 29. TABS
// ============================================================
function initTabs() {
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b   => b.classList.remove('active'));
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = $(`tab-${btn.dataset.tab}`);
      if (panel) panel.classList.add('active');
    });
  });
}

// ============================================================
// 30. MODALS
// ============================================================
function openModal(id)  {
  const el = $(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  const el = $(id);
  if (el) el.classList.remove('open');
}

// ============================================================
// 31. ADD TASK MODAL
// ============================================================
function initAddTaskModal() {
  $('addTaskBtn').addEventListener('click', () => openModal('addTaskModal'));
  $('closeAddModal').addEventListener('click',  () => closeModal('addTaskModal'));
  $('cancelAddModal').addEventListener('click', () => closeModal('addTaskModal'));

  ['taskStart', 'taskFinish'].forEach(id => {
    $(id).addEventListener('change', updateDurationPreview);
  });

  $('confirmAddTask').addEventListener('click', () => {
    const title   = $('taskTitle').value.trim();
    const subject = $('taskSubject').value.trim() || 'General';
    const start   = $('taskStart').value;
    const finish  = $('taskFinish').value;

    if (!title)  { shake('taskTitle');  return; }
    if (!start)  { shake('taskStart');  return; }
    if (!finish) { shake('taskFinish'); return; }

    if (start >= finish) {
      setText('dpText', '⚠ Finish time must be after start time');
      return;
    }

    const task = createTask(title, subject, start, finish);
    STATE.tasks.push(task);
    saveState();
    renderAll();
    closeModal('addTaskModal');
    clearForm();

    requestNotificationPermission();
  });
}

function updateDurationPreview() {
  const s = $('taskStart').value;
  const f = $('taskFinish').value;

  if (!s || !f)  { setText('dpText', 'Select start & finish time'); return; }
  if (s >= f)    { setText('dpText', '⚠ Finish time must be after start'); return; }

  const [sh, sm] = s.split(':').map(Number);
  const [fh, fm] = f.split(':').map(Number);
  let mins = (fh * 60 + fm) - (sh * 60 + sm);
  if (mins < 0) mins += 1440;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  setText('dpText', h > 0 ? `${h}h ${m}m duration` : `${m} minutes duration`);
}

function clearForm() {
  ['taskTitle', 'taskSubject', 'taskStart', 'taskFinish'].forEach(id => {
    const el = $(id);
    if (el) el.value = '';
  });
  setText('dpText', 'Select start & finish time');
}

function shake(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth; // reflow
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 500);
}

// ============================================================
// 32. SESSION COMPLETE MODAL
// ============================================================
function initSessionCompleteModal() {
  $('sessionCompleteOk').addEventListener('click', () => {
    closeModal('sessionCompleteModal');
    if (_pendingDoneTaskId !== null) {
      const task = findTask(_pendingDoneTaskId);
      if (task) {
        setText('doneModalTitle', `⏰ "${task.title}" — Time's Up!`);
        setText('doneModalMsg',   'Did you complete this task?');
        openModal('taskDoneModal');
      }
    }
  });
}

// ============================================================
// 33. TASK DONE MODAL
// ============================================================
function initTaskDoneModal() {
  $('doneYes').addEventListener('click', () => {
    if (_pendingDoneTaskId !== null) {
      const task = findTask(_pendingDoneTaskId);
      if (task) { completeTask(task); playSuccessSound(); }
      _pendingDoneTaskId = null;
    }
    closeModal('taskDoneModal');
  });

  $('doneNo').addEventListener('click', () => {
    if (_pendingDoneTaskId !== null) {
      _pendingDoneTaskId = null;
      saveState();
      renderAll();
    }
    closeModal('taskDoneModal');
  });
}

// ============================================================
// 34. EARLY COMPLETE MODAL
// ============================================================
function initEarlyCompleteModal() {
  $('closeEarlyModal').addEventListener('click', () => {
    closeModal('earlyCompleteModal');
    renderAll();
  });
}

// ============================================================
// 35. PENDING COMPLETE MODAL
// ============================================================
function initPendingCompleteModal() {
  $('pendingYes').addEventListener('click', () => {
    if (_pendingCompleteTaskId !== null) {
      const task = findTask(_pendingCompleteTaskId);
      if (task) {
        task.delayMinutes = Math.max(0, Math.round((Date.now() - task.finishTs) / 60000));
        completeTask(task);
        playSuccessSound();
      }
      _pendingCompleteTaskId = null;
    }
    closeModal('pendingCompleteModal');
  });

  $('pendingCancel').addEventListener('click', () => {
    _pendingCompleteTaskId = null;
    closeModal('pendingCompleteModal');
  });
}

// ============================================================
// 36. REWARD MODAL
// ============================================================
function initRewardModal() {
  $('playGameBtn').addEventListener('click', () => {
    closeModal('rewardModal');
    openGameModal();
  });
  $('skipGameBtn').addEventListener('click', () => closeModal('rewardModal'));
}

// ============================================================
// 37. MINI GAME
// ============================================================
let _gameTimer     = null;
let _gameTimeLeft  = 60;
let _gameScore     = 0;
let _gameRunning   = false;
let _dotSpawnTimer = null;
let _dotIdCounter  = 0;

const DOT_TYPES = [
  { cls: 'type-a', points: 1, lifetime: 1800 },
  { cls: 'type-b', points: 2, lifetime: 1200 },
  { cls: 'type-c', points: 5, lifetime: 800  },
];

function openGameModal() {
  _gameScore    = 0;
  _gameTimeLeft = 60;
  _gameRunning  = false;

  const arena = $('gameArena');
  if (arena) arena.innerHTML = `
    <div class="game-start-msg" id="gameStartMsg">
      <div class="game-start-icon">🎯</div>
      <div>Tap glowing dots! Smaller = more points!</div>
      <button class="btn-reward" onclick="startGame()">Start!</button>
    </div>
  `;

  const result = $('gameResult');
  if (result) result.style.display = 'none';

  updateGameUI();
  const best = parseInt(localStorage.getItem('studyos_game_best') || '0', 10);
  STATE.gameBestScore = best;
  setText('gameBest', best);
  openModal('gameModal');
}

function startGame() {
  _audioUnlocked = true;
  _gameRunning   = true;
  _gameScore     = 0;
  _gameTimeLeft  = 60;
  updateGameUI();

  const arena = $('gameArena');
  if (arena) arena.innerHTML = '';
  const result = $('gameResult');
  if (result) result.style.display = 'none';

  spawnDot();
  _dotSpawnTimer = setInterval(spawnDot, 700);

  _gameTimer = setInterval(() => {
    _gameTimeLeft--;
    setText('gameTimerDisplay', _gameTimeLeft);
    if (_gameTimeLeft <= 0) endGame();
  }, 1000);
}

function spawnDot() {
  if (!_gameRunning) return;
  const arena = $('gameArena');
  if (!arena) return;

  const type = DOT_TYPES[Math.floor(Math.random() * DOT_TYPES.length)];
  const dot  = document.createElement('div');
  const id   = ++_dotIdCounter;

  dot.className   = `game-dot ${type.cls}`;
  dot.id          = `dot-${id}`;
  dot.style.left  = (10 + Math.random() * 80) + '%';
  dot.style.top   = (10 + Math.random() * 80) + '%';

  dot.addEventListener('click', () => {
    if (!_gameRunning) return;
    _gameScore += type.points;
    setText('gameScore', _gameScore);
    dot.style.transform = 'translate(-50%,-50%) scale(1.8)';
    dot.style.opacity   = '0';
    setTimeout(() => dot.remove(), 150);
  });

  arena.appendChild(dot);
  setTimeout(() => {
    if (dot.parentNode) {
      dot.style.opacity = '0';
      setTimeout(() => dot.remove(), 200);
    }
  }, type.lifetime);
}

function endGame() {
  _gameRunning = false;
  clearInterval(_gameTimer);
  clearInterval(_dotSpawnTimer);
  $$('.game-dot').forEach(d => d.remove());

  const prev  = parseInt(localStorage.getItem('studyos_game_best') || '0', 10);
  const isNew = _gameScore > prev;
  if (isNew) {
    localStorage.setItem('studyos_game_best', _gameScore);
    STATE.gameBestScore = _gameScore;
  }
  setText('gameBest', Math.max(_gameScore, prev));

  const result = $('gameResult');
  if (result) result.style.display = 'flex';
  setText('grMsg',   isNew ? '🏆 New High Score!' : getGameMsg(_gameScore));
  setText('grScore', `You scored ${_gameScore} points${isNew ? ' (Personal Best!)' : ''}`);

  const closeBtn = $('closeGameBtn');
  if (closeBtn) closeBtn.onclick = () => { closeModal('gameModal'); resetGameState(); };
}

function resetGameState() {
  clearInterval(_gameTimer);
  clearInterval(_dotSpawnTimer);
  _gameRunning  = false;
  _gameTimeLeft = 60;
  _gameScore    = 0;
}

function getGameMsg(score) {
  if (score >= 40) return '🔥 Incredible reaction speed!';
  if (score >= 25) return '⚡ Great job, quick reflexes!';
  if (score >= 10) return '👍 Good effort!';
  return '😅 Keep practicing!';
}

function updateGameUI() {
  setText('gameScore',        _gameScore);
  setText('gameTimerDisplay', _gameTimeLeft);
}

// ============================================================
// 38. THEME TOGGLE
// ============================================================
function initThemeToggle() {
  const btn = $('themeToggle');
  if (!btn) return;

  const saved      = localStorage.getItem('studyos_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const startLight  = saved === 'light' || (!saved && !prefersDark);

  if (startLight) {
    document.body.classList.add('light-mode');
    btn.setAttribute('aria-checked', 'true');
    btn.setAttribute('aria-label',   'Switch to dark mode');
  }

  function applyTheme(isLight) {
    document.body.classList.add('theme-transitioning');
    if (isLight) {
      document.body.classList.add('light-mode');
      localStorage.setItem('studyos_theme', 'light');
      btn.setAttribute('aria-checked', 'true');
      btn.setAttribute('aria-label',   'Switch to dark mode');
    } else {
      document.body.classList.remove('light-mode');
      localStorage.setItem('studyos_theme', 'dark');
      btn.setAttribute('aria-checked', 'false');
      btn.setAttribute('aria-label',   'Switch to light mode');
    }
    setTimeout(() => document.body.classList.remove('theme-transitioning'), 420);
  }

  btn.addEventListener('click', () => {
    applyTheme(!document.body.classList.contains('light-mode'));
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('studyos_theme')) applyTheme(!e.matches);
  });
}

// ============================================================
// 39. FOCUS MODE BUTTON
// ============================================================
function initFocusMode() {
  const btn = $('focusModeBtn');
  if (btn) btn.addEventListener('click', toggleFocusMode);

  const exit = $('focusExitBtn');
  if (exit) exit.addEventListener('click', () => {
    _focusActive = false;
    const overlay = $('focusOverlay');
    if (overlay) overlay.style.display = 'none';
  });
}

// ============================================================
// 40. UTILITY
// ============================================================
function findTask(id) {
  return STATE.tasks.find(t => t.id == id); // loose == for int/string
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// 41. EXPOSE GLOBALS (for onclick= in HTML)
// ============================================================
window.startTask           = startTask;
window.pauseTask           = pauseTask;
window.completeTaskManual  = completeTaskManual;
window.markCompleteEarly   = markCompleteEarly;
window.completePendingTask = completePendingTask;
window.restartTask         = restartTask;
window.deleteTask          = deleteTask;
window.startGame           = startGame;

// ============================================================
// 42. MAIN INIT
// ============================================================
function init() {
  // PWA setup first
  registerServiceWorker();
  initInstallPrompt();
  initNetworkStatus();
  handleURLShortcuts();

  // App state
  loadState();

  // UI
  startClock();
  startQuoteRotator();
  initTabs();
  initAddTaskModal();
  initSessionCompleteModal();
  initTaskDoneModal();
  initEarlyCompleteModal();
  initPendingCompleteModal();
  initRewardModal();
  initThemeToggle();
  initFocusMode();

  renderAll();
  renderBadges();
  updateRewardPips();

  // Close any modal when clicking the backdrop
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  // Keyboard: Escape closes top modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const open = document.querySelector('.modal-overlay.open');
      if (open) open.classList.remove('open');
    }
  });

  // Two-interval architecture (keeps state mutation & DOM updates separate)
  setInterval(timerTick,       1000); // state only
  setInterval(liveUpdateCards, 1000); // DOM only

  // Auto-save every 30 s
  setInterval(saveState, 30000);

  // Save on page hide (mobile background / tab close)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveState();
  });

  console.log('[StudyOS] App initialised ✓');
}

document.addEventListener('DOMContentLoaded', init);
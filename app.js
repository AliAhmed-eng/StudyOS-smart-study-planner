/* ============================================================
   StudyOS — Smart Study Planner  |  app.js  (UPGRADED v2)
   
   KEY UPGRADES:
   - Manual Start / Pause / Complete buttons per task
   - Elapsed study time tracked (not just scheduled duration)
   - Weekly study time tracked
   - Best streak + current streak
   - "Session Completed" alert on auto-timer end
   - Full localStorage persistence (tasks, streaks, study time, theme)
   - Duplicate completion guard
   - Clean, beginner-friendly code with comments
   ============================================================ */

'use strict';

// ============================================================
// 1. STATE — single source of truth for all app data
// ============================================================
const STATE = {
  tasks: [],              // all task objects
  completedToday: 0,      // how many tasks completed today (for rewards)
  rewardUnlockCount: 0,   // reward cycle counter
  streak: 0,              // current daily streak
  bestStreak: 0,          // best streak ever
  studyTimeMinutes: 0,    // total study time today (in minutes)
  weeklyStudyMinutes: 0,  // study time this week
  gameBestScore: 0,
  badges: {
    earlyFinisher3: false,
    tasks10: false,
    noPendingToday: false,
    speedDemon: false,
    consistent: false,
    nightOwl: false,
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
// 4. PERSISTENCE — save & load from localStorage
// ============================================================
function saveState() {
  try {
    const s = {
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
    localStorage.setItem('studyos_state', JSON.stringify(s));
  } catch(e) { console.warn('Save failed', e); }
}

function loadState() {
  try {
    const raw = localStorage.getItem('studyos_state');
    if (!raw) return;
    const s = JSON.parse(raw);

    // Reset daily counters if it's a new day
    if (s.lastSavedDate !== todayStr()) {
      s.completedToday    = 0;
      s.rewardUnlockCount = 0;
      s.studyTimeMinutes  = 0;
    }

    // Reset weekly counter if it's a new week
    if (s.lastSavedWeek !== weekStr()) {
      s.weeklyStudyMinutes = 0;
    }

    Object.assign(STATE, {
      tasks:              s.tasks              || [],
      completedToday:     s.completedToday     || 0,
      rewardUnlockCount:  s.rewardUnlockCount  || 0,
      streak:             s.streak             || 0,
      bestStreak:         s.bestStreak         || 0,
      studyTimeMinutes:   s.studyTimeMinutes   || 0,
      weeklyStudyMinutes: s.weeklyStudyMinutes || 0,
      gameBestScore:      s.gameBestScore      || 0,
      badges:             s.badges             || STATE.badges,
    });
    _taskIdCounter = s.taskIdCounter || 1;

    // On reload, pause any tasks that were "running" manually
    // (we can't know how long they ran while the page was closed)
    STATE.tasks.forEach(t => {
      if (t.status === 'running' && t.manualMode) {
        // Keep elapsed time, but pause the timer
        t.timerActive = false;
        t.pausedAt    = Date.now();
      }
    });

  } catch(e) { console.warn('Load failed', e); }
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// Returns "YYYY-Www" (ISO week)
function weekStr() {
  const d  = new Date();
  const t  = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil((((t - new Date(Date.UTC(year,0,1))) / 86400000) + 1) / 7);
  return `${year}-W${week}`;
}

// ============================================================
// 5. CLOCK
// ============================================================
function startClock() {
  function tick() {
    $('liveClock').textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
}

// ============================================================
// 6. QUOTE ROTATOR
// ============================================================
function startQuoteRotator() {
  let qi = Math.floor(Math.random() * QUOTES.length);
  $('quoteText').textContent = QUOTES[qi];
  setInterval(() => {
    qi = (qi + 1) % QUOTES.length;
    const el = $('quoteText');
    el.style.opacity = '0';
    setTimeout(() => {
      el.textContent = QUOTES[qi];
      el.style.transition = 'opacity 0.8s';
      el.style.opacity = '1';
    }, 400);
  }, 15000);
}

// ============================================================
// 7. TASK CREATION
//    Two modes:
//    - "scheduled" mode: task auto-starts/ends based on clock time
//    - "manual" mode: user presses Start/Pause/Complete buttons
// ============================================================
function createTask(title, subject, startTime, finishTime) {
  const now   = new Date();
  const today = now.toISOString().split('T')[0];

  const startDt  = new Date(`${today}T${startTime}:00`);
  const finishDt = new Date(`${today}T${finishTime}:00`);

  if (finishDt <= startDt) {
    finishDt.setDate(finishDt.getDate() + 1);
  }

  const durationMs  = finishDt - startDt;
  const durationMin = Math.round(durationMs / 60000);

  return {
    id:         _taskIdCounter++,
    title,
    subject,
    startTime,
    finishTime,
    startTs:     startDt.getTime(),
    finishTs:    finishDt.getTime(),
    durationMs,
    durationMin,

    // --- Status ---
    // 'waiting'   = not yet started
    // 'running'   = actively being studied
    // 'paused'    = manually paused
    // 'pending'   = timer ended, awaiting user response
    // 'completed' = done
    status: 'waiting',

    createdAt:       Date.now(),
    completedAt:     null,
    earlyMinutes:    0,
    delayMinutes:    0,
    isEarlyComplete: false,

    // --- Timer engine ---
    timerFired:    false,   // ensures auto-expire fires only once
    manualMode:    false,   // true = user manually started the task

    // --- Session tracking for manual mode ---
    sessionStartTs:    null,   // when the user last pressed "Start"
    elapsedMs:         0,      // total elapsed ms (accumulates across pauses)
  };
}

// ============================================================
// 8. MANUAL SESSION CONTROLS
//    startTask / pauseTask / completeTask (manual click)
// ============================================================

// User presses ▶ Start
function startTask(taskId) {
  const task = findTask(taskId);
  if (!task || task.status === 'completed') return;

  const now = Date.now();
  task.status         = 'running';
  task.manualMode     = true;
  task.timerActive    = true;
  task.sessionStartTs = now;   // remember when this session segment began

  // Compute real-clock endTime for drift-free countdown (Issue 2 & 3)
  // Remaining duration = total duration minus already elapsed
  const remainingMs = Math.max(0, task.durationMs - task.elapsedMs);
  task.sessionEndTime = now + remainingMs;  // wall-clock end timestamp

  saveState();
  renderAll();
}

// User presses ⏸ Pause
function pauseTask(taskId) {
  const task = findTask(taskId);
  if (!task || task.status !== 'running') return;

  // Accumulate elapsed time for this segment (use real clock)
  if (task.sessionStartTs) {
    task.elapsedMs += Date.now() - task.sessionStartTs;
  }
  task.sessionStartTs = null;
  task.sessionEndTime = null;  // clear real-clock end reference
  task.timerActive    = false;
  task.status         = 'paused';

  saveState();
  renderAll();
}

// User presses ✅ Complete (while running or paused)
function completeTaskManual(taskId) {
  const task = findTask(taskId);
  if (!task || task.status === 'completed') return;

  // Stop the active segment timer
  if (task.sessionStartTs) {
    task.elapsedMs += Date.now() - task.sessionStartTs;
    task.sessionStartTs = null;
  }

  task.timerFired     = true; // prevent auto-expire from firing
  task.isEarlyComplete = true;
  task.sessionEndTime  = null; // clear real-clock timer reference

  // Calculate early finish (how many minutes before scheduled end)
  const earlyMs  = task.finishTs - Date.now();
  task.earlyMinutes = Math.max(0, Math.round(earlyMs / 60000));

  completeTask(task, true); // true = show early complete modal
}

// ============================================================
// 9. CORE TIMER ENGINE
//    Handles BOTH scheduled mode and manual elapsed-time tracking
// ============================================================
let _pendingDoneTaskId = null;

function timerTick() {
  const now = Date.now();
  let stateChanged = false;

  STATE.tasks.forEach(task => {
    // Skip already-done tasks
    if (task.status === 'completed' || task.status === 'pending') return;

    // --- Manual mode: track elapsed and auto-expire via real-clock sessionEndTime ---
    if (task.manualMode) {
      if (
        task.status === 'running' &&
        task.sessionEndTime &&
        now >= task.sessionEndTime &&
        !task.timerFired
      ) {
        // Accumulate final segment elapsed
        if (task.sessionStartTs) {
          task.elapsedMs += now - task.sessionStartTs;
          task.sessionStartTs = null;
        }
        task.sessionEndTime = null;
        task.timerFired     = true;
        task.status         = 'pending';
        stateChanged        = true;
        saveState();
        triggerTaskDone(task);
      }
      return;
    }

    // --- Scheduled mode: ONLY auto-expire by clock (NO auto-start) ---
    // Tasks start ONLY when the user clicks ▶ Start (startTask function).
    if (now >= task.finishTs && task.status === 'running') {
      // Timer expired — fire once thanks to timerFired guard
      if (!task.timerFired) {
        task.timerFired = true;
        task.status     = 'pending';
        stateChanged    = true;
        saveState();
        triggerTaskDone(task);
      }
    }
  });

  if (stateChanged) saveState();
}

// Called when scheduled timer expires automatically
function triggerTaskDone(task) {
  if (_pendingDoneTaskId === task.id) return;

  playBeep();
  showBrowserNotification(task.title);

  _pendingDoneTaskId = task.id;

  // Show "Session Completed" alert first, then ask yes/no
  $('sessionCompleteMsg').textContent = `"${task.title}" session has ended. Tap below to log your result.`;
  openModal('sessionCompleteModal');
}

// ============================================================
// 10. PROGRESS CALCULATION
// ============================================================
function calcProgress(task) {
  if (task.status === 'completed') return 100;
  if (task.status === 'waiting')   return 0;
  if (task.status === 'pending')   return 100;
  if (task.status === 'paused') {
    // Show progress based on elapsed vs total
    return Math.round(Math.min(100, Math.max(0, (task.elapsedMs / task.durationMs) * 100)));
  }

  // Running
  if (task.manualMode && task.sessionEndTime) {
    // Progress based on real-clock countdown: how much of duration has been consumed
    const remMs        = Math.max(0, task.sessionEndTime - Date.now());
    const consumedMs   = task.durationMs - remMs;
    return Math.round(Math.min(100, Math.max(0, (consumedMs / task.durationMs) * 100)));
  }
  if (task.manualMode && task.sessionStartTs) {
    const totalElapsed = task.elapsedMs + (Date.now() - task.sessionStartTs);
    return Math.round(Math.min(100, Math.max(0, (totalElapsed / task.durationMs) * 100)));
  }

  // Scheduled running
  const elapsed = Date.now() - task.startTs;
  return Math.round(Math.min(100, Math.max(0, (elapsed / task.durationMs) * 100)));
}

// ============================================================
// 11. COUNTDOWN DISPLAY
// ============================================================
function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function getCountdownDisplay(task) {
  const now = Date.now();

  if (task.status === 'waiting') {
    return { text: formatCountdown(task.startTs - now), label: 'Starts in', cls: 'waiting' };
  }
  if (task.status === 'paused') {
    const elapsed = task.elapsedMs;
    return { text: formatCountdown(elapsed), label: 'Elapsed (paused)', cls: 'waiting' };
  }
  if (task.status === 'running') {
    if (task.manualMode && task.sessionEndTime) {
      // Use real wall-clock endTime for drift-free countdown (Issue 2 & 3)
      const remMs  = task.sessionEndTime - Date.now();
      const safe   = Math.max(0, remMs);
      const urgent = safe < 5 * 60 * 1000;
      return { text: formatCountdown(safe), label: 'Remaining', cls: urgent ? 'urgent' : '' };
    }
    const remMs  = task.finishTs - now;
    const urgent = remMs < 5 * 60 * 1000;
    return { text: formatCountdown(remMs), label: 'Remaining', cls: urgent ? 'urgent' : '' };
  }
  if (task.status === 'pending') {
    return { text: 'OVERDUE', label: 'Task ended', cls: 'urgent' };
  }
  if (task.status === 'completed') {
    return {
      text: '✓ DONE',
      label: task.earlyMinutes > 0 ? `${task.earlyMinutes}m early` : 'Completed',
      cls: 'done-text'
    };
  }
  return { text: '--:--:--', label: '', cls: '' };
}

// ============================================================
// 12. BEEP SOUNDS (only play after user interaction)
// ============================================================
let _audioUnlocked = false;

// Unlock audio context on first user interaction (mobile requirement)
document.addEventListener('click', () => { _audioUnlocked = true; }, { once: true });
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
  } catch(e) {}
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
  } catch(e) {}
}

// ============================================================
// 13. BROWSER NOTIFICATIONS
// ============================================================
function showBrowserNotification(taskName) {
  if (!('Notification' in window)) {
    alert(`Task Completed!\n"${taskName}" session has ended. 🎉`);
    return;
  }
  if (Notification.permission === 'granted') {
    new Notification('StudyOS — Task Completed!', {
      body: `"${taskName}" session is finished 🎉`,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⬡</text></svg>'
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification('StudyOS — Task Completed!', {
          body: `"${taskName}" session is finished 🎉`,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⬡</text></svg>'
        });
      } else {
        alert(`Task Completed!\n"${taskName}" session has ended. 🎉`);
      }
    });
  } else {
    alert(`Task Completed!\n"${taskName}" session has ended. 🎉`);
  }
}

// ============================================================
// 14. MARK COMPLETE EARLY (from task card button while running)
// ============================================================
function markCompleteEarly(taskId) {
  const task = findTask(taskId);
  if (!task || task.status !== 'running') return;

  const now      = Date.now();
  const earlyMs  = task.finishTs - now;
  const earlyMin = Math.max(0, Math.round(earlyMs / 60000));

  task.earlyMinutes    = earlyMin;
  task.isEarlyComplete = true;
  task.timerFired      = true; // prevent auto-trigger

  // If manual mode, close the session segment
  if (task.manualMode && task.sessionStartTs) {
    task.elapsedMs += now - task.sessionStartTs;
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
// 15. COMPLETE TASK (shared logic — called from multiple paths)
// ============================================================
function completeTask(task, showEarlyModal) {
  // Guard: never complete twice
  if (task.status === 'completed') return;

  task.status      = 'completed';
  task.completedAt = Date.now();
  task.timerFired  = true;

  // Calculate how many minutes were actually studied
  let studiedMin;
  if (task.manualMode) {
    // Use elapsed ms (more accurate for manual tasks)
    studiedMin = Math.round(task.elapsedMs / 60000);
  } else {
    // Scheduled mode: time from start until now (or full duration)
    studiedMin = Math.min(
      task.durationMin,
      Math.max(0, Math.round((task.completedAt - task.startTs) / 60000))
    );
  }

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
// 16. REWARD SYSTEM
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
  $('rpText').textContent = isUnlocked ? '✅ Unlocked!' : `${progress}/3`;

  for (let i = 0; i < 3; i++) {
    const pip = $(`pip${i}`);
    pip.className = 'rp-pip';
    if (isUnlocked)        pip.classList.add('done');
    else if (i < progress) pip.classList.add('active');
  }
}

// ============================================================
// 17. PENDING TASK — complete a task that expired without answer
// ============================================================
let _pendingCompleteTaskId = null;

function completePendingTask(taskId) {
  const task = findTask(taskId);
  if (!task) return;

  _pendingCompleteTaskId = taskId;

  const now      = Date.now();
  const delayMs  = now - task.finishTs;
  const delayMin = Math.round(delayMs / 60000);
  task.delayMinutes = Math.max(0, delayMin);

  const delayStr = delayMin >= 60
    ? `${Math.floor(delayMin / 60)}h ${delayMin % 60}m`
    : `${delayMin}m`;

  $('pendingCompleteMsg').textContent =
    `You delayed "${task.title}" by ${delayStr}. Mark as completed?`;
  openModal('pendingCompleteModal');
}

function restartTask(taskId) {
  const task = findTask(taskId);
  if (!task) return;

  task.timerFired      = false;
  task.completedAt     = null;
  task.earlyMinutes    = 0;
  task.delayMinutes    = 0;
  task.isEarlyComplete = false;
  task.manualMode      = false;
  task.sessionStartTs  = null;
  task.sessionEndTime  = null; // clear real-clock timer reference
  task.elapsedMs       = 0;
  task.timerActive     = false;
  task.status = Date.now() < task.startTs ? 'waiting' : 'waiting'; // reset to waiting

  saveState();
  renderAll();
}

function deleteTask(taskId) {
  STATE.tasks = STATE.tasks.filter(t => t.id !== taskId);
  saveState();
  renderAll();
}

// ============================================================
// 18. STATS & DASHBOARD
// ============================================================
function updateStats() {
  const all = STATE.tasks;

  // Count each category
  const running   = all.filter(t => t.status === 'running' || t.status === 'waiting' || t.status === 'paused').length;
  const completed = all.filter(t => t.status === 'completed').length;
  const pending   = all.filter(t => t.status === 'pending').length;
  const total     = all.length;

  const productivity = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Today's study time
  const todayH = Math.floor(STATE.studyTimeMinutes / 60);
  const todayM = STATE.studyTimeMinutes % 60;

  // Weekly study time
  const weekH = Math.floor(STATE.weeklyStudyMinutes / 60);
  const weekM = STATE.weeklyStudyMinutes % 60;

  // Update DOM
  $('sTotal').textContent        = total;
  $('sRunning').textContent      = running;
  $('sCompleted').textContent    = completed;
  $('sPending').textContent      = pending;
  $('sProductivity').textContent = productivity + '%';
  $('sStudyTime').textContent    = `${todayH}h ${todayM}m`;
  $('sWeeklyTime').textContent   = `${weekH}h ${weekM}m`;

  $('badgeRunning').textContent  = running;
  $('badgePending').textContent  = pending;

  // Overall progress bar
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  $('overallFill').style.width = pct + '%';
  $('overallPct').textContent  = pct + '%';

  // Streak display
  $('streakCount').textContent = STATE.streak;
  const bestEl = $('streakBest');
  if (bestEl) {
    bestEl.textContent = STATE.bestStreak > 0 ? `| Best: ${STATE.bestStreak}` : '';
  }

  updateRewardPips();
}

// ============================================================
// 19. BADGES
// ============================================================
let _earlyFinishCount = 0;

function checkBadges() {
  const completed = STATE.tasks.filter(t => t.status === 'completed');
  const pending   = STATE.tasks.filter(t => t.status === 'pending');
  const early     = completed.filter(t => t.isEarlyComplete);

  _earlyFinishCount = early.length;
  if (_earlyFinishCount >= 3)  STATE.badges.earlyFinisher3 = true;
  if (completed.length >= 10)  STATE.badges.tasks10 = true;
  if (STATE.tasks.length > 0 && pending.length === 0 && completed.length === STATE.tasks.length) {
    STATE.badges.noPendingToday = true;
  }
  if (early.some(t => t.earlyMinutes >= (t.durationMin - 5) && t.durationMin > 5)) {
    STATE.badges.speedDemon = true;
  }
  if (STATE.streak >= 3)          STATE.badges.consistent = true;
  if (new Date().getHours() >= 22) STATE.badges.nightOwl  = true;

  renderBadges();
  saveState();
}

function renderBadges() {
  $('badgesGrid').innerHTML = BADGE_DEFS.map(b => `
    <div class="badge-card ${STATE.badges[b.key] ? 'earned' : ''}">
      <div class="badge-icon">${b.icon}</div>
      <div class="badge-name">${b.name}</div>
      <div class="badge-desc">${b.desc}</div>
    </div>
  `).join('');
}

// ============================================================
// 20. STREAK SYSTEM (improved)
// ============================================================
function updateStreak() {
  const lastDate = localStorage.getItem('studyos_streak_date');
  const today    = todayStr();

  if (lastDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yd = yesterday.toISOString().split('T')[0];

    if (lastDate === yd) {
      // Continued from yesterday — increment
      STATE.streak++;
    } else if (!lastDate) {
      // First ever task
      STATE.streak = 1;
    } else {
      // Streak broken
      STATE.streak = 1;
    }

    localStorage.setItem('studyos_streak_date', today);
  }

  // Update best streak
  if (STATE.streak > STATE.bestStreak) {
    STATE.bestStreak = STATE.streak;
  }
}

// ============================================================
// 21. RENDER TASK CARD
// ============================================================
function buildTaskCard(task) {
  const cd          = getCountdownDisplay(task);
  const pct         = calcProgress(task);
  const isRunning   = task.status === 'running';
  const isWaiting   = task.status === 'waiting';
  const isPaused    = task.status === 'paused';
  const isPending   = task.status === 'pending';
  const isCompleted = task.status === 'completed';

  // Status badge
  let statusBadgeClass = 'badge-waiting';
  let statusLabel      = 'Waiting';
  if (isRunning)   { statusBadgeClass = 'badge-running';   statusLabel = 'Live';    }
  if (isPaused)    { statusBadgeClass = 'badge-paused';    statusLabel = 'Paused';  }
  if (isPending)   { statusBadgeClass = 'badge-pending';   statusLabel = 'Pending'; }
  if (isCompleted) { statusBadgeClass = 'badge-completed'; statusLabel = 'Done';    }

  // Action buttons — the heart of the upgrade
  let actionsHtml = '';

  if (isWaiting) {
    // Show Start button and delete
    actionsHtml = `
      <button class="btn-task start"  onclick="startTask(${task.id})" title="Start session">▶ Start</button>
      <button class="btn-task delete" onclick="deleteTask(${task.id})" title="Delete task">🗑</button>
    `;
  } else if (isRunning) {
    // Show Pause, Complete, and delete
    actionsHtml = `
      <button class="btn-task pause"  onclick="pauseTask(${task.id})" title="Pause session">⏸ Pause</button>
      <button class="btn-task early"  onclick="completeTaskManual(${task.id})" title="Mark complete">✅ Complete</button>
      <button class="btn-task delete" onclick="deleteTask(${task.id})" title="Delete task">🗑</button>
    `;
  } else if (isPaused) {
    // Show Resume, Complete, and delete
    actionsHtml = `
      <button class="btn-task start"  onclick="startTask(${task.id})" title="Resume session">▶ Resume</button>
      <button class="btn-task early"  onclick="completeTaskManual(${task.id})" title="Mark complete">✅ Complete</button>
      <button class="btn-task delete" onclick="deleteTask(${task.id})" title="Delete task">🗑</button>
    `;
  } else if (isPending) {
    // Scheduled timer expired — pending user response
    actionsHtml = `
      <button class="btn-task complete-pending" onclick="completePendingTask(${task.id})">✓ Mark Done</button>
      <button class="btn-task restart"          onclick="restartTask(${task.id})">↺ Restart</button>
      <button class="btn-task delete"           onclick="deleteTask(${task.id})">🗑</button>
    `;
  } else if (isCompleted) {
    actionsHtml = `<button class="btn-task delete" onclick="deleteTask(${task.id})">🗑 Remove</button>`;
  }

  // Extra info for completed tasks
  let extraInfo = '';
  if (isCompleted && task.isEarlyComplete && task.earlyMinutes > 0) {
    extraInfo = `<div class="task-early-info">⚡ Finished ${task.earlyMinutes}m early</div>`;
  }
  if (isCompleted && task.delayMinutes > 0) {
    const dm = task.delayMinutes;
    const ds = dm >= 60 ? `${Math.floor(dm/60)}h ${dm%60}m` : `${dm}m`;
    extraInfo = `<div class="task-delay-info">⏱ Delayed by ${ds}</div>`;
  }

  // Show elapsed time label for manual mode tasks
  const modeLabel = task.manualMode ? '<span class="manual-badge">Manual</span>' : '';

  return `
    <div class="task-card status-${task.status}" id="card-${task.id}">
      <div class="task-card-header">
        <div class="task-info">
          <div class="task-title">${escHtml(task.title)} ${modeLabel}</div>
          <div class="task-subject">${escHtml(task.subject)}</div>
        </div>
        <span class="task-status-badge ${statusBadgeClass}">${statusLabel}</span>
      </div>

      <div class="task-time-row">
        <span>🕐 ${task.startTime}</span>
        <span class="task-time-sep">→</span>
        <span>🕓 ${task.finishTime}</span>
        <span class="task-time-sep">·</span>
        <span>${task.durationMin}m</span>
      </div>

      ${!isCompleted ? `
        <div class="task-countdown ${cd.cls}" id="cd-${task.id}">${cd.text}</div>
        <div class="task-countdown-label">${cd.label}</div>
      ` : `
        <div class="task-countdown done-text">✓ Completed</div>
      `}

      <div class="task-progress-wrap">
        <div class="task-progress-meta">
          <span>Progress</span>
          <span id="pct-${task.id}">${pct}%</span>
        </div>
        <div class="task-progress-track">
          <div class="task-progress-fill" id="bar-${task.id}" style="width:${pct}%"></div>
        </div>
      </div>

      ${extraInfo}
      <div class="task-actions">${actionsHtml}</div>
    </div>
  `;
}

// ============================================================
// 22. RENDER ALL TASK LISTS
// ============================================================
function renderAll() {
  updateStats();
  updateFocusMode();

  const all = STATE.tasks;

  // Running tab shows: waiting + running + paused
  const runningList = all.filter(t =>
    t.status === 'running' || t.status === 'waiting' || t.status === 'paused'
  );
  const pendingList   = all.filter(t => t.status === 'pending');
  const completedList = all.filter(t => t.status === 'completed');

  renderList('taskListAll',       'emptyAll',       all);
  renderList('taskListRunning',   'emptyRunning',   runningList);
  renderList('taskListPending',   'emptyPending',   pendingList);
  renderList('taskListCompleted', 'emptyCompleted', completedList);
}

function renderList(listId, emptyId, tasks) {
  const list  = $(listId);
  const empty = $(emptyId);
  if (tasks.length === 0) {
    list.innerHTML  = '';
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
    list.innerHTML = tasks.map(buildTaskCard).join('');
  }
}

// ============================================================
// 23. LIVE UPDATE (called every second — patches DOM in-place)
// ============================================================
function liveUpdateCards() {
  let needsFullRender = false;

  STATE.tasks.forEach(task => {
    const card = $(`card-${task.id}`);

    // If card is missing (task changed status group), do a full render
    if (!card) { needsFullRender = true; return; }

    // Update countdown text
    const cdEl = $(`cd-${task.id}`);
    if (cdEl) {
      const cd = getCountdownDisplay(task);
      cdEl.textContent = cd.text;
      cdEl.className   = `task-countdown ${cd.cls}`;
    }

    // Update progress bar
    const barEl = $(`bar-${task.id}`);
    const pctEl = $(`pct-${task.id}`);
    const pct   = calcProgress(task);
    if (barEl) barEl.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
  });

  if (needsFullRender) renderAll();

  updateFocusModeTimer();
}

// ============================================================
// 24. FOCUS MODE
// ============================================================
let _focusActive = false;

function toggleFocusMode() {
  _focusActive = !_focusActive;
  const overlay = $('focusOverlay');
  overlay.style.display = _focusActive ? 'flex' : 'none';
  if (_focusActive) updateFocusMode();
}

function updateFocusMode() {
  if (!_focusActive) return;
  const running = STATE.tasks.find(t => t.status === 'running');
  if (running) {
    $('focusTitle').textContent   = running.title;
    $('focusSubject').textContent = running.subject;
  } else {
    $('focusTitle').textContent   = 'No active task running';
    $('focusSubject').textContent = '';
    $('focusTimer').textContent   = '--:--:--';
    $('focusProgressFill').style.width = '0%';
  }
}

function updateFocusModeTimer() {
  if (!_focusActive) return;
  const running = STATE.tasks.find(t => t.status === 'running');
  if (!running) return;
  const cd = getCountdownDisplay(running);
  $('focusTimer').textContent = cd.text;
  $('focusProgressFill').style.width = calcProgress(running) + '%';
}

// ============================================================
// 25. TABS
// ============================================================
function initTabs() {
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ============================================================
// 26. MODAL HELPERS
// ============================================================
function openModal(id)  { $(id).classList.add('open');    }
function closeModal(id) { $(id).classList.remove('open'); }

// ============================================================
// 27. ADD TASK MODAL
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

    if (!title)            { shake('taskTitle'); return; }
    if (!start || !finish) { shake('taskStart'); return; }
    if (start >= finish) {
      $('dpText').textContent = '⚠ Finish time must be after start time';
      return;
    }

    const task = createTask(title, subject, start, finish);
    STATE.tasks.push(task);
    saveState();
    renderAll();
    closeModal('addTaskModal');
    clearForm();

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  });
}

function updateDurationPreview() {
  const s = $('taskStart').value;
  const f = $('taskFinish').value;
  if (!s || !f) { $('dpText').textContent = 'Select start & finish time'; return; }
  if (s >= f)   { $('dpText').textContent = '⚠ Finish time must be after start'; return; }

  const [sh, sm] = s.split(':').map(Number);
  const [fh, fm] = f.split(':').map(Number);
  let mins = (fh * 60 + fm) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  $('dpText').textContent = h > 0 ? `${h}h ${m}m duration` : `${m} minutes duration`;
}

function clearForm() {
  $('taskTitle').value    = '';
  $('taskSubject').value  = '';
  $('taskStart').value    = '';
  $('taskFinish').value   = '';
  $('dpText').textContent = 'Select start & finish time';
}

function shake(id) {
  const el = $(id);
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 500);
}

// ============================================================
// 28. SESSION COMPLETE MODAL (auto-expire → asks yes/no)
// ============================================================
function initSessionCompleteModal() {
  $('sessionCompleteOk').addEventListener('click', () => {
    closeModal('sessionCompleteModal');
    // Open the yes/no modal after the alert is dismissed
    if (_pendingDoneTaskId !== null) {
      const task = findTask(_pendingDoneTaskId);
      if (task) {
        $('doneModalTitle').textContent = `⏰ "${task.title}" — Time's Up!`;
        $('doneModalMsg').textContent   = 'Did you complete this task?';
        openModal('taskDoneModal');
      }
    }
  });
}

// ============================================================
// 29. TASK DONE MODAL (yes/no after auto-expire)
// ============================================================
function initTaskDoneModal() {
  $('doneYes').addEventListener('click', () => {
    if (_pendingDoneTaskId === null) { closeModal('taskDoneModal'); return; }
    const task = findTask(_pendingDoneTaskId);
    if (task) {
      completeTask(task);
      playSuccessSound();
    }
    _pendingDoneTaskId = null;
    closeModal('taskDoneModal');
  });

  $('doneNo').addEventListener('click', () => {
    if (_pendingDoneTaskId !== null) {
      const task = findTask(_pendingDoneTaskId);
      if (task) { saveState(); renderAll(); }
    }
    _pendingDoneTaskId = null;
    closeModal('taskDoneModal');
  });
}

// ============================================================
// 30. EARLY COMPLETE MODAL
// ============================================================
function initEarlyCompleteModal() {
  $('closeEarlyModal').addEventListener('click', () => {
    closeModal('earlyCompleteModal');
    renderAll();
  });
}

// ============================================================
// 31. PENDING COMPLETE MODAL
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
// 32. REWARD MODAL
// ============================================================
function initRewardModal() {
  $('playGameBtn').addEventListener('click', () => {
    closeModal('rewardModal');
    openGameModal();
  });
  $('skipGameBtn').addEventListener('click', () => closeModal('rewardModal'));
}

// ============================================================
// 33. MINI GAME — Reaction Tap
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
  updateGameUI();
  $('gameArena').innerHTML = `
    <div class="game-start-msg" id="gameStartMsg">
      <div class="game-start-icon">🎯</div>
      <div>Tap glowing dots! Smaller = more points!</div>
      <button class="btn-reward" id="startGameBtn" onclick="startGame()">Start!</button>
    </div>
  `;
  $('gameResult').style.display = 'none';
  openModal('gameModal');

  const best = parseInt(localStorage.getItem('studyos_game_best') || '0');
  STATE.gameBestScore = best;
  $('gameBest').textContent = best;
}

function startGame() {
  _audioUnlocked = true; // game counts as interaction
  _gameRunning  = true;
  _gameScore    = 0;
  _gameTimeLeft = 60;
  updateGameUI();

  $('gameArena').innerHTML  = '';
  $('gameResult').style.display = 'none';

  spawnDot();
  _dotSpawnTimer = setInterval(spawnDot, 700);

  _gameTimer = setInterval(() => {
    _gameTimeLeft--;
    $('gameTimerDisplay').textContent = _gameTimeLeft;
    if (_gameTimeLeft <= 0) endGame();
  }, 1000);
}

function spawnDot() {
  if (!_gameRunning) return;
  const arena = $('gameArena');
  const type  = DOT_TYPES[Math.floor(Math.random() * DOT_TYPES.length)];
  const dot   = document.createElement('div');
  const id    = ++_dotIdCounter;

  dot.className = `game-dot ${type.cls}`;
  dot.id        = `dot-${id}`;
  dot.style.left = (10 + Math.random() * 80) + '%';
  dot.style.top  = (10 + Math.random() * 80) + '%';

  dot.addEventListener('click', () => {
    if (!_gameRunning) return;
    _gameScore += type.points;
    $('gameScore').textContent = _gameScore;
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

  const prev  = parseInt(localStorage.getItem('studyos_game_best') || '0');
  const isNew = _gameScore > prev;
  if (isNew) {
    localStorage.setItem('studyos_game_best', _gameScore);
    STATE.gameBestScore = _gameScore;
  }
  $('gameBest').textContent = Math.max(_gameScore, prev);

  const result = $('gameResult');
  result.style.display = 'flex';
  $('grMsg').textContent   = isNew ? '🏆 New High Score!' : getGameMsg(_gameScore);
  $('grScore').textContent = `You scored ${_gameScore} points${isNew ? ' (Personal Best!)' : ''}`;

  $('closeGameBtn').onclick = () => { closeModal('gameModal'); resetGameState(); };
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
  $('gameScore').textContent        = _gameScore;
  $('gameTimerDisplay').textContent = _gameTimeLeft;
}

function initGameModal() {
  if ($('closeGameBtn')) {
    $('closeGameBtn').onclick = () => { closeModal('gameModal'); resetGameState(); };
  }
}

// ============================================================
// 34. THEME TOGGLE
// ============================================================
function initThemeToggle() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;

  const saved       = localStorage.getItem('studyos_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const startLight  = saved === 'light' || (!saved && !prefersDark);

  if (startLight) {
    document.body.classList.add('light-mode');
    btn.setAttribute('aria-checked', 'true');
    btn.setAttribute('aria-label', 'Switch to dark mode');
  }

  function applyTheme(isLight) {
    document.body.classList.add('theme-transitioning');
    if (isLight) {
      document.body.classList.add('light-mode');
      localStorage.setItem('studyos_theme', 'light');
      btn.setAttribute('aria-checked', 'true');
      btn.setAttribute('aria-label', 'Switch to dark mode');
    } else {
      document.body.classList.remove('light-mode');
      localStorage.setItem('studyos_theme', 'dark');
      btn.setAttribute('aria-checked', 'false');
      btn.setAttribute('aria-label', 'Switch to light mode');
    }
    setTimeout(() => document.body.classList.remove('theme-transitioning'), 420);
  }

  btn.addEventListener('click', () => {
    const goLight = !document.body.classList.contains('light-mode');
    applyTheme(goLight);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('studyos_theme')) {
      applyTheme(!e.matches);
    }
  });
}

// ============================================================
// 35. FOCUS MODE BUTTON
// ============================================================
function initFocusMode() {
  $('focusModeBtn').addEventListener('click', toggleFocusMode);
  $('focusExitBtn').addEventListener('click', () => {
    _focusActive = false;
    $('focusOverlay').style.display = 'none';
  });
}

// ============================================================
// 36. UTILITY
// ============================================================
function findTask(id) {
  // id might come from onclick as a number (int) or string
  return STATE.tasks.find(t => t.id == id);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// 37. EXPOSE GLOBALS (needed for onclick= in HTML)
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
// 38. MAIN INIT
// ============================================================
function init() {
  loadState();
  startClock();
  startQuoteRotator();
  initTabs();
  initAddTaskModal();
  initSessionCompleteModal();
  initTaskDoneModal();
  initEarlyCompleteModal();
  initPendingCompleteModal();
  initRewardModal();
  initGameModal();
  initThemeToggle();
  initFocusMode();
  renderAll();
  renderBadges();
  updateRewardPips();

  // Close modals when clicking outside them
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  // Two separate intervals:
  // timerTick()       — state machine only, NO DOM changes
  // liveUpdateCards() — DOM patch only, no state changes
  setInterval(timerTick,       1000);
  setInterval(liveUpdateCards, 1000);

  // Auto-save every 30 seconds
  setInterval(saveState, 30000);
}

document.addEventListener('DOMContentLoaded', init);
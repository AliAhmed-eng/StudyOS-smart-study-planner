/* ============================================================
   StudyOS — install_prompt_patch.js
   
   DROP-IN PATCH for app.js.
   
   HOW TO APPLY:
     1. In app.js, locate the EXISTING isAppInstalled() function
        (around line 1686) and replace it with the version below.
     2. Replace the existing initInstallPrompt() function
        (around line 278) with the version below.
     3. Replace the existing initIosInstallPopup() function
        (around line 1744) with the version below.
     4. No other changes needed.
   
   See section comments for exactly what changed and why.
   ============================================================ */

'use strict';


// ============================================================
// --- FIX: PWA Installed Detection ---
// ============================================================
// Replaces the existing isAppInstalled() at ~line 1686.
//
// CHANGES vs original:
//  + Checks (display-mode: fullscreen) in addition to standalone
//  + Checks (display-mode: minimal-ui) — some Android OEMs use it
//  + Adds explicit console log so the condition is visible in DevTools
//  + Extracted into a single authoritative function used by ALL guards
// ============================================================

function isAppInstalled() {
  const standaloneIOS      = window.navigator.standalone === true;
  const standaloneMedia    = window.matchMedia('(display-mode: standalone)').matches;
  const fullscreenMedia    = window.matchMedia('(display-mode: fullscreen)').matches;
  const minimalUiMedia     = window.matchMedia('(display-mode: minimal-ui)').matches;

  const installed = standaloneIOS || standaloneMedia || fullscreenMedia || minimalUiMedia;

  if (installed) {
    console.log('[StudyOS] PWA Installed detected — running in standalone/fullscreen mode');
  }

  return installed;
}
// --- FIX: PWA Installed Detection End ---


// ============================================================
// --- FIX: Install Prompt Control ---
// --- FIX: Duplicate Prompt Prevention ---
// ============================================================
// Replaces the existing initInstallPrompt() at ~line 278.
//
// CHANGES vs original:
//  + isAppInstalled() now also checks fullscreen + minimal-ui
//  + Added "Install prompt blocked (already installed)" console log
//  + Added "Install prompt shown" console log
//  + dismissBtn now uses 'installPromptDismissed' key (canonical)
//    AND writes the legacy 'hideInstallPopup' key for backward compat
//  + appinstalled handler clears BOTH keys on uninstall/reinstall
//  + appinstalled fires 'PWA Installed detected' log
//  + Banner immediate-hide at startup also logs
// ============================================================

function initInstallPrompt() {
  // --- FIX: Duplicate Prompt Prevention ---
  // If already running as installed PWA, hide banner immediately and bail.
  if (isAppInstalled()) {
    console.log('[StudyOS] Install prompt blocked (already installed)');
    const banner = $('installBanner');
    if (banner) banner.style.display = 'none';
    return; // ← early return: don't even wire up the event listener
  }
  // --- FIX: Duplicate Prompt Prevention End ---

  // --- FIX: Install Prompt Control ---
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();

    // Double-check at event time — matchMedia state can change between
    // page-load and the async beforeinstallprompt fire on slow networks.
    if (isAppInstalled()) {
      console.log('[StudyOS] Install prompt blocked (already installed)');
      return;
    }

    // Respect the user's permanent dismissal across all devices/prompts.
    // We read BOTH keys so old sessions (using legacy key) are honoured.
    const dismissed = (
      localStorage.getItem('installPromptDismissed') === 'true' ||
      localStorage.getItem('hideInstallPopup')        === 'true'
    );
    if (dismissed) {
      console.log('[StudyOS] Install prompt blocked (user dismissed)');
      return;
    }

    // All clear — show the banner.
    _deferredInstallPrompt = e;

    // Clean up any legacy keys from older app versions
    localStorage.removeItem('studyos_install_dismissed');

    const banner = $('installBanner');
    if (banner) {
      banner.style.display = 'flex';
      console.log('[StudyOS] Install prompt shown');
    }
  });
  // --- FIX: Install Prompt Control End ---

  // ── Install button ────────────────────────────────────────
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

  // ── Dismiss button ("Later" / "×") ───────────────────────
  // --- FIX: Duplicate Prompt Prevention ---
  const dismissBtn = $('installDismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      const banner = $('installBanner');
      if (banner) banner.style.display = 'none';
      _deferredInstallPrompt = null;

      // Write canonical key; also write legacy key so older code paths
      // (e.g. iOS popup guard) stay consistent.
      localStorage.setItem('installPromptDismissed', 'true');
      localStorage.setItem('hideInstallPopup',        'true');

      console.log('[StudyOS] Install prompt dismissed by user — will not show again');
    });
  }
  // --- FIX: Duplicate Prompt Prevention End ---

  // ── appinstalled — fires after user confirms install ─────
  // --- FIX: Duplicate Prompt Prevention ---
  window.addEventListener('appinstalled', () => {
    const banner = $('installBanner');
    if (banner) banner.style.display = 'none';
    _deferredInstallPrompt = null;

    // Clear ALL dismissal flags so if the user ever uninstalls and
    // revisits in the browser, the prompt can re-appear cleanly.
    localStorage.removeItem('installPromptDismissed');         // canonical key
    localStorage.removeItem('hideInstallPopup');               // legacy key
    localStorage.removeItem('studyos_install_dismissed');      // older legacy
    localStorage.removeItem('studyos_ios_install_dismissed'); // iOS key
    sessionStorage.removeItem('studyos_ios_install_session_seen');

    console.log('[StudyOS] PWA Installed detected — appinstalled event fired ✓');
  });
  // --- FIX: Duplicate Prompt Prevention End ---
}


// ============================================================
// --- FIX: Install Prompt Control (iOS) ---
// ============================================================
// Replaces the existing initIosInstallPopup() at ~line 1744.
//
// CHANGES vs original:
//  + Reads canonical 'installPromptDismissed' key in addition to
//    the two legacy keys (backward-compatible)
//  + Added debug console logs matching the required log strings
// ============================================================

function initIosInstallPopup() {
  // Guard: only for iOS devices
  if (!isIosDevice()) return;

  // Guard: already running as installed PWA
  if (isAppInstalled()) {
    console.log('[StudyOS] Install prompt blocked (already installed)');
    return;
  }

  // Guard: user permanently dismissed — check all three keys for compat
  const permanentlyDismissed = (
    localStorage.getItem('installPromptDismissed')         === 'true'  ||
    localStorage.getItem('hideInstallPopup')                === 'true'  ||
    localStorage.getItem('studyos_ios_install_dismissed')  === 'permanent'
  );
  if (permanentlyDismissed) {
    console.log('[StudyOS] Install prompt blocked (user dismissed)');
    return;
  }

  // Guard: user already saw it this browser session
  if (sessionStorage.getItem('studyos_ios_install_session_seen')) return;

  // Wire up button handlers BEFORE showing the popup
  const closeBtn    = document.getElementById('iosInstallClose');
  const gotItBtn    = document.getElementById('iosInstallGotIt');
  const dontShowBtn = document.getElementById('iosInstallDontShow');

  if (closeBtn)    closeBtn.addEventListener('click',    () => hideIosInstallPopup(false));
  if (gotItBtn)    gotItBtn.addEventListener('click',    () => hideIosInstallPopup(false));
  if (dontShowBtn) dontShowBtn.addEventListener('click', () => hideIosInstallPopup(true));

  // Close when tapping the dark backdrop
  const overlay = document.getElementById('iosInstallOverlay');
  if (overlay) {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) hideIosInstallPopup(false);
    });
  }

  // Delay popup so the page finishes loading and feels natural
  setTimeout(() => {
    showIosInstallPopup();
    console.log('[StudyOS] Install prompt shown');
  }, 2500);
}
// --- FIX: Install Prompt Control (iOS) End ---


/* ============================================================
   MANIFEST.JSON GUIDANCE
   ============================================================
   No structural changes required. The existing manifest is correct.
   
   ONE recommended addition: add an "id" field so Chrome uses an
   explicit app identity instead of deriving it from start_url.
   This prevents "same app, different URL" creating duplicate install
   entries when the GitHub Pages subdirectory path ever changes.
   
   Add this field to manifest.json (keep all existing fields):
   
     "id": "/",
   
   Full example (only the new line shown in context):
   
     {
       "name": "StudyOS — Smart Study Planner",
       "short_name": "StudyOS",
       "id": "/",                 ← ADD THIS
       "start_url": "./",
       "scope": "./",
       ...
     }
   
   The value "/" is intentionally generic — it stays stable even if
   the repo is renamed or moved to a custom domain, preventing Chrome
   from treating it as a different installable app.
   ============================================================ */
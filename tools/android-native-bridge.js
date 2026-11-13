import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

var isNative = Capacitor.isNativePlatform();
if (isNative) {
  try {
    document.documentElement.classList.add('is-native-app');
    document.documentElement.setAttribute('data-native', 'true');
    if (document.body) {
      document.body.classList.add('is-native-app');
      document.body.setAttribute('data-native', 'true');
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        if (document.body) {
          document.body.classList.add('is-native-app');
          document.body.setAttribute('data-native', 'true');
        }
      });
    }
  } catch (e) {}

  function cleanupNativeUI() {
    try {
      var els = document.querySelectorAll('footer.credit, footer, nav[aria-label="Browse MedLadder"]');
      for (var i = 0; i < els.length; i++) {
        els[i].style.setProperty('display', 'none', 'important');
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanupNativeUI);
  } else {
    cleanupNativeUI();
  }
}

// ---------------------------------------------------------------------------
// Native feel: app-like touch behaviour + status/navigation bars that match
// the page (light/dark theme) instead of a fixed strip.
// ---------------------------------------------------------------------------
if (isNative) {
  try {
    var nativeCss = document.createElement('style');
    nativeCss.id = 'medladder-native-css';
    nativeCss.textContent = [
      'html{-webkit-tap-highlight-color:transparent;}body{overscroll-behavior-y:none;}',
      // No long-press text selection / link previews on UI chrome (question and explanation text stay selectable)
      'button,a,nav,header,footer,label,summary,[role="button"],[role="tab"],.opt,.v3-li,.btn,img,svg{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}',
      'input,textarea,[contenteditable="true"]{-webkit-user-select:text;user-select:text;}',
      // Pressed state like a native control
      'button,.opt,.v3-li,.btn,[role="button"]{transition:transform .08s ease,filter .08s ease;}',
      'button:active:not(:disabled),.opt:active:not(:disabled),.v3-li:active,.btn:active:not(:disabled),[role="button"]:active{transform:scale(.985);filter:brightness(.96);}',
      // Hide scrollbars like native lists
      '::-webkit-scrollbar{width:0;height:0;}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(nativeCss);
  } catch (e) {}

  // No pinch-zoom inside the app
  try {
    var vp = document.querySelector('meta[name="viewport"]');
    if (vp && !/maximum-scale/.test(vp.content)) vp.content += ', maximum-scale=1, user-scalable=no';
  } catch (e) {}
}

function cssColorToHex(c) {
  var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c || '');
  if (!m || (m[4] !== undefined && parseFloat(m[4]) === 0)) return null;
  return '#' + [m[1], m[2], m[3]].map(function (n) { return ('0' + parseInt(n, 10).toString(16)).slice(-2); }).join('');
}

var lastBarsKey = '';
function syncSystemBars() {
  if (!isNative) return;
  try {
    var dark = document.documentElement.classList.contains('dark');
    var bg = (document.body && cssColorToHex(getComputedStyle(document.body).backgroundColor)) ||
      cssColorToHex(getComputedStyle(document.documentElement).backgroundColor) ||
      (dark ? '#0b0d17' : '#ffffff');
    var key = bg + (dark ? 'd' : 'l');
    if (key === lastBarsKey) return;
    lastBarsKey = key;
    if (window.MedLadderAndroidApp && typeof window.MedLadderAndroidApp.setBarsColor === 'function') {
      window.MedLadderAndroidApp.setBarsColor(bg);
    }
    // DARK style = light icons (for dark backgrounds), LIGHT style = dark icons
    SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(function () {});
  } catch (e) {}
}

if (isNative) {
  var startBarsSync = function () {
    syncSystemBars();
    try {
      new MutationObserver(function () { setTimeout(syncSystemBars, 50); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {}
    App.addListener('resume', function () { lastBarsKey = ''; syncSystemBars(); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startBarsSync);
  else startBarsSync();
}

var backHandlers = [];
var lastBackPressTime = 0;

function registerBackHandler(fn) {
  if (typeof fn === 'function') {
    backHandlers.unshift(fn);
    return function unregister() {
      var idx = backHandlers.indexOf(fn);
      if (idx !== -1) backHandlers.splice(idx, 1);
    };
  }
  return function () {};
}

function showExitToast(msg) {
  if (window.MedLadderAndroidApp && typeof window.MedLadderAndroidApp.showToast === 'function') {
    window.MedLadderAndroidApp.showToast(msg);
    return;
  }
  var toast = document.getElementById('nativeExitToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'nativeExitToast';
    toast.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:rgba(20,20,20,0.92);color:#fff;padding:10px 22px;border-radius:24px;font-size:13px;font-weight:600;box-shadow:0 6px 18px rgba(0,0,0,0.35);z-index:999999;pointer-events:none;transition:opacity 0.25s ease;opacity:0;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(function () {
    toast.style.opacity = '0';
  }, 1900);
}

function exitApp() {
  if (window.MedLadderAndroidApp && typeof window.MedLadderAndroidApp.exitApp === 'function') {
    window.MedLadderAndroidApp.exitApp();
  } else {
    App.exitApp().catch(function () {});
  }
}

function handleBackButton() {
  // 1. Registered back handlers (LIFO)
  for (var i = 0; i < backHandlers.length; i++) {
    try {
      if (backHandlers[i]()) return true;
    } catch (e) {
      console.warn('MedLadderNative back handler error:', e);
    }
  }

  // 2. Modals/overlays in DOM
  var authOverlay = document.getElementById('authModalOverlay');
  if (authOverlay && (authOverlay.classList.contains('open') || (!authOverlay.classList.contains('hidden') && authOverlay.style.display !== 'none'))) {
    if (typeof window.closeAuthModal === 'function') {
      window.closeAuthModal();
      return true;
    }
    var closeBtn = document.getElementById('authModalClose') || authOverlay.querySelector('.auth-close, .modal-close');
    if (closeBtn) { closeBtn.click(); return true; }
    authOverlay.classList.remove('open');
    authOverlay.classList.add('hidden');
    return true;
  }

  var proOverlay = document.getElementById('proModalOverlay');
  if (proOverlay && (proOverlay.classList.contains('open') || (!proOverlay.classList.contains('hidden') && proOverlay.style.display !== 'none'))) {
    if (typeof window.closeProModal === 'function') {
      window.closeProModal();
      return true;
    }
    var closeProBtn = proOverlay.querySelector('.pro-close, .modal-close');
    if (closeProBtn) { closeProBtn.click(); return true; }
    proOverlay.classList.remove('open');
    proOverlay.classList.add('hidden');
    return true;
  }

  var adminOverlay = document.getElementById('adminModalOverlay');
  if (adminOverlay && (adminOverlay.classList.contains('open') || (!adminOverlay.classList.contains('hidden') && adminOverlay.style.display !== 'none'))) {
    if (typeof window.closeAdminModal === 'function') {
      window.closeAdminModal();
      return true;
    }
    adminOverlay.classList.remove('open');
    adminOverlay.classList.add('hidden');
    return true;
  }

  var flagDialog = document.getElementById('flagDialog');
  if (flagDialog) {
    if (typeof window.closeFlagDialog === 'function') {
      window.closeFlagDialog();
    } else {
      var flagCancel = document.getElementById('flagCancel');
      if (flagCancel) flagCancel.click();
      else if (flagDialog.parentNode) flagDialog.parentNode.removeChild(flagDialog);
    }
    return true;
  }

  var mtAuthModal = document.getElementById('authModal');
  if (mtAuthModal && !mtAuthModal.hidden && mtAuthModal.style.display !== 'none') {
    var mtClose = document.getElementById('authModalClose');
    if (mtClose) mtClose.click();
    else mtAuthModal.hidden = true;
    return true;
  }

  var openDialog = document.querySelector('dialog[open]');
  if (openDialog) {
    try { openDialog.close(); } catch (e) { openDialog.removeAttribute('open'); }
    return true;
  }

  // 3. In-page back button (#backBtn)
  var backBtn = document.getElementById('backBtn');
  if (backBtn && backBtn.offsetParent !== null) {
    backBtn.click();
    return true;
  }

  // 4. Secondary route / page
  var p = (window.location.pathname || '').replace(/\/$/, '').toLowerCase();
  var isRoot = p === '' || p === '/' || p === '/index.html';
  if (!isRoot) {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
    return true;
  }

  // 5. On Home / Root: double-tap back to exit
  var now = Date.now();
  if (now - lastBackPressTime < 2000) {
    exitApp();
    return true;
  } else {
    lastBackPressTime = now;
    showExitToast('Press back again to exit');
    return true;
  }
}

if (isNative) {
  try {
    App.addListener('backButton', function () {
      handleBackButton();
    });
  } catch (e) {
    console.warn('Could not register App.addListener(backButton):', e);
  }

  document.addEventListener('backbutton', function (e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    handleBackButton();
  });
}

// ---------------------------------------------------------------------------
// Live updates (self-hosted Capgo, bundles on Cloudflare R2)
// The app checks a small manifest on R2, downloads the new web bundle in the
// background, and switches to it the next time the app is fully closed and
// reopened (never mid-quiz). Publish with: npm run live-update
// ---------------------------------------------------------------------------
var LIVE_UPDATE_MANIFEST_URL = 'https://pub-5e62ac2b4d1c43fcb7fb6b025a52e189.r2.dev/app-updates/android/latest.json';

function liveUpdateLog() {
  try { console.log.apply(console, ['[MedLadder live update]'].concat([].slice.call(arguments))); } catch (e) {}
}

async function checkForLiveUpdate() {
  // Confirm this bundle booted fine, otherwise Capgo rolls back to the previous one.
  try { await CapacitorUpdater.notifyAppReady(); } catch (e) { liveUpdateLog('notifyAppReady failed', e); }

  // One check per app session is enough (the bridge loads on every page).
  try {
    if (sessionStorage.getItem('ml_live_update_checked') === '1') return;
    sessionStorage.setItem('ml_live_update_checked', '1');
  } catch (e) {}

  try {
    var info = await App.getInfo();
    var nativeBuild = parseInt(info.build, 10) || 0;

    var res = await fetch(LIVE_UPDATE_MANIFEST_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    var manifest = await res.json();
    if (!manifest || !manifest.version || !manifest.url) return;

    if (manifest.minNativeVersionCode && nativeBuild < manifest.minNativeVersionCode) {
      liveUpdateLog('skipped: needs native build', manifest.minNativeVersionCode, 'have', nativeBuild);
      return;
    }
    if (manifest.maxNativeVersionCode && nativeBuild > manifest.maxNativeVersionCode) return;

    var current = await CapacitorUpdater.current();
    var currentVersion = current && current.bundle ? current.bundle.version : '';
    if (currentVersion === manifest.version) return;

    var listed = await CapacitorUpdater.list();
    var bundles = (listed && listed.bundles) || [];
    var bundle = null;
    for (var i = 0; i < bundles.length; i++) {
      if (bundles[i].version === manifest.version && bundles[i].status !== 'error' && bundles[i].status !== 'deleted') {
        bundle = bundles[i];
        break;
      }
    }

    if (!bundle) {
      liveUpdateLog('downloading', manifest.version);
      var opts = { url: manifest.url, version: manifest.version };
      if (manifest.checksum) opts.checksum = manifest.checksum;
      bundle = await CapacitorUpdater.download(opts);
    }

    // Apply only after the app is killed and reopened, so nobody loses a quiz in progress.
    try { await CapacitorUpdater.setMultiDelay({ delayConditions: [{ kind: 'kill' }] }); } catch (e) {}
    await CapacitorUpdater.next({ id: bundle.id });
    liveUpdateLog('ready, applies on next app launch:', manifest.version);
  } catch (e) {
    liveUpdateLog('check failed', e);
  }
}

if (isNative) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { checkForLiveUpdate(); });
  } else {
    checkForLiveUpdate();
  }
}

// ---------------------------------------------------------------------------
// Haptic feedback (quiz screen). kind: 'success' | 'error' | 'tap'
// Users can turn it off with localStorage 'ml_haptics' = 'off'.
// ---------------------------------------------------------------------------
function hapticsEnabled() {
  try { return localStorage.getItem('ml_haptics') !== 'off'; } catch (e) { return true; }
}

function setHapticsEnabled(on) {
  try { localStorage.setItem('ml_haptics', on ? 'on' : 'off'); } catch (e) {}
  if (on) haptic('tap');
}

function haptic(kind) {
  if (!hapticsEnabled()) return;
  if (!isNative) return;
  try {
    if (kind === 'success') Haptics.notification({ type: NotificationType.Success }).catch(function () {});
    else if (kind === 'error') Haptics.notification({ type: NotificationType.Error }).catch(function () {});
    else Haptics.impact({ style: ImpactStyle.Light }).catch(function () {});
  } catch (e) {}
}

window.MedLadderNative = {
  isNative: isNative,
  App: App,
  Browser: Browser,
  registerBackHandler: registerBackHandler,
  handleBackButton: handleBackButton,
  exitApp: exitApp,
  showToast: showExitToast,
  checkForLiveUpdate: checkForLiveUpdate,
  haptic: haptic,
  hapticsEnabled: hapticsEnabled,
  setHapticsEnabled: setHapticsEnabled,
  syncSystemBars: syncSystemBars,
  Updater: CapacitorUpdater
};

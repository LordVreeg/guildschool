// ============================================================
// INIT
// ============================================================
// Registered after every other script has loaded, so the handler can reach
// any function. Boot (handleSignedIn) runs once a signed-in session exists.
// A reset-link session asks for the new password before the app loads.
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') passwordRecoveryPending = true;
  if (session && session.user) {
    currentUser = session.user;
    hideAuthGate();
    const label = document.getElementById('auth-user-label');
    if (label) label.textContent = currentUser.email;
    if (passwordRecoveryPending) showResetGate();
    else bootOnce();
  } else {
    currentUser = null;
    currentProfile = null;
    bootStarted = false;
    passwordRecoveryPending = false;
    hidePendingGate();
    hideResetGate();
    showAuthGate();
  }
});

if (authLinkError) setAuthStatus(authLinkError + ' Request a new link with "Forgot password?".');

// The sidebar's grab bar (#sidebar-grip): drag to make the sidebar narrower or
// wider; double-click puts it back. The width is remembered in this browser.
(function () {
  const grip = document.getElementById('sidebar-grip');
  if (!grip) return;
  const KEY = 'gs_sidebar_w', MIN = 120, MAX = 480, DEFAULT = 220;
  const setWidth = w => document.documentElement.style.setProperty('--sidebar-w', Math.round(w) + 'px');
  try { const saved = parseInt(localStorage.getItem(KEY)); if (saved >= MIN && saved <= MAX) setWidth(saved); } catch (e) {}
  grip.addEventListener('pointerdown', e => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    grip.classList.add('dragging');
    document.body.classList.add('sidebar-resizing');
    const left = document.getElementById('sidebar').getBoundingClientRect().left;
    const move = ev => setWidth(Math.max(MIN, Math.min(MAX, ev.clientX - left)));
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.classList.remove('dragging');
      document.body.classList.remove('sidebar-resizing');
      try { localStorage.setItem(KEY, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'))); } catch (e) {}
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up, { once: true });
    grip.addEventListener('pointercancel', up, { once: true });
  });
  grip.addEventListener('dblclick', () => {
    setWidth(DEFAULT);
    try { localStorage.removeItem(KEY); } catch (e) {}
  });
})();

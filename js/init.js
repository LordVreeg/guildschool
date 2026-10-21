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

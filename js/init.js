// ============================================================
// INIT
// ============================================================
// Registered after every other script has loaded, so the handler can reach
// any function. Boot (handleSignedIn) runs once a signed-in session exists.
sb.auth.onAuthStateChange((event, session) => {
  if (session && session.user) {
    currentUser = session.user;
    hideAuthGate();
    const label = document.getElementById('auth-user-label');
    if (label) label.textContent = currentUser.email;
    if (!bootStarted) {
      bootStarted = true;
      handleSignedIn();
    }
  } else {
    currentUser = null;
    currentProfile = null;
    bootStarted = false;
    hidePendingGate();
    showAuthGate();
  }
});

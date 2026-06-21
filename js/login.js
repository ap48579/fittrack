(async () => {
  // Already logged in? Skip straight to the dashboard.
  const { data } = await sb.auth.getSession();
  if (data.session) {
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const statusEl = document.getElementById('status');
    statusEl.textContent = 'Sending magic link...';
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/index.html` }
    });
    statusEl.textContent = error ? `Error: ${error.message}` : 'Check your email for a login link.';
  });
})();

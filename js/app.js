// Shared helpers loaded on every page, after the Supabase CDN script and
// config.js, and before the page-specific script.

const sb = supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY);

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Monday-start week containing `d` (UTC), returned as an ISO date string.
function startOfWeekIso(d = new Date()) {
  const date = new Date(d);
  const day = date.getUTCDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return isoDate(date);
}

async function requireSession() {
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    window.location.href = 'login.html';
    return null;
  }
  return data.session;
}

function wireLogout(buttonId = 'logout-btn') {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.href = 'login.html';
  });
}

function setActiveNav() {
  const here = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav.tabs a').forEach((a) => {
    if (a.getAttribute('href') === here) a.classList.add('active');
  });
}

document.addEventListener('DOMContentLoaded', setActiveNav);

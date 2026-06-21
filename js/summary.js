(async () => {
  const session = await requireSession();
  if (!session) return;
  wireLogout();

  const container = document.getElementById('summary-list');
  const { data, error } = await sb
    .from('weekly_summaries')
    .select('*')
    .order('week_start', { ascending: false });

  if (error) {
    container.innerHTML = `<p class="status-msg">Error: ${error.message}</p>`;
    return;
  }

  if (!data.length) {
    container.innerHTML =
      '<p class="muted">No weekly recaps yet — the first one shows up after your first full Monday–Sunday week, and gets emailed to you too.</p>';
    return;
  }

  container.innerHTML = '';
  data.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${s.week_start} – ${s.week_end}</h3>
      <p>${s.recap_text || ''}</p>
      <ul class="list">
        <li class="muted">Daily tasks: ${s.daily_tasks_completed}/${s.daily_tasks_total}</li>
        <li class="muted">Weekly tasks: ${s.weekly_tasks_completed}/${s.weekly_tasks_total}</li>
        <li class="muted">Days food logged: ${s.days_logged}/7</li>
        <li class="muted">Avg calories on logged days: ${
          s.avg_daily_calories != null ? Math.round(s.avg_daily_calories) : '—'
        }</li>
      </ul>`;
    container.appendChild(card);
  });
})();

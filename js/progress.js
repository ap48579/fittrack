(async () => {
  const session = await requireSession();
  if (!session) return;
  wireLogout();

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 29); // last 30 days, inclusive of today
  const sinceIso = isoDate(since);

  const [{ data: tasks, error: tasksErr }, { data: foods, error: foodsErr }] = await Promise.all([
    sb.from('daily_tasks').select('task_date, is_done').gte('task_date', sinceIso),
    sb.from('food_logs').select('logged_at, calories').gte('logged_at', `${sinceIso}T00:00:00`)
  ]);
  if (tasksErr) console.error(tasksErr);
  if (foodsErr) console.error(foodsErr);

  const byDate = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    byDate[isoDate(d)] = { total: 0, done: 0, calories: 0 };
  }

  (tasks || []).forEach((t) => {
    const bucket = byDate[t.task_date];
    if (!bucket) return;
    bucket.total += 1;
    if (t.is_done) bucket.done += 1;
  });

  (foods || []).forEach((f) => {
    const day = f.logged_at.slice(0, 10);
    const bucket = byDate[day];
    if (!bucket) return;
    bucket.calories += Number(f.calories) || 0;
  });

  const labels = Object.keys(byDate);
  const completionPct = labels.map((d) => {
    const b = byDate[d];
    return b.total ? Math.round((b.done / b.total) * 100) : 0;
  });
  const calorieSeries = labels.map((d) => Math.round(byDate[d].calories));

  // Streak: consecutive days ending today with at least one completed task.
  let streak = 0;
  for (let i = labels.length - 1; i >= 0; i--) {
    if (byDate[labels[i]].done > 0) streak++;
    else break;
  }
  document.getElementById('streak-count').textContent = streak;

  const shortLabels = labels.map((d) => d.slice(5)); // MM-DD

  new Chart(document.getElementById('completion-chart'), {
    type: 'bar',
    data: {
      labels: shortLabels,
      datasets: [{ label: 'Task completion %', data: completionPct, backgroundColor: '#4f46e5' }]
    },
    options: { scales: { y: { beginAtZero: true, max: 100 } } }
  });

  new Chart(document.getElementById('calorie-chart'), {
    type: 'line',
    data: {
      labels: shortLabels,
      datasets: [{ label: 'Calories', data: calorieSeries, borderColor: '#16a34a', tension: 0.3 }]
    },
    options: { scales: { y: { beginAtZero: true } } }
  });
})();

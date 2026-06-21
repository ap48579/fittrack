(async () => {
  const session = await requireSession();
  if (!session) return;
  wireLogout();

  const userId = session.user.id;
  const weekStart = startOfWeekIso(new Date());
  const weekEndDate = new Date(`${weekStart}T00:00:00Z`);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
  document.getElementById('week-range').textContent = `${weekStart} – ${isoDate(weekEndDate)}`;

  const listEl = document.getElementById('weekly-task-list');
  const formEl = document.getElementById('weekly-task-form');

  async function loadTasks() {
    const { data, error } = await sb
      .from('weekly_tasks')
      .select('*')
      .eq('week_start', weekStart)
      .order('created_at', { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    listEl.innerHTML = '';
    data.forEach(renderRow);
  }

  function renderRow(task) {
    const li = document.createElement('li');
    li.className = 'task-row' + (task.is_done ? ' done' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.is_done;
    checkbox.addEventListener('change', async () => {
      await sb.from('weekly_tasks').update({ is_done: checkbox.checked }).eq('id', task.id);
      loadTasks();
    });

    const span = document.createElement('span');
    span.textContent = task.title;

    const del = document.createElement('button');
    del.textContent = '✕';
    del.className = 'icon-btn';
    del.addEventListener('click', async () => {
      await sb.from('weekly_tasks').delete().eq('id', task.id);
      loadTasks();
    });

    li.append(checkbox, span, del);
    listEl.appendChild(li);
  }

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('weekly-task-input');
    const title = input.value.trim();
    if (!title) return;
    await sb.from('weekly_tasks').insert({ title, week_start: weekStart, user_id: userId });
    input.value = '';
    loadTasks();
  });

  loadTasks();
})();

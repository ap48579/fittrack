(async () => {
  const session = await requireSession();
  if (!session) return;
  wireLogout();

  const today = isoDate(new Date());
  const userId = session.user.id;

  const taskListEl = document.getElementById('daily-task-list');
  const taskFormEl = document.getElementById('daily-task-form');
  const foodListEl = document.getElementById('today-food-list');
  const foodEmptyEl = document.getElementById('today-food-empty');
  const calorieTotalEl = document.getElementById('today-calorie-total');
  const taskCountEl = document.getElementById('today-task-count');

  async function loadTasks() {
    const { data, error } = await sb
      .from('daily_tasks')
      .select('*')
      .eq('task_date', today)
      .order('created_at', { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    taskListEl.innerHTML = '';
    data.forEach(renderTaskRow);
    const done = data.filter((t) => t.is_done).length;
    taskCountEl.textContent = `${done}/${data.length}`;
  }

  function renderTaskRow(task) {
    const li = document.createElement('li');
    li.className = 'task-row' + (task.is_done ? ' done' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.is_done;
    checkbox.addEventListener('change', async () => {
      await sb.from('daily_tasks').update({ is_done: checkbox.checked }).eq('id', task.id);
      loadTasks();
    });

    const span = document.createElement('span');
    span.textContent = task.title;

    const del = document.createElement('button');
    del.textContent = '✕';
    del.className = 'icon-btn';
    del.addEventListener('click', async () => {
      await sb.from('daily_tasks').delete().eq('id', task.id);
      loadTasks();
    });

    li.append(checkbox, span, del);
    taskListEl.appendChild(li);
  }

  taskFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('daily-task-input');
    const title = input.value.trim();
    if (!title) return;
    await sb.from('daily_tasks').insert({ title, task_date: today, user_id: userId });
    input.value = '';
    loadTasks();
  });

  async function loadFood() {
    const { data, error } = await sb
      .from('food_logs')
      .select('*')
      .gte('logged_at', `${today}T00:00:00`)
      .lte('logged_at', `${today}T23:59:59`)
      .order('logged_at', { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    foodListEl.innerHTML = '';
    let total = 0;
    data.forEach((log) => {
      total += Number(log.calories) || 0;
      const li = document.createElement('li');
      li.className = 'food-row';
      const span = document.createElement('span');
      span.className = 'name';
      span.textContent = log.food_name;
      const cal = document.createElement('span');
      cal.className = 'muted';
      cal.textContent = log.calories != null ? `${Math.round(log.calories)} kcal` : '—';
      li.append(span, cal);
      foodListEl.appendChild(li);
    });
    foodEmptyEl.hidden = data.length > 0;
    calorieTotalEl.textContent = Math.round(total);
  }

  loadTasks();
  loadFood();
})();

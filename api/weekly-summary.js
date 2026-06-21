// Runs once a week (see vercel.json -> crons). Aggregates the week's tasks
// and food logs, writes a summary row, emails a recap, and purges old
// food_logs rows so the database never grows toward the free-tier cap.
const { isoDate, mostRecentSunday, mondayOf } = require('../lib/date-utils');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function restHeaders(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function restGet(pathAndQuery) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers: restHeaders() });
  if (!resp.ok) throw new Error(`Supabase GET ${pathAndQuery} failed: ${await resp.text()}`);
  return resp.json();
}

async function restUpsert(pathAndQuery, body) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: 'POST',
    headers: restHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error(`Supabase POST ${pathAndQuery} failed: ${await resp.text()}`);
  return resp.json();
}

async function restDelete(pathAndQuery) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: 'DELETE',
    headers: restHeaders()
  });
  if (!resp.ok) throw new Error(`Supabase DELETE ${pathAndQuery} failed: ${await resp.text()}`);
}

// Single-user app: grab the one signed-up user via the Auth admin API,
// so we don't need a separate env var to store their UUID.
async function getSingleUserId() {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1`, {
    headers: restHeaders()
  });
  if (!resp.ok) throw new Error(`Could not list users: ${await resp.text()}`);
  const data = await resp.json();
  const users = Array.isArray(data) ? data : data.users;
  if (!users || !users.length) throw new Error('No signed-up user found yet.');
  return users[0].id;
}

function buildRecap(stats) {
  const parts = [];
  const taskPct = stats.dailyTotal ? Math.round((stats.dailyDone / stats.dailyTotal) * 100) : null;
  const weeklyPct = stats.weeklyTotal ? Math.round((stats.weeklyDone / stats.weeklyTotal) * 100) : null;

  parts.push(
    taskPct !== null
      ? `You completed ${stats.dailyDone}/${stats.dailyTotal} daily tasks (${taskPct}%).`
      : 'No daily tasks were logged this week.'
  );

  if (weeklyPct !== null) {
    parts.push(`Weekly goals: ${stats.weeklyDone}/${stats.weeklyTotal} done (${weeklyPct}%).`);
  }

  if (stats.daysLogged > 0) {
    parts.push(
      `You logged food on ${stats.daysLogged}/7 days, averaging ${Math.round(stats.avgDailyCalories)} kcal on days you logged.`
    );
    if (stats.prevAvgCalories) {
      const diff = Math.round(stats.avgDailyCalories - stats.prevAvgCalories);
      if (Math.abs(diff) >= 20) {
        parts.push(`That's ${diff > 0 ? 'up' : 'down'} ${Math.abs(diff)} kcal/day vs. last week.`);
      } else {
        parts.push("That's about the same as last week.");
      }
    }
  } else {
    parts.push('No food was logged this week.');
  }

  return parts.join(' ');
}

module.exports = async (req, res) => {
  // Vercel signs cron-triggered requests with "Authorization: Bearer $CRON_SECRET"
  // when CRON_SECRET is set, so this rejects anyone else who finds the URL.
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  try {
    const weekEnd = mostRecentSunday(new Date());
    const weekStart = mondayOf(weekEnd);
    const weekEndStr = isoDate(weekEnd);
    const weekStartStr = isoDate(weekStart);

    const prevWeekEnd = new Date(weekStart);
    prevWeekEnd.setUTCDate(prevWeekEnd.getUTCDate() - 1);
    const prevWeekStart = mondayOf(prevWeekEnd);
    const prevWeekStartStr = isoDate(prevWeekStart);
    const prevWeekEndStr = isoDate(prevWeekEnd);

    const userId = await getSingleUserId();

    const [dailyTasks, weeklyTasks, foodLogs, prevFoodLogs] = await Promise.all([
      restGet(`daily_tasks?select=is_done&task_date=gte.${weekStartStr}&task_date=lte.${weekEndStr}`),
      restGet(`weekly_tasks?select=is_done&week_start=eq.${weekStartStr}`),
      restGet(
        `food_logs?select=logged_at,calories&logged_at=gte.${weekStartStr}T00:00:00&logged_at=lte.${weekEndStr}T23:59:59`
      ),
      restGet(
        `food_logs?select=logged_at,calories&logged_at=gte.${prevWeekStartStr}T00:00:00&logged_at=lte.${prevWeekEndStr}T23:59:59`
      )
    ]);

    const dailyDone = dailyTasks.filter((t) => t.is_done).length;
    const weeklyDone = weeklyTasks.filter((t) => t.is_done).length;

    const dayKeys = new Set(foodLogs.map((f) => f.logged_at.slice(0, 10)));
    const totalCalories = foodLogs.reduce((sum, f) => sum + (Number(f.calories) || 0), 0);
    const daysLogged = dayKeys.size;
    const avgDailyCalories = daysLogged ? totalCalories / daysLogged : 0;

    const prevTotal = prevFoodLogs.reduce((sum, f) => sum + (Number(f.calories) || 0), 0);
    const prevDays = new Set(prevFoodLogs.map((f) => f.logged_at.slice(0, 10))).size;
    const prevAvgCalories = prevDays ? prevTotal / prevDays : null;

    const stats = {
      dailyDone,
      dailyTotal: dailyTasks.length,
      weeklyDone,
      weeklyTotal: weeklyTasks.length,
      daysLogged,
      avgDailyCalories,
      prevAvgCalories
    };

    const recapText = buildRecap(stats);

    await restUpsert(`weekly_summaries?on_conflict=user_id,week_start`, {
      user_id: userId,
      week_start: weekStartStr,
      week_end: weekEndStr,
      daily_tasks_completed: dailyDone,
      daily_tasks_total: dailyTasks.length,
      weekly_tasks_completed: weeklyDone,
      weekly_tasks_total: weeklyTasks.length,
      days_logged: daysLogged,
      total_calories: totalCalories,
      avg_daily_calories: avgDailyCalories,
      prev_week_avg_calories: prevAvgCalories,
      recap_text: recapText
    });

    // Email the recap. Failure here should not block the rest of the job.
    let emailSent = false;
    if (process.env.RESEND_API_KEY && process.env.RECIPIENT_EMAIL) {
      try {
        const html = `
          <h2>Your week: ${weekStartStr} to ${weekEndStr}</h2>
          <p>${recapText}</p>
          <ul>
            <li>Daily tasks: ${dailyDone}/${dailyTasks.length}</li>
            <li>Weekly tasks: ${weeklyDone}/${weeklyTasks.length}</li>
            <li>Days with food logged: ${daysLogged}/7</li>
            <li>Avg calories on logged days: ${daysLogged ? Math.round(avgDailyCalories) : '—'}</li>
          </ul>`;
        const emailResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || 'FitTrack <onboarding@resend.dev>',
            to: [process.env.RECIPIENT_EMAIL],
            subject: `Your week in review: ${weekStartStr} to ${weekEndStr}`,
            html
          })
        });
        emailSent = emailResp.ok;
      } catch (_e) {
        emailSent = false;
      }
    }

    // Purge food_logs older than the retention window (default 90 days).
    const retentionDays = Number(process.env.FOOD_LOG_RETENTION_DAYS || 90);
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
    await restDelete(`food_logs?logged_at=lt.${isoDate(cutoff)}T00:00:00`);

    res.status(200).json({ ok: true, weekStart: weekStartStr, weekEnd: weekEndStr, emailSent, recapText });
  } catch (err) {
    res.status(500).json({ error: 'Weekly summary failed', details: String((err && err.message) || err) });
  }
};

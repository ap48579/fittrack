function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Most recent Sunday on/before `date` (UTC), at 00:00:00.
function mostRecentSunday(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

// Monday of the week that ends on the given Sunday.
function mondayOf(sunday) {
  const d = new Date(sunday);
  d.setUTCDate(d.getUTCDate() - 6);
  return d;
}

module.exports = { isoDate, mostRecentSunday, mondayOf };

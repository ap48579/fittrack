// Verifies that an incoming request really carries a valid Supabase session
// for our one user, so the serverless functions (and their free-tier quotas)
// can't be hit by random visitors who stumble on the URL.
async function verifySupabaseUser(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const resp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.SUPABASE_ANON_KEY
    }
  });

  if (!resp.ok) return null;
  return resp.json(); // { id, email, ... }
}

module.exports = { verifySupabaseUser };

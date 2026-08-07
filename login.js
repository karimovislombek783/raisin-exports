const bcrypt = require('bcryptjs');
const { createSessionCookie } = require('../_lib/auth');

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { username, password } = parseBody(req);

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;

  if (!expectedUsername || !expectedHash) {
    // Env vars not configured yet — fail closed with a clear server-side error.
    res.status(500).json({ error: 'Admin auth is not configured on the server yet' });
    return;
  }

  const usernameMatches = username === expectedUsername;
  const passwordMatches = usernameMatches && bcrypt.compareSync(password, expectedHash);

  if (!usernameMatches || !passwordMatches) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  res.setHeader('Set-Cookie', createSessionCookie(username));
  res.status(200).json({ ok: true });
};

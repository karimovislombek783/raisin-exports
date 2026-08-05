// Shared authentication helpers used by every /api/auth/* and /api/admin/* route.
// Session = a signed JWT stored in an HttpOnly cookie. Verified server-side on
// every admin request — never trust the client alone.

const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const COOKIE_NAME = 'admin_session';
const SEVEN_DAYS = 60 * 60 * 24 * 7;

function getTokenFromReq(req) {
  const cookies = cookie.parse(req.headers.cookie || '');
  return cookies[COOKIE_NAME];
}

// Returns the decoded session payload, or null if missing/invalid/expired.
function verifySession(req) {
  const token = getTokenFromReq(req);
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.AUTH_SECRET);
  } catch (err) {
    return null;
  }
}

// Call at the top of any protected API route. If it returns null, it has
// already written a 401 response — just `return` from the handler.
function requireAuth(req, res) {
  const session = verifySession(req);
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return session;
}

function createSessionCookie(username) {
  const token = jwt.sign({ sub: username }, process.env.AUTH_SECRET, { expiresIn: '7d' });
  return cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: SEVEN_DAYS,
  });
}

function clearSessionCookie() {
  return cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
}

module.exports = { verifySession, requireAuth, createSessionCookie, clearSessionCookie, COOKIE_NAME };

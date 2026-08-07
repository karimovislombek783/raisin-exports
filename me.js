const { verifySession } = require('../_lib/auth');

module.exports = async (req, res) => {
  const session = verifySession(req);
  if (!session) {
    res.status(200).json({ authenticated: false });
    return;
  }
  res.status(200).json({ authenticated: true, username: session.sub });
};

const { put } = require('@vercel/blob');
const { requireAuth } = require('../_lib/auth');

// Reads the raw request body as a Buffer, regardless of whether the Vercel
// Node runtime already parsed it (some content types get auto-parsed into
// req.body; anything else is read directly off the request stream).
async function getRawBody(req) {
  if (req.body) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body, 'binary');
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const filename = req.query.filename;
  if (!filename) {
    res.status(400).json({ error: 'Missing ?filename= query param' });
    return;
  }

  try {
    const buffer = await getRawBody(req);
    if (!buffer || buffer.length === 0) {
      res.status(400).json({ error: 'Empty file upload' });
      return;
    }
    const blob = await put(filename, buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType: req.headers['content-type'] || undefined,
    });
    res.status(200).json({ url: blob.url });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
};

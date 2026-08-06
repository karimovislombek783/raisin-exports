const { put } = require('@vercel/blob');
const { requireAuth } = require('../_lib/auth');

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

  const contentType = req.headers['content-type'] || 'application/octet-stream';
  if (!contentType.startsWith('image/')) {
    res.status(400).json({ error: 'Only image files can be uploaded as cover images.' });
    return;
  }

  try {
    // Stream the uploaded file directly to Vercel Blob instead of trying to
    // manually read/parse the request body first. This is the upload pattern
    // supported by the current Vercel Blob SDK and avoids body-parser issues.
    const blob = await put(filename, req, {
      access: 'public',
      token: process.env.ARTICLE_BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: true,
      contentType,
    });

    res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('Blob upload failed:', err);
    res.status(500).json({
      error: 'Upload failed',
      details: err?.message || 'Unknown Vercel Blob error',
    });
  }
};

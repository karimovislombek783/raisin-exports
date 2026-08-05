const { kv } = require('../../_lib/kv');
const { requireAuth } = require('../../_lib/auth');

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
  const session = requireAuth(req, res);
  if (!session) return;

  const { slug } = req.query;

  if (req.method === 'GET') {
    const article = await kv.get(`article:${slug}`);
    if (!article) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    res.status(200).json({ article });
    return;
  }

  if (req.method === 'PUT') {
    const existing = await kv.get(`article:${slug}`);
    if (!existing) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }

    const { title, dek, date, coverImageUrl, body: content, status } = parseBody(req);

    if (status && !['draft', 'published'].includes(status)) {
      res.status(400).json({ error: "status must be 'draft' or 'published'" });
      return;
    }

    const updated = {
      ...existing,
      ...(title !== undefined ? { title } : {}),
      ...(dek !== undefined ? { dek } : {}),
      ...(date !== undefined ? { date } : {}),
      ...(coverImageUrl !== undefined ? { coverImageUrl } : {}),
      ...(content !== undefined ? { body: content } : {}),
      ...(status !== undefined ? { status } : {}),
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`article:${slug}`, updated);
    res.status(200).json({ article: updated });
    return;
  }

  if (req.method === 'DELETE') {
    await kv.del(`article:${slug}`);
    await kv.srem('articles:index', slug);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};

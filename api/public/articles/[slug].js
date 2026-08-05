const { kv } = require('../../_lib/kv');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { slug } = req.query;
  const article = await kv.get(`article:${slug}`);

  if (!article || article.status !== 'published') {
    res.status(404).json({ error: 'Article not found' });
    return;
  }

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
  res.status(200).json({ article });
};

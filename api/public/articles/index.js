const { kv } = require('../../_lib/kv');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const slugs = (await kv.smembers('articles:index')) || [];
  const articles = [];

  for (const slug of slugs) {
    const article = await kv.get(`article:${slug}`);
    if (article && article.status === 'published') {
      articles.push({
        slug: article.slug,
        title: article.title,
        dek: article.dek,
        date: article.date,
        coverImageUrl: article.coverImageUrl,
      });
    }
  }

  articles.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Cache briefly at the edge — published articles don't change every second.
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
  res.status(200).json({ articles });
};

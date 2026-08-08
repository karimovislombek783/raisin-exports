const { kv } = require('../../_lib/kv');

const SITE_URL = 'https://www.central-asia-trade-research.uz';

function sitemapEntry(location, lastModified = '') {
  const lastmod = /^\d{4}-\d{2}-\d{2}/.test(lastModified)
    ? `<lastmod>${lastModified.slice(0, 10)}</lastmod>`
    : '';

  return `<url><loc>${location}</loc>${lastmod}</url>`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const slugs = (await kv.smembers('articles:index')) || [];
  const articles = [];

  for (const slug of slugs) {
    const article = await kv.get(`article:${slug}`);

    if (
      article &&
      (article.status === 'published' || article.status === 'upcoming')
    ) {
      articles.push({
        slug: article.slug,
        title: article.title,
        dek: article.dek,
        date: article.date,
        coverImageUrl: article.coverImageUrl,
        status: article.status,
        productSlug: article.productSlug || '',
        datasetSlug: article.datasetSlug || '',
      });
    }
  }

  articles.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (req.query?.format === 'sitemap') {
    const staticPages = ['/', '/research/', '/data/', '/about/'];

    const entries = [
      ...staticPages.map((path) => sitemapEntry(`${SITE_URL}${path}`)),
      ...articles
        .filter((article) => article.status === 'published')
        .map((article) =>
          sitemapEntry(
            `${SITE_URL}/research/${encodeURIComponent(article.slug)}`,
            article.date
          )
        ),
    ];

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      entries.join('') +
      '</urlset>';

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).send(xml);
    return;
  }

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
  res.status(200).json({ articles });
};

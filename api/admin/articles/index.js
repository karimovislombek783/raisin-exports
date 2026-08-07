const { kv } = require('../../_lib/kv');
const { requireAuth } = require('../../_lib/auth');
const { slugify } = require('../../_lib/slugify');

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

  if (req.method === 'GET') {
    const slugs = (await kv.smembers('articles:index')) || [];
    const articles = [];
    for (const slug of slugs) {
      const article = await kv.get(`article:${slug}`);
      if (article) articles.push(article);
    }
    articles.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.status(200).json({ articles });
    return;
  }

  if (req.method === 'POST') {
    const { title, dek, date, coverImageUrl, body: content, productSlug, datasetSlug, snapshotYear } = parseBody(req);

    if (!title || !title.trim()) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }
    const cleanSnapshotYear = snapshotYear === undefined || snapshotYear === null || snapshotYear === ''
      ? null
      : Number(snapshotYear);
    if (cleanSnapshotYear !== null && (!Number.isInteger(cleanSnapshotYear) || cleanSnapshotYear < 1900 || cleanSnapshotYear > 2100)) {
      res.status(400).json({ error: 'Snapshot year must be a valid four-digit year' });
      return;
    }

    const base = slugify(title) || 'article';
    let slug = base;
    let suffix = 2;
    while (await kv.get(`article:${slug}`)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }

    let linkedProductSlug = productSlug || '';
    if (datasetSlug) {
      const dataset = await kv.get(`dataset:${datasetSlug}`);
      if (!dataset) {
        res.status(400).json({ error: 'Selected dataset does not exist' });
        return;
      }
      if (linkedProductSlug && dataset.productSlug !== linkedProductSlug) {
        res.status(400).json({ error: 'Selected dataset belongs to a different product' });
        return;
      }
      linkedProductSlug = dataset.productSlug;
    }
    if (linkedProductSlug && !(await kv.get(`product:${linkedProductSlug}`))) {
      res.status(400).json({ error: 'Selected product does not exist' });
      return;
    }

    const now = new Date().toISOString();
    const article = {
      slug,
      title: title.trim(),
      dek: dek || '',
      date: date || now.slice(0, 10),
      coverImageUrl: coverImageUrl || '',
      body: content || '',
      productSlug: linkedProductSlug,
      datasetSlug: datasetSlug || '',
      snapshotYear: cleanSnapshotYear,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };

    await kv.set(`article:${slug}`, article);
    await kv.sadd('articles:index', slug);

    res.status(201).json({ article });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};

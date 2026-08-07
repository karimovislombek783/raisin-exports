const { kv } = require('../../_lib/kv');
const { requireAuth } = require('../../_lib/auth');
const {
  parseBody,
  parseCsv,
  normalizeDatasetRows,
  datasetYears,
  validateDatasetInput,
} = require('../../_lib/catalog');

module.exports = async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  const { slug } = req.query;
  const existing = await kv.get(`dataset:${slug}`);

  if (req.method === 'GET') {
    if (!existing) {
      res.status(404).json({ error: 'Dataset not found' });
      return;
    }
    res.status(200).json({ dataset: existing });
    return;
  }

  if (req.method === 'PUT') {
    if (!existing) {
      res.status(404).json({ error: 'Dataset not found' });
      return;
    }
    const body = parseBody(req);
    const merged = { ...existing, ...body };
    const { dataset: clean, errors } = validateDatasetInput(merged, { forPublish: merged.status === 'published' });
    if (errors.length) {
      res.status(400).json({ error: errors[0], errors });
      return;
    }

    const product = await kv.get(`product:${clean.productSlug}`);
    if (!product) {
      res.status(400).json({ error: 'Selected product does not exist.' });
      return;
    }
    if (clean.status === 'published' && product.status !== 'published') {
      res.status(400).json({ error: 'Publish the selected product before publishing this dataset.' });
      return;
    }

    const articleSlugs = (await kv.smembers('articles:index')) || [];
    const linkedArticles = [];
    for (const articleSlug of articleSlugs) {
      const article = await kv.get(`article:${articleSlug}`);
      if (article?.datasetSlug === slug) linkedArticles.push(article);
    }
    if (clean.productSlug !== existing.productSlug && linkedArticles.length) {
      res.status(409).json({ error: 'Remove this dataset from its linked articles before changing its product.' });
      return;
    }
    if (existing.status === 'published' && clean.status === 'draft' && linkedArticles.some((article) => article.status === 'published')) {
      res.status(409).json({ error: 'Unpublish linked articles before unpublishing this dataset.' });
      return;
    }

    let columns = existing.columns;
    let rows = existing.rows;
    if (body.csvText !== undefined && String(body.csvText).trim()) {
      try {
        const parsed = normalizeDatasetRows(clean.dataType, parseCsv(body.csvText));
        columns = parsed.headers;
        rows = parsed.rows;
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
    } else if (clean.dataType !== existing.dataType) {
      res.status(400).json({ error: 'Upload a replacement CSV when changing the dataset type.' });
      return;
    }

    const dataset = {
      ...existing,
      ...clean,
      productName: product.name,
      country: product.country,
      hsCode: product.hsCode,
      hsDescription: product.hsDescription,
      columns,
      rows,
      rowCount: rows.length,
      coveredYears: datasetYears(rows),
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`dataset:${slug}`, dataset);
    res.status(200).json({ dataset });
    return;
  }

  if (req.method === 'DELETE') {
    if (!existing) {
      res.status(404).json({ error: 'Dataset not found' });
      return;
    }
    const articleSlugs = (await kv.smembers('articles:index')) || [];
    for (const articleSlug of articleSlugs) {
      const article = await kv.get(`article:${articleSlug}`);
      if (article?.datasetSlug === slug) {
        res.status(409).json({ error: 'Remove this dataset from its linked articles first.' });
        return;
      }
    }
    await kv.del(`dataset:${slug}`);
    await kv.srem('datasets:index', slug);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};

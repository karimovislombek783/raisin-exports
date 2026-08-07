const { kv } = require('../../_lib/kv');
const { requireAuth } = require('../../_lib/auth');
const { slugify } = require('../../_lib/slugify');
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

  if (req.method === 'GET') {
    const slugs = (await kv.smembers('datasets:index')) || [];
    const datasets = [];
    for (const slug of slugs) {
      const dataset = await kv.get(`dataset:${slug}`);
      if (dataset) datasets.push(dataset);
    }
    datasets.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.status(200).json({ datasets });
    return;
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    const { dataset: clean, errors } = validateDatasetInput(body, { forPublish: body.status === 'published' });
    if (errors.length) {
      res.status(400).json({ error: errors[0], errors });
      return;
    }

    const product = await kv.get(`product:${clean.productSlug}`);
    if (!product) {
      res.status(400).json({ error: 'Selected product does not exist.' });
      return;
    }
    if (body.status === 'published' && product.status !== 'published') {
      res.status(400).json({ error: 'Publish the selected product before publishing this dataset.' });
      return;
    }

    let parsed;
    try {
      parsed = normalizeDatasetRows(clean.dataType, parseCsv(body.csvText));
    } catch (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    const base = slugify(clean.title) || 'dataset';
    let slug = base;
    let suffix = 2;
    while (await kv.get(`dataset:${slug}`)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }

    const now = new Date().toISOString();
    const dataset = {
      slug,
      ...clean,
      productName: product.name,
      country: product.country,
      hsCode: product.hsCode,
      hsDescription: product.hsDescription,
      columns: parsed.headers,
      rows: parsed.rows,
      rowCount: parsed.rows.length,
      coveredYears: datasetYears(parsed.rows),
      createdAt: now,
      updatedAt: now,
    };

    await kv.set(`dataset:${slug}`, dataset);
    await kv.sadd('datasets:index', slug);
    res.status(201).json({ dataset });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};

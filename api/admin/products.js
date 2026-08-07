const { kv } = require('../_lib/kv');
const { requireAuth } = require('../_lib/auth');
const { slugify } = require('../_lib/slugify');
const { parseBody, validateProductInput } = require('../_lib/catalog');

module.exports = async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  const { slug } = req.query || {};

  if (!slug && req.method === 'GET') {
    const slugs = (await kv.smembers('products:index')) || [];
    const products = [];
    for (const productSlug of slugs) {
      const product = await kv.get(`product:${productSlug}`);
      if (product) products.push(product);
    }
    products.sort((a, b) => a.name.localeCompare(b.name));
    res.status(200).json({ products });
    return;
  }

  if (!slug && req.method === 'POST') {
    const body = parseBody(req);
    const { product: clean, errors } = validateProductInput(body, { forPublish: body.status === 'published' });
    if (errors.length) {
      res.status(400).json({ error: errors[0], errors });
      return;
    }

    const base = slugify(`${clean.country}-${clean.name}`) || slugify(clean.name) || 'product';
    let newSlug = base;
    let suffix = 2;
    while (await kv.get(`product:${newSlug}`)) {
      newSlug = `${base}-${suffix}`;
      suffix += 1;
    }

    const now = new Date().toISOString();
    const product = { slug: newSlug, ...clean, createdAt: now, updatedAt: now };
    await kv.set(`product:${newSlug}`, product);
    await kv.sadd('products:index', newSlug);
    res.status(201).json({ product });
    return;
  }

  if (!slug) {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const existing = await kv.get(`product:${slug}`);
  if (req.method === 'GET') {
    if (!existing) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.status(200).json({ product: existing });
    return;
  }

  if (req.method === 'PUT') {
    if (!existing) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    const merged = { ...existing, ...parseBody(req) };
    const { product: clean, errors } = validateProductInput(merged, { forPublish: merged.status === 'published' });
    if (errors.length) {
      res.status(400).json({ error: errors[0], errors });
      return;
    }
    if (existing.status === 'published' && clean.status === 'draft') {
      const datasetSlugs = (await kv.smembers('datasets:index')) || [];
      for (const datasetSlug of datasetSlugs) {
        const dataset = await kv.get(`dataset:${datasetSlug}`);
        if (dataset?.productSlug === slug && dataset.status === 'published') {
          res.status(409).json({ error: 'Unpublish this product’s datasets before unpublishing the product.' });
          return;
        }
      }
      const articleSlugs = (await kv.smembers('articles:index')) || [];
      for (const articleSlug of articleSlugs) {
        const article = await kv.get(`article:${articleSlug}`);
        if (article?.productSlug === slug && article.status === 'published') {
          res.status(409).json({ error: 'Unpublish this product’s linked articles before unpublishing the product.' });
          return;
        }
      }
    }
    const product = { ...existing, ...clean, updatedAt: new Date().toISOString() };
    await kv.set(`product:${slug}`, product);
    const datasetSlugs = (await kv.smembers('datasets:index')) || [];
    for (const datasetSlug of datasetSlugs) {
      const dataset = await kv.get(`dataset:${datasetSlug}`);
      if (dataset?.productSlug === slug) {
        await kv.set(`dataset:${datasetSlug}`, {
          ...dataset,
          productName: product.name,
          country: product.country,
          hsCode: product.hsCode,
          hsDescription: product.hsDescription,
          updatedAt: product.updatedAt,
        });
      }
    }
    res.status(200).json({ product });
    return;
  }

  if (req.method === 'DELETE') {
    if (!existing) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    const datasetSlugs = (await kv.smembers('datasets:index')) || [];
    for (const datasetSlug of datasetSlugs) {
      const dataset = await kv.get(`dataset:${datasetSlug}`);
      if (dataset?.productSlug === slug) {
        res.status(409).json({ error: 'Delete or reassign this product’s datasets first.' });
        return;
      }
    }
    const articleSlugs = (await kv.smembers('articles:index')) || [];
    for (const articleSlug of articleSlugs) {
      const article = await kv.get(`article:${articleSlug}`);
      if (article?.productSlug === slug) {
        res.status(409).json({ error: 'Remove this product from its linked articles first.' });
        return;
      }
    }
    await kv.del(`product:${slug}`);
    await kv.srem('products:index', slug);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};

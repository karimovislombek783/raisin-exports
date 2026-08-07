const { kv } = require('../../_lib/kv');
const { requireAuth } = require('../../_lib/auth');
const { slugify } = require('../../_lib/slugify');
const { parseBody, validateProductInput } = require('../../_lib/catalog');

module.exports = async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    const slugs = (await kv.smembers('products:index')) || [];
    const products = [];
    for (const slug of slugs) {
      const product = await kv.get(`product:${slug}`);
      if (product) products.push(product);
    }
    products.sort((a, b) => a.name.localeCompare(b.name));
    res.status(200).json({ products });
    return;
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    const { product: clean, errors } = validateProductInput(body, { forPublish: body.status === 'published' });
    if (errors.length) {
      res.status(400).json({ error: errors[0], errors });
      return;
    }

    const base = slugify(`${clean.country}-${clean.name}`) || slugify(clean.name) || 'product';
    let slug = base;
    let suffix = 2;
    while (await kv.get(`product:${slug}`)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }

    const now = new Date().toISOString();
    const product = { slug, ...clean, createdAt: now, updatedAt: now };
    await kv.set(`product:${slug}`, product);
    await kv.sadd('products:index', slug);
    res.status(201).json({ product });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};

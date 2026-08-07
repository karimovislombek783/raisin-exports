const { kv } = require('../../_lib/kv');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const slugs = (await kv.smembers('products:index')) || [];
  const products = [];
  for (const slug of slugs) {
    const product = await kv.get(`product:${slug}`);
    if (product?.status === 'published') products.push(product);
  }
  products.sort((a, b) => a.name.localeCompare(b.name));
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
  res.status(200).json({ products });
};

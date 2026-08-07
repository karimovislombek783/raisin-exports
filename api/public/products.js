const { kv } = require('../_lib/kv');
const { datasetListItem } = require('../_lib/catalog');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { slug } = req.query || {};
  if (!slug) {
    const slugs = (await kv.smembers('products:index')) || [];
    const products = [];
    for (const productSlug of slugs) {
      const product = await kv.get(`product:${productSlug}`);
      if (product?.status === 'published') products.push(product);
    }
    products.sort((a, b) => a.name.localeCompare(b.name));
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    res.status(200).json({ products });
    return;
  }

  const product = await kv.get(`product:${slug}`);
  if (!product || product.status !== 'published') {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const datasets = [];
  const datasetSlugs = (await kv.smembers('datasets:index')) || [];
  for (const datasetSlug of datasetSlugs) {
    const dataset = await kv.get(`dataset:${datasetSlug}`);
    if (dataset?.status === 'published' && dataset.productSlug === slug) datasets.push(datasetListItem(dataset));
  }
  datasets.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const articles = [];
  const articleSlugs = (await kv.smembers('articles:index')) || [];
  for (const articleSlug of articleSlugs) {
    const article = await kv.get(`article:${articleSlug}`);
    if (article?.status === 'published' && article.productSlug === slug) {
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

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
  res.status(200).json({ product, datasets, articles });
};

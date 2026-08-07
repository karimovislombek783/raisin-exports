const { kv } = require('../../_lib/kv');
const { annualSnapshot, datasetListItem } = require('../../_lib/catalog');

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

  let dataset = null;
  let snapshot = null;
  let product = null;
  if (article.datasetSlug) {
    const linkedDataset = await kv.get(`dataset:${article.datasetSlug}`);
    if (linkedDataset?.status === 'published') {
      dataset = datasetListItem(linkedDataset);
      snapshot = annualSnapshot(linkedDataset, article.snapshotYear);
    }
  }
  if (article.productSlug) {
    const linkedProduct = await kv.get(`product:${article.productSlug}`);
    if (linkedProduct?.status === 'published') product = linkedProduct;
  }

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
  res.status(200).json({ article, dataset, snapshot, product });
};

const { kv } = require('../../_lib/kv');
const { datasetListItem } = require('../../_lib/catalog');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const slugs = (await kv.smembers('datasets:index')) || [];
  const datasets = [];
  for (const slug of slugs) {
    const dataset = await kv.get(`dataset:${slug}`);
    if (dataset?.status === 'published') datasets.push(datasetListItem(dataset));
  }
  datasets.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
  res.status(200).json({ datasets });
};

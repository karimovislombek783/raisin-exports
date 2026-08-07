const { kv } = require('../_lib/kv');
const { annualSnapshot, datasetListItem, datasetToCsv } = require('../_lib/catalog');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { slug, format } = req.query || {};
  if (!slug) {
    const slugs = (await kv.smembers('datasets:index')) || [];
    const datasets = [];
    for (const datasetSlug of slugs) {
      const dataset = await kv.get(`dataset:${datasetSlug}`);
      if (dataset?.status === 'published') datasets.push(datasetListItem(dataset));
    }
    datasets.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    res.status(200).json({ datasets });
    return;
  }

  const dataset = await kv.get(`dataset:${slug}`);
  if (!dataset || dataset.status !== 'published') {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${dataset.slug}.csv"`);
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    res.status(200).send(`\uFEFF${datasetToCsv(dataset)}`);
    return;
  }

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
  res.status(200).json({ dataset, snapshot: annualSnapshot(dataset) });
};

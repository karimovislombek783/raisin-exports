const { kv } = require('../../_lib/kv');
const { annualSnapshot, datasetToCsv } = require('../../_lib/catalog');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { slug, format } = req.query;
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

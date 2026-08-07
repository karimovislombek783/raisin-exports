const { kv } = require('../../_lib/kv');
const { requireAuth } = require('../../_lib/auth');
const { annualSnapshot } = require('../../_lib/catalog');

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;

  const { slug } = req.query;

  if (req.method === 'GET') {
    const article = await kv.get(`article:${slug}`);
    if (!article) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    res.status(200).json({ article });
    return;
  }

  if (req.method === 'PUT') {
    const existing = await kv.get(`article:${slug}`);
    if (!existing) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }

    const { title, dek, date, coverImageUrl, body: content, status, productSlug, datasetSlug, snapshotYear } = parseBody(req);

    if (status && !['draft', 'published', 'upcoming'].includes(status)) {
      res.status(400).json({ error: "status must be 'draft', 'published', or 'upcoming'" });
      return;
    }
    const cleanSnapshotYear = snapshotYear === undefined
      ? existing.snapshotYear
      : (snapshotYear === null || snapshotYear === '' ? null : Number(snapshotYear));
    if (cleanSnapshotYear !== null && cleanSnapshotYear !== undefined && (!Number.isInteger(cleanSnapshotYear) || cleanSnapshotYear < 1900 || cleanSnapshotYear > 2100)) {
      res.status(400).json({ error: 'Snapshot year must be a valid four-digit year' });
      return;
    }

    const nextProductSlug = productSlug !== undefined ? productSlug : (existing.productSlug || '');
    const nextDatasetSlug = datasetSlug !== undefined ? datasetSlug : (existing.datasetSlug || '');
    let linkedProductSlug = nextProductSlug;
    let linkedDataset = null;
    if (nextDatasetSlug) {
      linkedDataset = await kv.get(`dataset:${nextDatasetSlug}`);
      if (!linkedDataset) {
        res.status(400).json({ error: 'Selected dataset does not exist' });
        return;
      }
      if (linkedProductSlug && linkedDataset.productSlug !== linkedProductSlug) {
        res.status(400).json({ error: 'Selected dataset belongs to a different product' });
        return;
      }
      linkedProductSlug = linkedDataset.productSlug;
    }
    const linkedProduct = linkedProductSlug ? await kv.get(`product:${linkedProductSlug}`) : null;
    if (linkedProductSlug && !linkedProduct) {
      res.status(400).json({ error: 'Selected product does not exist' });
      return;
    }
    const nextStatus = status || existing.status;
    if (nextStatus === 'published' && linkedProductSlug && linkedProduct?.status !== 'published') {
      res.status(400).json({ error: 'Publish the linked product before publishing this article' });
      return;
    }
    if (nextStatus === 'published' && nextDatasetSlug && linkedDataset?.status !== 'published') {
      res.status(400).json({ error: 'Publish the linked dataset before publishing this article' });
      return;
    }
    if (nextStatus === 'published' && cleanSnapshotYear && linkedDataset?.dataType === 'annual_trade' && !annualSnapshot(linkedDataset, cleanSnapshotYear)) {
      res.status(400).json({ error: `The selected dataset has no row for ${cleanSnapshotYear}` });
      return;
    }

    const updated = {
      ...existing,
      ...(title !== undefined ? { title } : {}),
      ...(dek !== undefined ? { dek } : {}),
      ...(date !== undefined ? { date } : {}),
      ...(coverImageUrl !== undefined ? { coverImageUrl } : {}),
      ...(content !== undefined ? { body: content } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(productSlug !== undefined || datasetSlug !== undefined ? { productSlug: linkedProductSlug } : {}),
      ...(datasetSlug !== undefined ? { datasetSlug: nextDatasetSlug } : {}),
      ...(snapshotYear !== undefined ? { snapshotYear: cleanSnapshotYear } : {}),
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`article:${slug}`, updated);
    res.status(200).json({ article: updated });
    return;
  }

  if (req.method === 'DELETE') {
    await kv.del(`article:${slug}`);
    await kv.srem('articles:index', slug);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};

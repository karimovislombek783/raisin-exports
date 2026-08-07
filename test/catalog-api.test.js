const test = require('node:test');
const assert = require('node:assert/strict');

function createKv() {
  const values = new Map();
  const sets = new Map();
  return {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, structuredClone(value)); },
    async del(key) { values.delete(key); },
    async sadd(key, value) {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key).add(value);
    },
    async srem(key, value) { sets.get(key)?.delete(value); },
    async smembers(key) { return [...(sets.get(key) || [])]; },
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.payload = value; return this; },
    send(value) { this.payload = value; return this; },
  };
}

test('product, dataset, article, and generated snapshot work together', async () => {
  const kv = createKv();
  const kvPath = require.resolve('../api/_lib/kv');
  const authPath = require.resolve('../api/_lib/auth');
  require.cache[kvPath] = { id:kvPath, filename:kvPath, loaded:true, exports:{ kv } };
  require.cache[authPath] = { id:authPath, filename:authPath, loaded:true, exports:{ requireAuth:() => ({ sub:'test-admin' }) } };

  const createProduct = require('../api/admin/products');
  const createDataset = require('../api/admin/datasets');
  const createArticle = require('../api/admin/articles/index');
  const updateArticle = require('../api/admin/articles/[slug]');
  const publicArticle = require('../api/public/articles/[slug]');
  const publicDataset = require('../api/public/datasets');

  let res = response();
  await createProduct({ method:'POST', body:{ name:'Raisins', country:'Uzbekistan', hsCode:'080620', hsDescription:'Dried grapes', overview:'Processed grape exports.', status:'published' } }, res);
  assert.equal(res.statusCode, 201);
  const product = res.payload.product;

  res = response();
  await createDataset({ method:'POST', body:{
    title:'Uzbekistan Raisin Exports, 2024–2025', productSlug:product.slug, dataType:'annual_trade',
    description:'Annual export value and volume.', sourceName:'Verified trade source', sourceUrl:'https://example.com/data',
    dateChecked:'2026-08-07', status:'published',
    csvText:'year,export_value_usd,export_volume_kg\n2024,64800000,43800000\n2025,143800000,113087000',
  } }, res);
  assert.equal(res.statusCode, 201);
  const dataset = res.payload.dataset;
  assert.equal(dataset.rowCount, 2);

  res = response();
  await createArticle({ method:'POST', body:{ title:'Raisin Export Growth', dek:'An article.', date:'2026-08-08', body:'Analysis', productSlug:product.slug, datasetSlug:dataset.slug } }, res);
  assert.equal(res.statusCode, 201);
  const article = res.payload.article;

  res = response();
  await updateArticle({ method:'PUT', query:{ slug:article.slug }, body:{ status:'published' } }, res);
  assert.equal(res.statusCode, 200);

  res = response();
  await publicArticle({ method:'GET', query:{ slug:article.slug } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.snapshot.year, 2025);
  assert.equal(res.payload.snapshot.exportValueUsd, 143800000);
  assert.equal(res.payload.product.hsCode, '080620');

  res = response();
  await publicDataset({ method:'GET', query:{ slug:dataset.slug, format:'csv' } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Content-Disposition'], /\.csv/);
  assert.match(res.payload, /143800000/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCsv,
  normalizeDatasetRows,
  annualSnapshot,
  datasetToCsv,
  validateProductInput,
  validateDatasetInput,
} = require('../api/_lib/catalog');

test('parses quoted CSV cells and normalizes headers', () => {
  const parsed = parseCsv('Year,Destination Country,Note\n2025,"Russian Federation","A, B"');
  assert.deepEqual(parsed.headers, ['year', 'destination_country', 'note']);
  assert.equal(parsed.rows[0].note, 'A, B');
});

test('annual trade data calculates price and year-on-year growth', () => {
  const parsed = parseCsv('year,export_value_usd,export_volume_kg\n2024,64800000,43800000\n2025,143800000,113087000');
  const normalized = normalizeDatasetRows('annual_trade', parsed);
  assert.equal(normalized.rows[1].average_export_price_usd_per_kg, 1.2716);
  assert.equal(normalized.rows[1].yoy_export_value_change_pct, 121.91);
  const snapshot = annualSnapshot({ dataType: 'annual_trade', rows: normalized.rows });
  assert.equal(snapshot.year, 2025);
  assert.equal(snapshot.exportValueUsd, 143800000);
});

test('annual trade data rejects duplicate years', () => {
  const parsed = parseCsv('year,export_value_usd,export_volume_kg\n2025,10,5\n2025,12,6');
  assert.throws(() => normalizeDatasetRows('annual_trade', parsed), /appears more than once/);
});

test('dataset CSV export preserves commas and quotes', () => {
  const csv = datasetToCsv({
    columns: ['year', 'note'],
    rows: [{ year: 2025, note: 'Value, "verified"' }],
  });
  assert.equal(csv, 'year,note\n2025,"Value, ""verified"""');
});

test('published product requires a valid HS code and description', () => {
  const { errors } = validateProductInput({ name: 'Raisins', country: 'Uzbekistan', hsCode: '080620', status: 'published' }, { forPublish: true });
  assert.match(errors.join(' '), /description/);
});

test('published dataset requires source details', () => {
  const { errors } = validateDatasetInput({ title: 'Raisin exports', productSlug: 'uzbekistan-raisins', status: 'published' }, { forPublish: true });
  assert.ok(errors.length >= 3);
});

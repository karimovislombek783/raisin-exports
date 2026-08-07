const DATASET_TYPES = ['annual_trade', 'destinations', 'production', 'routes', 'other'];
const PRODUCT_STATUSES = ['draft', 'published'];
const DATASET_STATUSES = ['draft', 'published'];

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function text(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeHeader(value) {
  return text(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isHttpUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseCsv(csvText) {
  const source = String(csvText || '').replace(/^\uFEFF/, '');
  if (!source.trim()) throw new Error('CSV file is empty.');
  if (source.length > 1_000_000) throw new Error('CSV file is too large. The current limit is 1 MB.');

  const rawRows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      if (row.some((value) => String(value).trim() !== '')) rawRows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted value.');
  row.push(cell);
  if (row.some((value) => String(value).trim() !== '')) rawRows.push(row);

  if (rawRows.length < 2) throw new Error('CSV must contain a header row and at least one data row.');
  if (rawRows.length > 5001) throw new Error('CSV has too many rows. The current limit is 5,000 data rows.');

  const headers = rawRows[0].map(normalizeHeader);
  if (headers.some((header) => !header)) throw new Error('Every CSV column must have a name.');
  if (new Set(headers).size !== headers.length) throw new Error('CSV column names must be unique.');

  const rows = rawRows.slice(1).map((values, rowIndex) => {
    if (values.length > headers.length && values.slice(headers.length).some((value) => text(value))) {
      throw new Error(`Row ${rowIndex + 2} contains more values than the header row.`);
    }
    const item = {};
    headers.forEach((header, columnIndex) => {
      item[header] = text(values[columnIndex] ?? '', 5000);
    });
    return item;
  });

  return { headers, rows };
}

function numberValue(value, field, rowNumber, { integer = false, minimum = 0 } = {}) {
  const cleaned = String(value ?? '').replace(/[$,\s]/g, '');
  const parsed = Number(cleaned);
  if (!cleaned || !Number.isFinite(parsed) || parsed < minimum || (integer && !Number.isInteger(parsed))) {
    throw new Error(`Row ${rowNumber}: ${field} must be a valid${integer ? ' whole' : ''} number.`);
  }
  return parsed;
}

function requireColumns(headers, required) {
  const missing = required.filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`CSV is missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
}

function requiredText(value, field, rowNumber) {
  const cleaned = text(value, 5000);
  if (!cleaned) throw new Error(`Row ${rowNumber}: ${field} is required.`);
  return cleaned;
}

function normalizeDatasetRows(dataType, parsed) {
  const { headers, rows } = parsed;

  if (dataType === 'annual_trade') {
    requireColumns(headers, ['year', 'export_value_usd', 'export_volume_kg']);
    const normalized = rows.map((row, index) => ({
      ...row,
      year: numberValue(row.year, 'year', index + 2, { integer: true, minimum: 1900 }),
      export_value_usd: numberValue(row.export_value_usd, 'export_value_usd', index + 2),
      export_volume_kg: numberValue(row.export_volume_kg, 'export_volume_kg', index + 2),
    })).sort((a, b) => a.year - b.year);

    const seenYears = new Set();
    normalized.forEach((row) => {
      if (row.year > 2100) throw new Error(`Year ${row.year} is outside the supported range.`);
      if (seenYears.has(row.year)) throw new Error(`Year ${row.year} appears more than once.`);
      seenYears.add(row.year);
      row.average_export_price_usd_per_kg = row.export_volume_kg
        ? Number((row.export_value_usd / row.export_volume_kg).toFixed(4))
        : null;
    });

    normalized.forEach((row, index) => {
      const previous = normalized[index - 1];
      row.yoy_export_value_change_pct = previous && previous.export_value_usd
        ? Number((((row.export_value_usd - previous.export_value_usd) / previous.export_value_usd) * 100).toFixed(2))
        : null;
    });

    const derivedHeaders = [...headers];
    if (!derivedHeaders.includes('average_export_price_usd_per_kg')) derivedHeaders.push('average_export_price_usd_per_kg');
    if (!derivedHeaders.includes('yoy_export_value_change_pct')) derivedHeaders.push('yoy_export_value_change_pct');
    return { headers: derivedHeaders, rows: normalized };
  }

  if (dataType === 'destinations') {
    requireColumns(headers, ['year', 'destination_country', 'value_usd']);
    return {
      headers,
      rows: rows.map((row, index) => ({
        ...row,
        year: numberValue(row.year, 'year', index + 2, { integer: true, minimum: 1900 }),
        destination_country: requiredText(row.destination_country, 'destination_country', index + 2),
        value_usd: numberValue(row.value_usd, 'value_usd', index + 2),
        ...(row.volume_kg ? { volume_kg: numberValue(row.volume_kg, 'volume_kg', index + 2) } : {}),
      })),
    };
  }

  if (dataType === 'production') {
    requireColumns(headers, ['year', 'region', 'production_tonnes']);
    return {
      headers,
      rows: rows.map((row, index) => ({
        ...row,
        year: numberValue(row.year, 'year', index + 2, { integer: true, minimum: 1900 }),
        region: requiredText(row.region, 'region', index + 2),
        production_tonnes: numberValue(row.production_tonnes, 'production_tonnes', index + 2),
      })),
    };
  }

  if (dataType === 'routes') {
    requireColumns(headers, ['destination', 'origin', 'border_crossing', 'transport_mode', 'transit_days']);
    return {
      headers,
      rows: rows.map((row, index) => ({
        ...row,
        destination: requiredText(row.destination, 'destination', index + 2),
        origin: requiredText(row.origin, 'origin', index + 2),
        border_crossing: requiredText(row.border_crossing, 'border_crossing', index + 2),
        transport_mode: requiredText(row.transport_mode, 'transport_mode', index + 2),
        transit_days: numberValue(row.transit_days, 'transit_days', index + 2),
      })),
    };
  }

  if (headers.length < 2) throw new Error('A general dataset must have at least two columns.');
  return { headers, rows };
}

function datasetYears(rows) {
  const years = rows
    .map((row) => Number(row.year))
    .filter((year) => Number.isInteger(year) && year >= 1900 && year <= 2100);
  if (!years.length) return { start: null, end: null };
  return { start: Math.min(...years), end: Math.max(...years) };
}

function annualSnapshot(dataset, requestedYear) {
  if (!dataset || dataset.dataType !== 'annual_trade') return null;
  const rows = Array.isArray(dataset.rows) ? dataset.rows : [];
  if (!rows.length) return null;
  const targetYear = requestedYear ? Number(requestedYear) : Math.max(...rows.map((row) => Number(row.year)));
  const row = rows.find((item) => Number(item.year) === targetYear);
  if (!row) return null;
  return {
    year: Number(row.year),
    exportValueUsd: Number(row.export_value_usd),
    exportVolumeKg: Number(row.export_volume_kg),
    averagePriceUsdPerKg: row.average_export_price_usd_per_kg == null ? null : Number(row.average_export_price_usd_per_kg),
    yoyExportValueChangePct: row.yoy_export_value_change_pct == null ? null : Number(row.yoy_export_value_change_pct),
  };
}

function csvCell(value) {
  const stringValue = value == null ? '' : String(value);
  if (/[",\n\r]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
  return stringValue;
}

function datasetToCsv(dataset) {
  const headers = Array.isArray(dataset.columns) ? dataset.columns : [];
  const rows = Array.isArray(dataset.rows) ? dataset.rows : [];
  return [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n');
}

function validateProductInput(input, { forPublish = false } = {}) {
  const product = {
    name: text(input.name, 120),
    country: text(input.country, 100),
    hsCode: text(input.hsCode, 20),
    hsDescription: text(input.hsDescription, 240),
    overview: text(input.overview, 2000),
    status: PRODUCT_STATUSES.includes(input.status) ? input.status : 'draft',
  };
  const errors = [];
  if (!product.name) errors.push('Product name is required.');
  if (!product.country) errors.push('Exporting country is required.');
  if (!/^\d{4,10}$/.test(product.hsCode)) errors.push('HS code must contain 4 to 10 digits.');
  if (forPublish && !product.hsDescription) errors.push('Official HS description is required before publishing.');
  return { product, errors };
}

function validateDatasetInput(input, { forPublish = false } = {}) {
  const dataType = DATASET_TYPES.includes(input.dataType) ? input.dataType : 'other';
  const dataset = {
    title: text(input.title, 180),
    productSlug: text(input.productSlug, 100),
    dataType,
    description: text(input.description, 2000),
    sourceName: text(input.sourceName, 240),
    sourceUrl: text(input.sourceUrl, 1000),
    dateChecked: text(input.dateChecked, 20),
    status: DATASET_STATUSES.includes(input.status) ? input.status : 'draft',
  };
  const errors = [];
  if (!dataset.title) errors.push('Dataset title is required.');
  if (!dataset.productSlug) errors.push('A product must be selected.');
  if (!isHttpUrl(dataset.sourceUrl)) errors.push('Source URL must begin with http:// or https://.');
  if (forPublish) {
    if (!dataset.sourceName) errors.push('Source name is required before publishing.');
    if (!dataset.sourceUrl) errors.push('Source URL is required before publishing.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataset.dateChecked)) errors.push('Date checked is required before publishing.');
  }
  return { dataset, errors };
}

function datasetListItem(dataset) {
  return {
    slug: dataset.slug,
    title: dataset.title,
    productSlug: dataset.productSlug,
    productName: dataset.productName,
    country: dataset.country,
    hsCode: dataset.hsCode,
    dataType: dataset.dataType,
    description: dataset.description,
    sourceName: dataset.sourceName,
    sourceUrl: dataset.sourceUrl,
    dateChecked: dataset.dateChecked,
    status: dataset.status,
    columns: dataset.columns,
    rowCount: dataset.rowCount,
    coveredYears: dataset.coveredYears,
    createdAt: dataset.createdAt,
    updatedAt: dataset.updatedAt,
  };
}

module.exports = {
  DATASET_TYPES,
  parseBody,
  parseCsv,
  normalizeDatasetRows,
  datasetYears,
  annualSnapshot,
  datasetToCsv,
  validateProductInput,
  validateDatasetInput,
  datasetListItem,
};

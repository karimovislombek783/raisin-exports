# Dataset system guide

The website now treats products, datasets, and articles as connected but separate records.

## Publish the first dataset

1. Sign in at `/admin/`.
2. Open **Products**.
3. Select **New Product**.
4. Enter the product name, exporting country, HS code, official description, and overview.
5. Select **Save & Publish**.
6. Open **Datasets**.
7. Select **New Dataset**.
8. Choose the product and dataset type.
9. Enter the source name, direct source URL, and date checked.
10. Upload the CSV file.
11. Review the preview and select **Save & Publish**.

The published dataset will automatically appear on `/data/` and on the product profile.

## Add a snapshot to an article

1. Create or edit an article.
2. Choose the related product.
3. Choose an annual trade dataset.
4. Leave the snapshot year empty to use the latest available year, or enter a specific year covered by the dataset.
5. Publish the article.

The website calculates export price and year-on-year export-value change from the dataset. These figures are not entered again inside the article.

## CSV formats

### Annual trade

Required columns:

```csv
year,export_value_usd,export_volume_kg
```

### Destinations

Required columns:

```csv
year,destination_country,value_usd
```

Optional column: `volume_kg`

### Regional production

Required columns:

```csv
year,region,production_tonnes
```

### Trade routes

Required columns:

```csv
destination,origin,border_crossing,transport_mode,transit_days
```

### Other datasets

Use a header row and at least two columns. The public table will display the uploaded columns without forcing them into a trade-specific format.

## Publishing rules

- A product must be published before its dataset can be published.
- A linked dataset must be published before its article can be published.
- A product or dataset cannot be unpublished while a published record depends on it.
- Deleting a linked product or dataset is blocked to prevent broken pages.
- Replacing a CSV recalculates all derived annual-trade fields.

## Storage and deployment

The new records use the same storage and authentication configuration as the existing article system. No new environment variables are required.

Do not upload `node_modules`. Vercel installs dependencies during deployment.

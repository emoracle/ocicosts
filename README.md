# OCI Cost Overview (Node.js CLI)

Shows the largest costs in your OCI tenancy. Costs are aggregated per resource and then mapped to a readable name via OCI Resource Search, so OCIDs are not shown in normal output.

## Install

```bash
npm install
```

## Usage

```bash
node src/showcosts.js
```

Options:

```bash
node src/showcosts.js --days 30
node src/showcosts.js --start 2026-02-01 --end 2026-02-06
node src/showcosts.js --config ~/.oci/config
node src/showcosts.js --top 30
node src/showcosts.js --tag "Namespace.Key=Value"
node src/showcosts.js --csv
node src/showcosts.js --csv-file /tmp/costs.csv
node src/showcosts.js --cache-ttl-days 14
node src/showcosts.js --refresh-cache
```

## Notes

- The OCI Usage API does not support `displayName` as a `groupBy` dimension. We aggregate by `resourceId` and map to a readable name via Resource Search.
- Not every resource has a `displayName` or is discoverable via Resource Search. In that case you will see `(name not found)`. For Object Storage, the OCID is shown instead.
- Your user/policy must be allowed to use Resource Search and read the Usage API.
- Settings live in `config/settings.json`. CLI arguments override these settings.
- Output shows the period (including the Top N label) and the columns: Cost, DisplayName, Service.
- A total row is shown and is calculated over all services (not just the Top N list).
- A separate block shows totals per service.
- If `--tag` is provided, only services with that tag are shown; tag lookup is skipped when `--tag` is empty.
- The displayName cache is a simple JSON file with a TTL (default 7 days).

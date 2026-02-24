# OCI Cost Overview (Node.js CLI)

Shows the largest costs in your OCI tenancy. Costs are aggregated per resource and then mapped to a readable name via OCI Resource Search, so OCIDs are not shown in normal output.

## Install

```bash
npm install
```

## OCI CLI Configuration

This tool uses the standard OCI config file used by the OCI CLI. Make sure your environment has a valid `~/.oci/config` and API key:

Example config (minimum):
```
[DEFAULT]
user=ocid1.user.oc1..xxxx
fingerprint=aa:bb:cc:dd:ee:ff:...
tenancy=ocid1.tenancy.oc1..xxxx
region=eu-amsterdam-1
key_file=/home/you/.oci/oci_api_key.pem
```

Notes:
- The default profile is `DEFAULT`. If you use a different config path, pass `--config /path/to/config`.
- The private key file must be readable by your user.
- You can also point the CLI to a different config with the `OCI_CONFIG_FILE` environment variable (this tool still reads from the config file path).

Quick setup with OCI CLI:
```bash
oci setup config
```

## Required IAM Policies

Your user/group needs permission to read usage and search resources. Typical policy statements (tenancy‑level):

```
Allow group <group-name> to read usage-reports in tenancy
Allow group <group-name> to read usage in tenancy
Allow group <group-name> to read resource-search in tenancy
Allow group <group-name> to read buckets in tenancy
```

## Usage

```bash
./showcosts.sh
```

### Arguments

- `--cache-ttl-days <n>`: Cache TTL in days for display name/tag lookups.
- `--config <path>`: OCI config file path (instead of `~/.oci/config`).
- `--csv`: Print output as CSV to stdout.
- `--csv-file <path>`: Write CSV output to a file.
- `--days <n>`: Relative lookback window in days (used when no `--start/--end` are provided).
- `--end <ISO>`: End datetime (`RFC3339` or `YYYY-MM-DD`).
- `--refresh-cache`: Clear cache before loading data.
- `--service "<name>"`: Filter rows by service name (case-insensitive).
  - Special value `oke`: include only `Compute` and `Block Storage` rows where the resource name starts with `oke-`.
- `--showtags`: Add `Tags` column to the detail output.
- `--start <ISO>`: Start datetime (`RFC3339` or `YYYY-MM-DD`).
- `--tag "<selector>"`: Filter by tags. Supports:
  - Exact tag: `"Namespace.Key=Value"`
  - Multiple tags (AND): `"A=B,C=D"`
  - Untagged resources: `notags` or `no-tags`
- `--top <n>`: Limit detail rows to top N by cost (disabled when using `--tag` or `--service`).

Examples:

```bash
./showcosts.sh --cache-ttl-days 14
./showcosts.sh --config ~/.oci/config
./showcosts.sh --csv
./showcosts.sh --csv-file /tmp/costs.csv
./showcosts.sh --days 30
./showcosts.sh --refresh-cache
./showcosts.sh --service "Load Balancer"
./showcosts.sh --service oke
./showcosts.sh --showtags
./showcosts.sh --showtags --service "Object Storage"
./showcosts.sh --showtags --tag "A=B"
./showcosts.sh --start 2026-02-01 --end 2026-02-06
./showcosts.sh --tag "Namespace.Key=Value"
./showcosts.sh --tag "A=B,C=D"
./showcosts.sh --tag notags
./showcosts.sh --top 30
```

Service examples for `--service`: `Compute`, `Load Balancer`, `Object Storage`, `Block Storage`, `Container Registry`, `Database`, `Networking`

## Notes

### Data Sources

- The OCI Usage API does not support `displayName` as a `groupBy` dimension.
- The tool aggregates by `resourceId` and resolves readable names via Resource Search.
- If a resource cannot be found, the row is marked as `(deleted)` and name fallbacks apply.

### Filters and Selection

- `--tag` filters detail rows by tag values.
- `--service` filters detail rows by service name (case-insensitive substring match).
- `--service oke` applies a dedicated filter: only `Compute` and `Block Storage` resources with names starting with `oke-`.
- `--tag notags` or `--tag no-tags` selects only untagged resources.
- When `--tag` or `--service` is used, Top N limiting is disabled for detail rows.

### Output Semantics

- Detail output always includes: `Cost`, `DisplayName`, `Service`.
- `--showtags` adds a `Tags` column to detail output.
- A total row is always shown for all services (not just Top N).
- When `--tag` or `--service` is used, an extra filtered total row is shown with percentage vs all-services total.
- A separate block shows totals per service, excluding zero totals.

### Date Handling

- Date-only input (`YYYY-MM-DD`) is supported for `--start` and `--end`.
- `--start` date-only is inclusive at `00:00:00Z`.
- `--end` date-only is exclusive at next UTC midnight.
- If only `--start` is provided, `--end` defaults to today (for `DAILY`: next UTC midnight).
- If only `--end` is provided, `--start` defaults to `January 1` of `--end` year (UTC).

### Currency and Caching

- Missing currency values are treated as `EUR`.
- If a non-`EUR` currency is detected, the tool warns and continues.
- Display name/tag cache is stored as JSON with TTL (`--cache-ttl-days`).

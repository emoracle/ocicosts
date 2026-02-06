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
node src/showcosts.js --tag "A=B,C=D"
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
- A separate block shows totals per service (also over all services).
- If `--tag` is provided, only services with that tag are shown in the main list. Tag lookup is skipped when `--tag` is empty. Multiple tags are supported via comma separation.
- The tool expects EUR only; if a non‑EUR currency is detected it will error out.
- The displayName cache is a simple JSON file with a TTL (default 7 days).

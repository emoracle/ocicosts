"use strict";

const fs = require("fs");
const path = require("path");

const SERVICE_CHOICES = [
  "Compute",
  "Load Balancer",
  "Object Storage",
  "Block Storage",
  "Container Registry",
  "Database",
  "Networking",
];

function loadSettings(settingsPath) {
  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function parseArgs(argv, settingsPath) {
  const defaults = {
    days: 30,
    top: 30,
    granularity: "DAILY",
    configFile: undefined,
    compartmentDepth: 6,
    start: undefined,
    end: undefined,
    csv: false,
    csvFile: undefined,
    cachePath: ".cache/displayname.json",
    cacheTtlDays: 7,
    refreshCache: false,
    tag: "",
    service: "",
    showTags: false,
  };

  const settings = settingsPath ? loadSettings(settingsPath) : {};
  const args = { ...defaults, ...settings };

  const readValue = (currentArg, indexRef) => {
    const value = indexRef.i + 1 < argv.length ? argv[indexRef.i + 1] : undefined;
    if (value === undefined || (typeof value === "string" && value.startsWith("--"))) {
      throw new Error(`Missing value for argument: ${currentArg}`);
    }
    indexRef.i += 1;
    return value;
  };

  for (const indexRef = { i: 0 }; indexRef.i < argv.length; indexRef.i += 1) {
    const a = argv[indexRef.i];
    if (a === "--days") args.days = Number(readValue(a, indexRef));
    else if (a === "--top") args.top = Number(readValue(a, indexRef));
    else if (a === "--granularity") args.granularity = readValue(a, indexRef);
    else if (a === "--config") args.configFile = readValue(a, indexRef);
    else if (a === "--compartment-depth") args.compartmentDepth = Number(readValue(a, indexRef));
    else if (a === "--start") args.start = readValue(a, indexRef);
    else if (a === "--end") args.end = readValue(a, indexRef);
    else if (a === "--csv") args.csv = true;
    else if (a === "--csv-file") args.csvFile = readValue(a, indexRef);
    else if (a === "--cache-ttl-days") args.cacheTtlDays = Number(readValue(a, indexRef));
    else if (a === "--refresh-cache") args.refreshCache = true;
    else if (a === "--tag") args.tag = readValue(a, indexRef) || "";
    else if (a === "--service") args.service = readValue(a, indexRef) || "";
    else if (a === "--showtags") args.showTags = true;
    else if (a === "--help" || a === "-h") {
      return { args, help: true };
    } else {
      throw new Error(`Unsupported argument: ${a}`);
    }
  }

  const resolved = { ...args };
  if (resolved.csvFile && typeof resolved.csvFile === "string") {
    resolved.csvFile = path.resolve(process.cwd(), resolved.csvFile);
  }
  if (resolved.cachePath && typeof resolved.cachePath === "string") {
    resolved.cachePath = path.resolve(process.cwd(), resolved.cachePath);
  }
  if (resolved.configFile && typeof resolved.configFile === "string") {
    resolved.configFile = path.resolve(process.cwd(), resolved.configFile);
  }
  return { args: resolved, help: false };
}

function printHelp() {
  console.log(`
Usage: node showcosts.js [opts]

Options:
  --days <n>              Number of days back (default 30)
  --start <ISO>           Start time (RFC3339 or YYYY-MM-DD, Z optional)
  --end <ISO>             End time (RFC3339 or YYYY-MM-DD, Z optional)
  --top <n>               Show top N (default 30)
  --granularity <DAILY|MONTHLY|HOURLY>
  --config <path>         OCI config file (default ~/.oci/config)
  --compartment-depth <n> Compartment aggregation depth (1-6, default 6)
  --csv                   Output CSV to stdout
  --csv-file <path>       Write CSV to file
  --cache-ttl-days <n>    Cache TTL in days (default 7)
  --refresh-cache         Clear and rebuild cache
  --tag <k=v>             Filter services by tag (skip tag lookup if empty)
  --service <name>        Filter by service name (case-insensitive)
  --showtags              Show tags column in the top details section

Service choices:
  ${SERVICE_CHOICES.join(", ")}
  Special: oke (matches Compute/Block Storage resources with names starting with "oke-")
`);
}

module.exports = { parseArgs, printHelp, loadSettings, SERVICE_CHOICES };

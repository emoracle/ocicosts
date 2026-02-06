"use strict";

const fs = require("fs");
const path = require("path");

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
  };

  const settings = settingsPath ? loadSettings(settingsPath) : {};
  const args = { ...defaults, ...settings };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => (i + 1 < argv.length ? argv[++i] : undefined);
    if (a === "--days") args.days = Number(next());
    else if (a === "--top") args.top = Number(next());
    else if (a === "--granularity") args.granularity = next();
    else if (a === "--config") args.configFile = next();
    else if (a === "--compartment-depth") args.compartmentDepth = Number(next());
    else if (a === "--start") args.start = next();
    else if (a === "--end") args.end = next();
    else if (a === "--csv") args.csv = true;
    else if (a === "--csv-file") args.csvFile = next();
    else if (a === "--cache-ttl-days") args.cacheTtlDays = Number(next());
    else if (a === "--refresh-cache") args.refreshCache = true;
    else if (a === "--help" || a === "-h") {
      return { args, help: true };
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
Usage: node index.js [opts]

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
`);
}

module.exports = { parseArgs, printHelp, loadSettings };

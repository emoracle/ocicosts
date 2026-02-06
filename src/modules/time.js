"use strict";

function startOfUtcDay(d) {
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

function computeRange(args) {
  if (args.start || args.end) {
    const start = args.start ? parseInputDate(args.start, false) : undefined;
    const end = args.end ? parseInputDate(args.end, true) : undefined;
    if (!start || isNaN(start.getTime())) {
      throw new Error("Invalid --start. Use RFC3339 or YYYY-MM-DD");
    }
    if (!end || isNaN(end.getTime())) {
      throw new Error("Invalid --end. Use RFC3339 or YYYY-MM-DD");
    }
    return { start, end };
  }

  const now = new Date();
  if (args.granularity === "DAILY") {
    const end = new Date(startOfUtcDay(now).getTime() + 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - args.days * 24 * 60 * 60 * 1000);
    return { start, end };
  }

  const end = now;
  const start = new Date(end.getTime() - args.days * 24 * 60 * 60 * 1000);
  return { start, end };
}

function parseInputDate(value, isEnd) {
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const time = isEnd ? "23:59:59.999" : "00:00:00.000";
    return new Date(`${s}T${time}Z`);
  }
  return new Date(ensureUtc(s));
}

function ensureUtc(value) {
  if (!value) return value;
  const s = String(value).trim();
  if (/[zZ]$/.test(s)) return s;
  if (/[+-]\d\d:\d\d$/.test(s)) return s;
  return `${s}Z`;
}

module.exports = { computeRange };

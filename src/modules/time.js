"use strict";

function startOfUtcDay(d) {
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

function computeRange(args) {
  if (args.start || args.end) {
    const end = args.end ? parseInputDate(args.end, true) : defaultEnd(args);
    const start = args.start ? parseInputDate(args.start, false) : defaultStartFromEnd(end);
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

function defaultEnd(args) {
  const now = new Date();
  if (args.granularity === "DAILY") {
    return new Date(startOfUtcDay(now).getTime() + 24 * 60 * 60 * 1000);
  }
  return now;
}

function defaultStartFromEnd(end) {
  const d = new Date(end);
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

function parseInputDate(value, isEnd) {
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const base = new Date(`${s}T00:00:00.000Z`);
    if (isEnd) {
      return new Date(base.getTime() + 24 * 60 * 60 * 1000);
    }
    return base;
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

"use strict";

function startOfUtcDay(d) {
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

function computeRange(args) {
  if (args.start || args.end) {
    const end = args.end ? parseInputDate(args.end, true) : defaultEnd(args);
    if (!isValidDate(end)) {
      throw new Error("Invalid --end. Use RFC3339 or YYYY-MM-DD");
    }

    const start = args.start ? parseInputDate(args.start, false) : defaultStartFromEnd(end);
    if (!isValidDate(start)) {
      throw new Error("Invalid --start. Use RFC3339 or YYYY-MM-DD");
    }
    if (start.getTime() >= end.getTime()) {
      throw new Error("Invalid date range: --start must be before --end");
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
  if (!hasValidCalendarDate(s)) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const base = new Date(`${s}T00:00:00.000Z`);
    if (isEnd) {
      return new Date(base.getTime() + 24 * 60 * 60 * 1000);
    }
    return base;
  }
  return new Date(ensureUtc(s));
}

function hasValidCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  if (!match) return true;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function ensureUtc(value) {
  if (!value) return value;
  const s = String(value).trim();
  if (/[zZ]$/.test(s)) return s;
  if (/[+-]\d\d:\d\d$/.test(s)) return s;
  return `${s}Z`;
}

module.exports = { computeRange };

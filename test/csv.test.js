"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { csvEscape, writeCsv } = require("../src/modules/csv");

test("neutralizes spreadsheet formula prefixes, including whitespace bypasses", () => {
  assert.equal(csvEscape("=2+2"), "'=2+2");
  assert.equal(csvEscape(" +SUM(A1:A2)"), "' +SUM(A1:A2)");
  assert.equal(csvEscape("\t@SUM(A1:A2)"), "'\t@SUM(A1:A2)");
  assert.equal(csvEscape("-1+1"), "'-1+1");
});

test("preserves ordinary values and standard CSV escaping", () => {
  assert.equal(csvEscape("oke-node-1"), "oke-node-1");
  assert.equal(csvEscape("alpha,beta"), '"alpha,beta"');
  assert.equal(csvEscape('name "quoted"'), '"name ""quoted"""');
  assert.equal(csvEscape("line\r\nbreak"), '"line\r\nbreak"');
});

test("neutralizes OCI-derived values through the CSV writer", () => {
  let output = "";
  const stream = { write: (chunk) => { output += chunk; } };

  writeCsv(
    [
      {
        kosten: "€ 1,00",
        displayName: '=HYPERLINK("https://example.invalid")',
        service: "+cmd",
        tags: "@SUM(A1:A2)",
      },
    ],
    stream
  );

  assert.match(output, /"'=HYPERLINK\(""https:\/\/example\.invalid""\)"/);
  assert.match(output, /'\+cmd/);
  assert.match(output, /'@SUM\(A1:A2\)/);
  assert.doesNotMatch(output, /(?:^|,)=[^,\n]*/m);
});

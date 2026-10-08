import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRange, parseContentRange, RangeParseError } from "../src/index.js";

function assertThrowsRange(fn) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof RangeParseError, `expected RangeParseError, got ${err && err.constructor && err.constructor.name}`);
    return true;
  });
}

test("parseRange parses a single byte range", () => {
  assert.deepEqual(parseRange("bytes=0-499"), [[0, 499]]);
});

test("parseRange parses an open-ended range", () => {
  assert.deepEqual(parseRange("bytes=500-"), [[500, null]]);
});

test("parseRange parses a suffix range", () => {
  assert.deepEqual(parseRange("bytes=-500"), [[null, 500]]);
});

test("parseRange parses a single byte", () => {
  assert.deepEqual(parseRange("bytes=0-0"), [[0, 0]]);
});

test("parseRange parses multipart ranges", () => {
  assert.deepEqual(parseRange("bytes=0-499,1000-1999, -200"), [
    [0, 499],
    [1000, 1999],
    [null, 200],
  ]);
});

test("parseRange tolerates surrounding whitespace", () => {
  assert.deepEqual(parseRange("  bytes=0-499  "), [[0, 499]]);
});

test("parseRange rejects empty header", () => {
  assertThrowsRange(() => parseRange(""));
});

test("parseRange rejects missing bytes prefix", () => {
  assertThrowsRange(() => parseRange("0-499"));
});

test("parseRange rejects bare hyphen", () => {
  assertThrowsRange(() => parseRange("bytes=-"));
});

test("parseRange rejects empty range spec in multipart", () => {
  assertThrowsRange(() => parseRange("bytes=0-499,,1000-1999"));
});

test("parseRange rejects non-numeric range", () => {
  assertThrowsRange(() => parseRange("bytes=abc-499"));
});

test("parseContentRange parses first-last/total", () => {
  assert.deepEqual(
    parseContentRange("bytes 0-499/1000"),
    { range: [0, 499], total: 1000, unit: "bytes" }
  );
});

test("parseContentRange parses unknown total", () => {
  assert.deepEqual(
    parseContentRange("bytes 0-499/*"),
    { range: [0, 499], total: null, unit: "bytes" }
  );
});

test("parseContentRange parses unsatisfied range with known total", () => {
  assert.deepEqual(
    parseContentRange("bytes */1000"),
    { range: [null, null], total: 1000, unit: "bytes" }
  );
});

test("parseContentRange rejects suffix syntax", () => {
  assertThrowsRange(() => parseContentRange("bytes -500/1000"));
});

test("parseContentRange rejects open-ended range", () => {
  assertThrowsRange(() => parseContentRange("bytes 500-/*"));
});

test("parseContentRange rejects missing slash", () => {
  assertThrowsRange(() => parseContentRange("bytes 0-499"));
});

test("parseContentRange rejects empty spec", () => {
  assertThrowsRange(() => parseContentRange("bytes /1000"));
});

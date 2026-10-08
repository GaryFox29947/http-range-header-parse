/**
 * Core parsing logic for HTTP Range headers.
 *
 * A range is represented as a 2-tuple `[start, end]` where both values are
 * inclusive byte offsets within the resource. `null` is used for open-ended
 * bounds: a suffix range like `bytes=-500` is `[null, 500]`, and an open
 * range like `bytes=10-` is `[10, null]`.
 *
 * Design decisions:
 * - We return plain tuples instead of a class instance so consumers can
 *   destructure and compare with `===` on the elements. The cost is that
 *   callers must remember the nullability; the README documents this.
 * - All ranges are normalised to inclusive bounds, matching the wire format.
 *   We do not convert to half-open intervals because that would silently
 *   change the meaning of suffix ranges, where there is no start to shift.
 * - Whitespace inside the range set is permitted per RFC 7233's OWS rule,
 *   but we are stricter than the RFC on some points (see README). This keeps
 *   the parser predictable.
 */

/**
 * @typedef {[number | null, number | null]} RangeTuple
 */

/**
 * Error thrown when a header cannot be parsed.
 *
 * We use a dedicated subclass so callers can distinguish parse failures from
 * other errors without inspecting message strings.
 */
export class RangeParseError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "RangeParseError";
  }
}

/**
 * Per RFC 7233, a byte range spec consists of 1*DIGIT on at least one side of
 * the hyphen. We enforce the same rule for content-range and reject specs
 * where both sides are empty (i.e. a bare hyphen), since that carries no
 * information and is almost always a typo.
 */
const BYTE_RANGE_RE = /^(\d*)-(\d*)$/;

/**
 * Parse a single `first-last` / `first-` / `-last` spec into a tuple.
 *
 * @param {string} spec - e.g. "0-499", "500-", "-500"
 * @returns {RangeTuple}
 * @throws {RangeParseError}
 */
function parseByteRange(spec) {
  const match = BYTE_RANGE_RE.exec(spec);
  if (!match) {
    throw new RangeParseError(`Invalid byte range spec: "${spec}"`);
  }
  const first = match[1];
  const last = match[2];
  if (first === "" && last === "") {
    throw new RangeParseError(`Empty byte range spec: "${spec}"`);
  }
  const start = first === "" ? null : Number(first);
  const end = last === "" ? null : Number(last);
  return [start, end];
}

/**
 * Parse a `Range: bytes=...` header value.
 *
 * Accepts single ranges, multipart ranges (comma-separated), and suffix
 * ranges. Returns an array of tuples; an array (rather than a single tuple)
 * is returned even for single ranges so that multipart callers do not need
 * a special code path.
 *
 * @param {string} header
 * @returns {RangeTuple[]}
 * @throws {RangeParseError}
 */
export function parseRange(header) {
  if (header === null || header === undefined) {
    throw new RangeParseError("Range header is null or undefined");
  }
  const str = String(header).trim();
  if (str === "") {
    throw new RangeParseError("Empty Range header");
  }
  // The "bytes=" prefix is mandatory per RFC 7233. We do not accept other
  // range units because there is no other registered unit in real use, and
  // silently accepting arbitrary units would hide typos like "byte=".
  const prefix = "bytes=";
  if (!str.startsWith(prefix)) {
    throw new RangeParseError('Range header must start with "bytes="');
  }
  const body = str.slice(prefix.length);
  if (body === "") {
    throw new RangeParseError("Range header has no range specs");
  }
  const parts = body.split(",");
  /** @type {RangeTuple[]} */
  const result = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === "") {
      throw new RangeParseError("Empty range spec in multipart Range header");
    }
    result.push(parseByteRange(trimmed));
  }
  return result;
}

/**
 * Parse a `Content-Range: bytes ...` header value.
 *
 * Returns an object with the interval (as a tuple), the total resource size
 * (number, or `null` when the header contains `*`), and the raw unit string.
 * The interval is `[start, end]` and is never open-ended for content-range,
 * because the grammar requires both first and last to be present unless the
 * total is unknown — in which case the spec is `-` only and the interval is
 * `[null, null]`.
 *
 * @param {string} header
 * @returns {{ range: RangeTuple, total: number | null, unit: string }}
 * @throws {RangeParseError}
 */
export function parseContentRange(header) {
  if (header === null || header === undefined) {
    throw new RangeParseError("Content-Range header is null or undefined");
  }
  const str = String(header).trim();
  if (str === "") {
    throw new RangeParseError("Empty Content-Range header");
  }
  // Split on the first space to separate the unit from the range spec.
  const spaceIdx = str.indexOf(" ");
  if (spaceIdx === -1) {
    throw new RangeParseError('Content-Range header missing space after unit');
  }
  const unit = str.slice(0, spaceIdx);
  const rest = str.slice(spaceIdx + 1).trim();
  if (rest === "") {
    throw new RangeParseError("Content-Range header has no range spec");
  }
  // Three legal forms: "first-last/total", "first-last/*", "*/total".
  // The spec "/" is also syntactically legal but carries no data; reject it.
  const slashIdx = rest.indexOf("/");
  if (slashIdx === -1) {
    throw new RangeParseError('Content-Range header missing "/" separator');
  }
  const rangeSpec = rest.slice(0, slashIdx);
  const totalSpec = rest.slice(slashIdx + 1);
  if (rangeSpec === "" || totalSpec === "") {
    throw new RangeParseError('Content-Range header has empty spec or total');
  }
  let range;
  if (rangeSpec === "*") {
    // "*/total" — we do not know which bytes were returned.
    range = [null, null];
  } else {
    range = parseByteRange(rangeSpec);
    // Content-Range never uses suffix syntax; both ends must be present when
    // the spec is not "*".
    if (range[0] === null || range[1] === null) {
      throw new RangeParseError(
        `Content-Range spec must be "first-last", got "${rangeSpec}"`
      );
    }
  }
  let total;
  if (totalSpec === "*") {
    total = null;
  } else {
    if (!/^\d+$/.test(totalSpec)) {
      throw new RangeParseError(`Invalid total in Content-Range: "${totalSpec}"`);
    }
    total = Number(totalSpec);
  }
  return { range, total, unit };
}

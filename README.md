# http-range-parse

Parse HTTP `Range` and `Content-Range` headers into structured interval tuples. Zero dependencies, ESM only.

## Usage

```js
import { parseRange, parseContentRange } from "./src/index.js";

// Range header (single or multipart, including suffix ranges)
const ranges = parseRange("bytes=0-499,1000-,-200");
// [[0, 499], [1000, null], [null, 200]]

// Content-Range header
const cr = parseContentRange("bytes 0-499/1000");
// { range: [0, 499], total: 1000, unit: "bytes" }

const unknown = parseContentRange("bytes 0-499/*");
// { range: [0, 499], total: null, unit: "bytes" }
```

Exports:
- `parseRange(header)` -> `Array<[number | null, number | null]>`
- `parseContentRange(header)` -> `{ range: [number | null, number | null], total: number | null, unit: string }`
- `RangeParseError` (thrown on any parse failure)

## Why

Range headers look trivial but have three syntactic forms (first-last, open-ended, suffix) and the multipart comma-separated variant. This library turns them into plain tuples so servers and clients can branch on numbers, not strings. The trade-off: tuples use `null` for open bounds, so callers must handle nullability rather than getting a pretend zero.

Content-Range has its own quirks: the total may be unknown (`*`), and the range spec itself may be `*` when the request was unsatisfiable. We surface those as `null` rather than inventing a sentinel number.

## Edge cases

- Bounds are inclusive on both ends, matching the wire format. A `bytes=0-0` range is one byte.
- `parseRange` always returns an array, even for a single range, so multipart handling needs no special case.
- `parseContentRange` rejects suffix syntax (`-500`) and open-ended ranges (`500-`) because Content-Range's grammar requires concrete `first-last` values. Only the bare `*` form is accepted as an unknown range.
- We only accept the `bytes` range unit. Other units are rejected rather than guessed at.
- `RangeParseError` is a real subclass of `Error`; catch it specifically to distinguish parse failures from other runtime errors.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.


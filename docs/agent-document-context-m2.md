# Agent document-context M2 metadata contract

The read-only `document-context` capability now reports three bounded status
signals in addition to its existing fields:

- `metadataStatus`: `complete`, `partial`, or `unavailable`.
- `pathSource`: `tab`, `kernel`, or `none`.
- `outlineStatus`: `available`, `empty`, or `unavailable`.

`metadataStatus` is derived after ID/title/notebook normalization. A complete
record has all three core values; a partial record has at least one; an empty
record is unavailable. Caller-provided status text is never trusted.

`pathSource` explains where a path came from. Opened tabs use `tab`; a future
verified kernel path may use `kernel`; missing paths use `none`. The closed
document SQL fallback intentionally keeps its existing bounded query and does
not claim a path it did not receive.

`outlineStatus` distinguishes a successful empty outline from a failed request
while preserving the legacy `outlineAvailable` boolean for compatibility.
Unknown values are discarded, all fields are required schema enums, and the
host continues to resolve notebook names from its existing in-memory cache
without adding a network request to an Agent call.

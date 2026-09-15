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

`metadataMissing` lists the missing core fields (`id`, `title`, or `notebookId`)
in fixed order. `pathReason` is `available` when a normalized path exists and
`not-provided` otherwise. These explainability fields are derived from the
sanitized result, so callers cannot override them with arbitrary text.

`notebookNameSource` explains the notebook label: `cache` means it came from
SiYuan's existing notebook list cache, `tab` means an older host exposed a
bounded notebook alias on the tab, and `none` means no name was available.
The source is diagnostic-only and never triggers a notebook network request.

Callers may set `includeOutline: false` when only metadata is needed. The host
then skips the outline endpoint and returns an empty `headings` list with
`outlineStatus: "not-requested"`; this is distinct from
`outlineStatus: "unavailable"`, which indicates a failed outline request.
Unknown values are discarded, all fields are required schema enums, and the
host continues to resolve notebook names from its existing in-memory cache
without adding a network request to an Agent call.

For older hosts that expose notebook labels directly on a tab, the host uses
the cache first and then accepts the bounded `notebookName`, `notebook`, or
`boxName` aliases. Status derivation is implemented as pure helpers so the
desktop, sidebar, and mobile contracts can be regression-tested without a
running kernel.

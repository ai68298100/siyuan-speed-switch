# D-331: document-context provenance and outline availability

Date: 2026-09-15

The read-only `document-context` capability now returns a bounded `source` value:

- `active`: the requested root is the active tab;
- `opened`: the root is open but not active;
- `kernel`: metadata came from the bounded SQL fallback for a closed document.

`outlineAvailable` is required in the output. Metadata failures remain terminal and return the stable `document context unavailable` error. Outline failures are isolated: the metadata context is still returned with an empty bounded heading list and `outlineAvailable: false`. No document body, exception text, or write effect is exposed.

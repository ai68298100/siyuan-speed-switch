# Agent diagnostics to UI mapping

The UI may map adapter results to three safe states: `empty`, `retryable`, and
`unavailable`. Only the adapter reason codes `timeout`, `failed`, `aborted`,
`backoff`, and `unsupported` are exposed to that mapping. Raw exception text,
provider payloads, prompts, tokens, and permission details must never be shown
or persisted. Retry actions must call the existing force-refresh boundary and
remain disabled while the module is hidden or unsupported on the current device.

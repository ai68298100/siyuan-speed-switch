# ADR 0010: Quick Action Provider Registry

## Decision

Third-party quick entries use a runtime provider registry. Persisted action
records contain only serializable provider and action identifiers; callbacks are
held in memory and removed when a provider unregisters.

Providers declare supported surfaces (`desktop`, `sidebar`, `mobile`). Unknown
surfaces are discarded during normalization. An invocation after unload returns
`{ok:false, reason:"unavailable"}` and never throws into the switcher UI.
Legacy providers may use `supportedSurfaces` or `supportedDevices`; both are
accepted as aliases and normalized to the same serializable `declaredTargets`
metadata exposed to candidate pickers.

## Consequences

The settings model can survive plugin reloads and sync safely. A provider must
re-register its callback after reload, and mobile support must be explicitly
declared rather than inferred from a desktop command.

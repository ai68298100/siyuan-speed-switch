# ADR 0011: Quick Action Release Compatibility Matrix

The release contract keeps provider registration compatible across plugin
versions. `targets`, `supportedSurfaces`, and `supportedDevices` are accepted
as aliases and normalize to the same desktop/sidebar/mobile capability list.

Candidate records are JSON-safe and never carry executable callbacks. Provider
callbacks stay in the runtime registry; unregistering removes both candidates
and handlers, so a later registration starts with a clean lifecycle.

Unknown surfaces and unavailable icons are filtered or replaced by safe core
fallbacks. The registry and persisted quick-action list remain bounded to avoid
untrusted plugins consuming unbounded memory or UI space.

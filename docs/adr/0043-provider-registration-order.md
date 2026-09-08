# ADR 0043: Provider Registration Order

Provider metadata and callbacks may arrive in either order. Candidate
registration is visible immediately but remains unavailable until a handler is
installed; installing the handler later activates the same candidate without
duplicates. Unregistering an unknown provider is a safe no-op.

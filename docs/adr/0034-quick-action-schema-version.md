# ADR 0034: Quick Action Schema Version

Published quick-action packages carry an explicit schema version. Current
version one is normalized through the same sanitizer; unknown future versions
are isolated to a safe empty state until a migration is available. This keeps
older clients from applying incompatible provider data.

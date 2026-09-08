# ADR 0021: Quick Action Import/Export Migration

Imported quick-action data is treated as untrusted input. Legacy capability
fields are normalized, explicit targets are de-duplicated, unknown providers
remain inert serializable commands, and malformed entries are discarded without
blocking valid configuration. Migration never imports executable callbacks.

# ADR 0032: Quick Action Long-Run Stability

Repeated imports, refreshes, and provider reloads must converge to bounded
state. Normalization is idempotent, provider snapshots are capped, and malformed
bulk input cannot cause persisted or runtime state growth.

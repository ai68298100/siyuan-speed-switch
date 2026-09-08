# ADR 0014: Quick Action Settings Interaction Contract

Settings interactions are modeled as serializable state transitions: add and
edit preserve provider metadata, reorder rewrites stable order values, delete
removes only the selected entry, disable preserves configuration while hiding
execution, and restore-defaults replaces custom entries with the safe defaults.
Unknown mobile capability remains an explicit hint rather than an implicit
selection.

# ADR 0017: Quick Action Live Refresh

Saving quick-entry settings publishes one normalized snapshot to every surface.
Each surface filters the same snapshot by its targets, so removed entries
disappear consistently while unrelated entries remain. Presentation-only state
(such as collapsed rails) is kept separate from persisted action configuration
and survives configuration migration.

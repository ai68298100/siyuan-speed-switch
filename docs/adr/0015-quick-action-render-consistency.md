# ADR 0015: Quick Action Render Consistency

Settings display modes (full, icon-only, hidden) must share one capability
filter. Hidden entries never render; icon-only entries retain the same target
and enabled checks as full entries. Unknown mobile commands remain non-guaranteed
and unavailable provider handlers fail safely at execution time.

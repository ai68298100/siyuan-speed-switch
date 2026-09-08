# ADR 0013: Quick Action Release Combinations

The release gate exercises every provider kind across desktop, sidebar, and
mobile surfaces. Rendering honors both configured targets and enabled state;
unknown mobile command support remains explicit. Persisted entries are bounded,
unsafe icons fall back to a core icon, and provider unload or handler failures
return safe errors without disrupting neighboring actions.

# ADR 0020: Quick Action Capability Hints

Settings must communicate the difference between a surface that is known to be
unsupported and one whose capability is unknown. Ordinary commands default to
desktop/sidebar; mobile support requires explicit declaration. If execution is
unavailable, the UI receives a safe degraded result rather than an exception.

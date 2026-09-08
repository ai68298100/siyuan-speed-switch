# ADR 0040: Check-in Capability and Fallback

The check-in adapter must declare mobile support explicitly. Undeclared mobile
commands are shown as unknown rather than silently enabled; missing commands or
providers degrade to a stable unavailable result on every surface.

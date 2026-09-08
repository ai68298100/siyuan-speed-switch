# ADR 0031: Quick Action Post-Release Security

Post-release imports treat command values as inert metadata, reject remote icon
URLs in favor of core fallbacks, strip sensitive configuration fields, and
never execute an entry without a currently registered provider handler.

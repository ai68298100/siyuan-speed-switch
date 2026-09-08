# ADR 0039: Check-in Command Compatibility

The 小驴打卡 adapter may resolve a command from an ordered alias list to handle
plugin version differences. If no alias is available, invocation degrades to a
stable unavailable result. Unregister/re-register cycles replace the handler so
stale version callbacks are never retained.

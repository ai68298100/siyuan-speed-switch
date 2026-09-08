# ADR 0041: Check-in Provider Lifecycle

The 小驴打卡 provider is connected and disconnected through the runtime
registry. Connection loss removes candidates and makes invocation unavailable;
reconnect installs a fresh callback; failed reconnect leaves an empty safe
registry rather than stale entries.

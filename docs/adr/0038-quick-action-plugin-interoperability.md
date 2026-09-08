# ADR 0038: Quick Action Plugin Interoperability

External plugins such as 小驴打卡 integrate through the provider registry and
must explicitly declare supported surfaces. Missing or unloaded plugins degrade
to an unavailable result and remove all candidates without blocking the
switcher or leaving stale entries.

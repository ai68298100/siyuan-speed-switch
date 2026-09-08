# ADR 0009: External second-panel providers

External plugins such as check-in, data assets, and light-talk integrate through
the same read-only home adapter contract. Providers must declare supported
devices and return bounded snapshots. Missing, unloaded, unsupported, failed,
or timed-out providers degrade to a stable empty/unavailable state. The panel
must not import another plugin's internal modules or persist provider callbacks.

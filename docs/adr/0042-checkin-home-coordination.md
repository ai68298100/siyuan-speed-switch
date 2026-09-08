# ADR 0042: Check-in and Home Provider Coordination

The 小驴打卡 provider may expose both a quick-entry action and a read-only home
module. Their registries remain independent: loading or failing one surface does
not mutate the other, while an explicit provider unload removes both entries.

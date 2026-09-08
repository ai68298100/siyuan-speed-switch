# ADR 0016: Quick Action Surface Publish Contract

Settings changes are published as normalized serializable state and can be
re-rendered independently on desktop, sidebar, and mobile. New ordinary
commands default conservatively to desktop/sidebar; mobile is opt-in through a
provider declaration. Icon-only and collapsed modes preserve action identity,
and migration must retain explicit target selections so a save/refresh cycle
does not silently change visibility.

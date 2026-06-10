# D.BY Catalog UI Sync Design

## Goal

Align the D.BY content-selection screen with the SMY catalog UI while keeping
the D.BY visit-registration workflow and occupancy behavior intact.

## Design

- Keep `/kiosk/dby` as the production route and `DbaseKioskFlow` as the owner
  of all D.BY state and server actions.
- Add a preview-only `step=contents` query entry so the theme builder can show
  the real D.BY catalog state without completing registration.
- Reproduce the SMY catalog structure inside the D.BY contents step: catalog
  header, item counts, category filters, configurable grid columns, product
  card proportions, empty state, and floating selection bar.
- Preserve D.BY-specific availability badges, selected item state, back
  navigation, confirmation, and visit commit behavior.
- Point the theme builder kiosk tab at
  `/kiosk/dby?preview=1&step=contents`; keep the entry tab at the normal D.BY
  entry state.

## Verification

- Unit-test preview-step resolution.
- Run TypeScript compilation and the production build.


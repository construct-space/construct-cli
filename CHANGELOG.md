# Changelog

## [Unreleased]

## [1.5.1] — 2026-04-26

### Fixed
- **Auto-mirror desktop auth** — `auth.load()` falls back to the desktop app's active profile (`profiles.json` → `profiles/<id>/auth.json`) when no separate CLI `credentials.json` exists. Operator-driven `construct graph push` calls (Space Developer agent) now succeed without a prior `construct login`, since the user is already signed into the desktop app.

## [1.5.0] — 2026-04-26

### Added
- **Profile-aware install** — `construct install` now copies the built space into `profiles/<active>/spaces/<id>` so it lands in the desktop profile picked at login (falls back to the desktop's `active_profile` in `profiles.json`)
- **`profileId` in credentials** — `construct login` records the picked profile id; `graph push` and other graph commands derive `X-Auth-Org-ID` from it (`org:<uuid>` → `<uuid>`) when `CONSTRUCT_ORG_ID` is unset

### Changed
- **Widget templates use sandbox API** — scaffolded widgets now `inject('widgetApi')` instead of accessing globals directly, compatible with the closed Shadow DOM sandbox in Construct

## [0.9.0] — 2026-04-02

### Added
- **Action metadata extraction** — `construct build` now extracts action descriptions and params from `src/actions.ts` and inlines them into `dist/manifest.json` as structured metadata
- **`actions` manifest field** — `SpaceManifest` supports inline action definitions (`Record<string, ActionDef>`) alongside the existing file path reference

### Changed
- **Manifest template** — Default `actions` field is now an empty object `{}` instead of a file path, matching the inline metadata format
- **Lazy loading support** — Built manifests contain action metadata so the host app can register tool definitions at startup without loading the full IIFE bundle

## [0.8.0] — 2026-03-15

Initial tracked release.

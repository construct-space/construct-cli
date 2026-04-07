# Changelog

## [Unreleased]

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

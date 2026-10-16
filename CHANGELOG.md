# Changelog

All notable changes to deadfin-web are recorded in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
deadfin-web uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The release workflow copies the section of a tag into its GitHub Release. A
`vX.Y.Z` tag needs a `## [X.Y.Z]` section, and a `vX.Y.Z-rc.N` tag a
`## [X.Y.Z-rc.N]` section.

Release assets: `ghcr.io/deadfin-org/deadfin-web:<tag>` and
`deadfin-web-<version>.tar.gz` on the GitHub Release.

## [Unreleased]

## [0.3.0-rc.4]

Release candidate for the v0.3.0 alpha. It fixes an access-token leak to
external subtitle hosts. The Deadfin server image v0.3.0-rc.7 and later
bundles this release at `/web/`.

### Security

- **Subtitle and transcode URLs send the access token only to the server
  you signed in to.** Before, the player added `api_key=<token>` to an
  absolute external WebVTT `DeliveryUrl` and fetched it, so a subtitle on
  another host received the token. Now a media URL gets the token only when
  its origin is the server's origin and the server does not mark the stream
  `IsExternalUrl`.
- **Hardening headers in the nginx example.** The README site now sends
  `Referrer-Policy: no-referrer` and a Content-Security-Policy that the
  acceptance suite runs under, and logs paths without the `api_key` query
  parameter.

## [0.3.0-rc.3]

Release candidate for the v0.3.0 alpha. deadfin-web runs from a Deadfin
server's `/web/` directory and covers TV, search, transcoded playback, track
selection, Quick Connect and first-run setup.

### Added

- **TV.** A series page with season tabs (specials last), episode rows with
  progress and played state, and a "Play next" button. A Next Up shelf on
  the home page. When an episode ends, an "Up next" card counts down and
  plays the next episode.
- **Search** across libraries, from the home header. Results are grouped by
  kind. The search term stays in the URL, so Back returns to the results.
- **Transcoded playback over HLS.** The client asks the browser which codecs
  it decodes and sends a matching device profile. Files the browser cannot
  play directly play through the server's HLS transcode: natively in Safari,
  and with hls.js elsewhere.
- **Audio and subtitle track selection** in the player. Text subtitles play
  as WebVTT. An audio track or an image subtitle that the browser cannot
  apply restarts the stream from the current position.
- **Quick Connect.** A signed-in user types the code that a TV or phone app
  shows, and the app signs in.
- **First-run setup wizard** over the server's startup API: server name and
  language, administrator, libraries with a folder browser, and remote
  access. It explains the Deadfin setup link when the server asks for it.
- **About panel.** The header names the real server build, for example
  "Deadfin 0.3.0-rc.6" or "Jellyfin 12.0.0". The about menu lists the client
  build, the server build and the server address, and copies them for a bug
  report.
- `SECURITY.md`. Report security problems privately on deadfin-org/deadfin.
- GitHub Actions runs the unit tests and the build on release tags.

### Changed

- The bundle runs from a server's `/web/` directory: asset URLs are relative
  and routes are hash routes (`/web/#/item/…`). At `/web/` the sign-in page
  fills in the server that served the app.
- `release.yml` can publish an existing tag by manual dispatch, and creates
  the SBOM directory before it writes the SBOMs.

### Fixed

- A revoked or expired token returns to sign-in with "Your session ended.
  Sign in again." Before, every shelf showed a connection error.

## [0.3.0-rc.2]

### Added

- Release candidate builds report `Channel` `rc` and `Version`
  `X.Y.Z-rc.N`.
- Each tag publishes `ghcr.io/deadfin-org/deadfin-web:<tag>` (linux/amd64,
  linux/arm64) and `deadfin-web-<version>.tar.gz` with a sha256, build
  provenance and SPDX SBOMs.
- `dist/licenses/` carries the license texts of the bundled fonts.

### Fixed

- Sign-out ends the server session (`POST /Sessions/Logout`) and clears the
  cached data of the previous user.
- Series, albums and folders show no Play button.
- The stop report survives a closed tab.
- User-visible text uses plain words.

[Unreleased]: https://github.com/deadfin-org/deadfin-web/compare/v0.3.0-rc.3...HEAD
[0.3.0-rc.3]: https://github.com/deadfin-org/deadfin-web/compare/v0.3.0-rc.2...v0.3.0-rc.3
[0.3.0-rc.2]: https://github.com/deadfin-org/deadfin-web/compare/v0.3.0-rc.1...v0.3.0-rc.2

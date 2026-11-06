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

## [0.4.0-rc.1]

Release candidate for v0.4.0. It adds the transcode workers dashboard and
Live TV for viewers. The Deadfin server image v0.4.0-rc.1 bundles this
release at `/web/`.

### Added

- **Transcode workers page** (deadfin-web#71): Dashboard → Playback →
  Transcode Workers, on Deadfin's native admin API (D-118, needs a Deadfin
  0.4 server). It lists the workers with state, pools, media input,
  capabilities and jobs, and edits or revokes them; creates and revokes join
  tokens and shows a new token once with the worker command line; edits the
  placement policy, the scaling token and the extra server key pins. The
  plain-HTTP toggle shows once the server has its setting (deadfin#664).

- **Live TV Programs and Guide tabs** (deadfin-web#91), as jellyfin-web
  12.0. Programs shows On Now and upcoming Shows, Movies, Sports, For Kids
  and News. Guide is a time grid of channels and programmes for today or a
  later guide day, with a now line, a Now button and the channel-list
  picker. Programmes show their season, episode, episode title and a Live,
  Premiere or New badge when the guide has them. A programme opens its
  details, where Play starts its channel while it airs; a channel plays.

- **Live TV Recordings, Schedule and Series tabs** (deadfin-web#91), as
  jellyfin-web 12.0, on the server's `/LiveTv/Recordings`, `/LiveTv/Timers`
  and `/LiveTv/SeriesTimers` endpoints. Schedule and Series can cancel a
  recording or a series. They stay empty on a server without a DVR.

- **Guide settings** (deadfin-web#91): jellyfin-web's Settings dialog for
  the guide, with the same user settings: channel order (number or recently
  watched), favorite channels first, and the HD, Live, New, Premiere and
  Repeat indicators.

### Changed

- **The guide draws only the channels in view** (deadfin-web#91). The grid
  is as tall as the whole lineup, and it fetches and draws only the pages of
  channels near the scroll position, so a lineup of 11,000 channels scrolls
  to any channel. Channel cards show the programme that is on now.

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

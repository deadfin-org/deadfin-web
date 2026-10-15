<p align="center">
  <img src="public/favicon.svg" alt="Deadfin" width="96" height="96">
</p>

<h1 align="center">deadfin-web</h1>

<p align="center">
  <strong>A new web client for Deadfin.</strong><br>
  Written against the Jellyfin 12.0.0 API, so it also runs against Jellyfin.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: GPL-2.0-only" src="https://img.shields.io/badge/license-GPL--2.0--only-blue"></a>
  <a href="https://github.com/deadfin-org/deadfin-web/tags"><img alt="Latest release" src="https://img.shields.io/github/v/tag/deadfin-org/deadfin-web?sort=semver&label=release"></a>
  <img alt="Node.js 20.19+ or 22.13+" src="https://img.shields.io/badge/node-20.19%2B%20%7C%2022.13%2B-green">
</p>

---

deadfin-web is a browser client for [Deadfin](https://github.com/deadfin-org/deadfin),
the Go port of the Jellyfin server. It is a new TypeScript and React app,
not a fork of jellyfin-web. It talks to the server only through the
Jellyfin 12.0.0 HTTP API, so it works with Deadfin and with stock
Jellyfin 12.0.0.

Deadfin's full web interface is still stock jellyfin-web 12.0, served at
`/web`. deadfin-web is the new client that grows beside it.

## Status: alpha

deadfin-web is early alpha software. It covers a small part of what
jellyfin-web does.

**Works today:**

- Sign in with a server address, user name and password.
- Home: a Continue Watching shelf and one shelf per library, with blurhash
  placeholders while posters load. Each shelf shows the first 30 items by
  name; there is no full library page yet.
- Item pages with overview and details. Mark played or unplayed, and
  favorite or unfavorite.
- Direct play of webm (VP8, VP9, AV1) and mp4 (H.264, HEVC and AV1 where
  the browser decodes them), with start, progress and stop reported to the
  server, so resume points and played state stay in sync.

**Not available yet:**

- TV shows and music albums appear on the home page, but you cannot open
  their seasons, episodes or tracks.
- Transcoding. Files the browser cannot play directly, which includes most
  mkv files, show an error.
- Subtitles, audio track selection, search, user settings, first-run setup
  and the admin dashboard.

Use jellyfin-web at `/web` for these.

## Quick start

You need a running Deadfin or Jellyfin 12.0 server. To set up Deadfin, see
the [install guide](https://github.com/deadfin-org/deadfin/blob/master/docs/alpha/install.md).

**1. Build the client.**

```bash
git clone https://github.com/deadfin-org/deadfin-web.git
cd deadfin-web
npm ci
npm run build
```

The bundle is in `dist/`.

**2. Serve it.** The bundle uses relative asset paths and hash routes
(`#/item/…`), so it runs from any directory of any static web server. Two
ways:

- **From Deadfin itself.** Deadfin serves `<DEADFIN_DATA_DIR>/web` at
  `/web/` (`/var/lib/deadfin/web` in the container). Put the contents of
  `dist/` there instead of jellyfin-web and open `http://<host>:8096/`.
  deadfin-web has no admin dashboard yet, so keep a copy of jellyfin-web if
  you need one.
- **As its own site.** Serve `dist/` and, for one address, proxy every other
  path to the server. This nginx site does both:

```nginx
server {
  listen 80;
  root /srv/deadfin-web;   # the contents of dist/
  absolute_redirect off;

  # The app and its assets.
  location = /            { try_files /index.html =404; }
  location /assets/       { try_files $uri =404; }
  location = /favicon.svg { try_files $uri =404; }

  # Everything else is the server's API.
  location / {
    proxy_pass http://deadfin:8096;
    proxy_set_header Host $host;
    proxy_http_version 1.1;
    proxy_buffering off;
  }
}
```

**3. Sign in.** Open the site. The server address defaults to the server
that served the page (the page's origin, plus the base URL when the app is
at `<base>/web/`), which is right for both setups above. To use a server on another
address, type its URL on the sign-in page. Deadfin and Jellyfin both allow
cross-origin requests, so this works without the proxy.

The browser must reach the app over `https://` or `http://localhost`. The
app uses the Web Crypto API, which browsers offer only in a secure context.

## Compatibility

| Server | Status |
|---|---|
| Deadfin (current release) | Supported. Same origin or cross-origin. |
| Jellyfin 12.0.0 | Supported. The acceptance suite runs against it. |
| Other Jellyfin versions | Untested. |

The API contract is the Jellyfin 12.0.0 OpenAPI document in
[`contract/`](contract/). Its source and hash are in
[`contract/PROVENANCE.md`](contract/PROVENANCE.md). The TypeScript API
types are generated from it, so the client cannot call an endpoint or send
a shape that the contract does not define.

Server and client release separately. Their version numbers are unrelated.

## Build from source

You need Node.js 20.19 or newer on the 20 line, or 22.13 or newer, and npm.

```bash
npm ci
npm run dev       # Vite dev server on http://localhost:5210
npm test          # unit tests (Vitest)
npm run build     # type-check and production bundle in dist/
npm run preview   # serve dist/ on http://localhost:5211
```

`npm run gen:api` regenerates `src/api/schema.d.ts` from the contract. The
generated file is committed.

Set `VITE_DEFAULT_SERVER` at build or dev time to prefill the server
address on the sign-in page.

The build writes its version and commit into the bundle and into
`dist/build.json`. Set `DEADFIN_WEB_VERSION` (for example `0.2.5`, or
`0.3.0-rc.1` for a release candidate) to build a release. The build reports
a release (or `rc`) identity only when the matching `vX.Y.Z` (or
`vX.Y.Z-rc.N`) tag points at the checked-out commit and the tree is clean.

Each tag publishes the built bundle as
`ghcr.io/deadfin-org/deadfin-web:<tag>`, a busybox image with the files at
`/deadfin-web` (linux/amd64 and linux/arm64), and as
`deadfin-web-<version>.tar.gz` with a sha256 on the
[GitHub release](https://github.com/deadfin-org/deadfin-web/releases).
Release candidates are marked as prereleases. The image and the tarball
carry build provenance attestations, and each image architecture an SPDX
SBOM; the release notes give the `gh attestation verify` commands.

### Stack

- TypeScript, React 19 and Vite.
- [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) with types from
  [`openapi-typescript`](https://openapi-ts.dev/).
- [TanStack Query](https://tanstack.com/query) for server state.
- Plain CSS with custom properties (`src/ui/tokens.css`). Archivo and
  IBM Plex Mono fonts, bundled with the app.

### Acceptance tests

```bash
make accept            # against stock Jellyfin 12.0.0
make accept-deadfin    # the same suite against a Deadfin image
```

These need Docker. The harness makes a small media library with ffmpeg,
starts the server, completes the setup wizard through the API, and drives
the built app in Playwright: sign in, home, item page, playback.
Screenshots go to `e2e/evidence/`. The tests make no requests to outside
services. Set `DEADFIN_IMAGE` to pick the Deadfin image for
`make accept-deadfin`, for example `ghcr.io/deadfin-org/deadfin:vX.Y.Z`.
`make accept-deadfin` also needs `DEADFIN_TOOLS_IMAGE`, an image with
Deadfin's test seeding tools that is not published yet, so for now only
`make accept` runs outside the maintainer's CI.

A test that passes against Jellyfin and fails against Deadfin points to a
Deadfin server bug. Report it in the
[Deadfin issues](https://github.com/deadfin-org/deadfin/issues).

## Provenance

deadfin-web is written from scratch, with AI coding agents, and reviewed by
the Deadfin maintainer. It contains no jellyfin-web source code. Its
reference is the Jellyfin 12.0.0 OpenAPI document and the behavior of
jellyfin-web v12.0.0 (`f6ed7e61647569ff4098dc22a67953a10d32b2a4`). The
pinned revisions are listed in
[`contract/PROVENANCE.md`](contract/PROVENANCE.md).

## License

deadfin-web is licensed under the GNU General Public License, version 2
only (`GPL-2.0-only`), the same as the Deadfin server. See
[LICENSE](LICENSE).

The bundled Archivo and IBM Plex Mono fonts are under the SIL Open Font
License 1.1. The build copies their license texts into `dist/licenses/`, so
the release tarball and image carry them next to the font files.

## Security

Report security problems privately through GitHub private vulnerability
reporting on the server repository:
<https://github.com/deadfin-org/deadfin/security/advisories/new>.
See the Deadfin [security policy](https://github.com/deadfin-org/deadfin/blob/master/SECURITY.md).

## Contributing

Bug reports and small, focused pull requests are welcome. Report bugs in
the [Deadfin issues](https://github.com/deadfin-org/deadfin/issues) and
mention deadfin-web in the title. Ask questions in
[Deadfin discussions](https://github.com/deadfin-org/deadfin/discussions).
Read the Deadfin
[contributing guide](https://github.com/deadfin-org/deadfin/blob/master/CONTRIBUTING.md)
first.

## Acknowledgements

deadfin-web exists because of [Jellyfin](https://jellyfin.org) and its
contributors, who built the API, the server and jellyfin-web that this
client follows. Thank you.

deadfin-web is not affiliated with or endorsed by the Jellyfin project.
Jellyfin is a trademark of its respective owners.

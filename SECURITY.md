# Security policy

## Report a vulnerability

Report security problems privately through GitHub private vulnerability
reporting on the Deadfin repository:

<https://github.com/deadfin-org/deadfin/security/advisories/new>

Put "deadfin-web" in the title. The report is private to the maintainers.
Include:

- The deadfin-web build: the web client line from the "about" menu, or
  `dist/build.json`.
- The server and its build (Deadfin or Jellyfin), and the browser.
- What an attacker can do, and what they need first (network position, an
  account, a role, a page the user opens).
- Steps or a request sequence that shows the problem.
- Placeholders in place of real tokens, passwords, and API keys.

Do not open a public issue for a security problem.

## Supported versions

deadfin-web is alpha software. Security fixes go to `master` and the newest
release tag.

## Scope

This policy covers the deadfin-web client in this repository and the release
assets at `ghcr.io/deadfin-org/deadfin-web`. Report problems in the Deadfin
server under the
[Deadfin security policy](https://github.com/deadfin-org/deadfin/blob/master/SECURITY.md).
Report problems in jellyfin-web, Jellyfin, or the npm packages the client
uses to their upstream projects.

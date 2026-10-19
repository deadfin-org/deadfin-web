# Accessibility and languages

deadfin-web is the web client for the [Deadfin](https://github.com/deadfin-org/deadfin)
media server. Deadfin serves it at `/web/`. This statement covers the web
client. The server supplies subtitles, audio tracks, and language data; see the
[server statement](https://github.com/deadfin-org/deadfin/blob/master/ACCESSIBILITY.md).
Deadfin speaks the Jellyfin API, so any Jellyfin client also works with it. If
deadfin-web does not suit your assistive technology, use jellyfin-web or a
native Jellyfin app.

## What works today

### Structure and screen readers

- Pages use `<main>`, `<header>` and `<nav>` landmarks. Home rows are sections
  with headings.
- Poster cards are links. The title in the card caption is the link name.
  Posters and backdrops are decorative images with empty `alt`.
- Login, setup and library forms use labelled native inputs. The search box
  has the label "Search".
- Errors and notices use `role="alert"` and `role="status"`.
- Season tabs use `tablist`, `tab` and `tabpanel` roles. Each episode's play
  button names the episode.
- The page language is English (`<html lang="en">`).

### Keyboard

- Tab reaches links, buttons and form fields. Enter opens a card.
- Player controls (play/pause, audio and subtitles, fullscreen) are buttons
  with accessible names.
- The audio and subtitle menu is a fieldset of radio buttons. Its button
  reports `aria-expanded`.

### Focus and motion

- Every focused control shows a teal focus ring (`:focus-visible`).
- With `prefers-reduced-motion: reduce`, animations and transitions stop.

### Color

The theme is dark. Contrast ratios against the page background `#060b12`:

| Use | Color | Ratio |
|---|---|---|
| Primary text | `#e8eef2` | 16.9:1 |
| Secondary text | `#8fa3b8` | 7.6:1 |
| Accent, links, button text | `#3fe0c5` | 11.9:1 |
| Errors | `#ff6b5e` | 7.1:1 |

### Captions, audio, and languages

- The player lists every audio and subtitle track that the server reports.
  Pick any track, including SDH, forced, and audio-description tracks.
- Subtitles play as WebVTT text tracks. The browser's caption settings apply.
- The server picks the starting tracks from your preferred audio and subtitle
  languages, and carries your choice to the next episode.
- The UI is in English.

## Known limitations

- The player has no keyboard shortcuts.
- The seek bar works with a mouse or touch only. It has no slider role and no
  keyboard control.
- Player controls fade out after mouse inactivity. Keyboard focus does not
  bring them back.
- The audio and subtitle menu does not close with Escape and does not return
  focus to its button.
- Season tabs do not move with the arrow keys.
- Pages have no skip link.
- Small muted labels (`#56687c`) have a contrast ratio of 3.5:1, below the
  WCAG AA 4.5:1 for text. Input borders are 1.4:1.
- The focus ring is a box shadow. In forced-colors mode (Windows High
  Contrast) it does not show.
- Screen readers do not announce the watched mark or the progress bar on
  posters.
- The Up Next countdown is a live region and can announce every second.
- The UI has one language (English) and one theme (dark).
- Subtitle size and color settings come from the browser only.

## Report a barrier

Open an issue in
[deadfin-org/deadfin-web](https://github.com/deadfin-org/deadfin-web/issues/new)
and put "Accessibility" in the title. Maintainers add the `accessibility`
label. Tell us:

- your browser and its version;
- the assistive technology you use, if any (screen reader, keyboard only,
  switch control, magnifier, forced colors);
- the page, what you tried to do, and what stopped you.

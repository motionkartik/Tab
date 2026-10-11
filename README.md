# ReadyTab Web

A plain static-website port of the ReadyTab browser extension (v1.8.1).
Runs in any browser or device from any static host — no extension APIs,
no Pro license, no cloud sync, no backend.

- Original extension source lives next to this folder in `../ReadyTab`
  (untouched — this folder is a converted copy).
- Storage is per-browser-profile `localStorage`. Export JSON backups from
  Settings → Data to move between devices.

## How to run

Any static server works (must be HTTP — `file://` breaks ES modules and
`fetch()` of the locale files):

```bash
cd ReadyTab-web
npx serve .        # or: python3 -m http.server 8080
```

Then open the printed URL. For daily use, deploy the folder to
GitHub Pages / Netlify / Vercel / any static host, or set it as your
browser's homepage / new-tab page.

## Session log

| Date       | Did | Next |
|------------|-----|------|
| 2026-10-10 | Extension → website conversion (all phases below). Verified with headless Chromium: boot, workspace add + reload persistence, group drawer, all 4 settings tabs, JSON export download, bookmark-file import dialog, German language switch. Zero console errors, zero failed requests. | See Backlog |
| 2026-10-11 | Feature batch: (1) logo feature removed entirely (JS/HTML/CSS + `general_customLogo`/`general_logoSize` keys); (2) click on time toggles 24h/12h (persists to `general_clockFormat`, settings select stays in sync); (3) greeting name in Settings → Greeting (`general_greetingName`), greetings localized to all 10 locales (`greet_*` / `greet_*_name` keys); (4) letter-avatar favicon fallback (`js/favicon.js`: deterministic hue + initial, used on load-error / missing icon / privacy mode) + Settings → Favicons → "Load favicons from the web" kill-switch (`general_remoteFavicons`, default on; builders + `renderStoredIcon` gated, `data:`/`blob:` always allowed); (5) Google autocomplete in the searchbar via JSONP (`suggestqueries…client=firefox&callback=`, debounced 220ms, max 5 rows after local results, keyboard-navigable, silent on failure); (6) mobile support: viewport meta, `css/mobile.css` (stacked header, scaled clock, full-width drawer, stacked hub sidebars), grid ladder 24→12→6→2 cols (`css/gridstack-24.css` `.gs-2`/`.gs-6` mirrors). Verified headless: phone 390px (gs-2, no h-overflow) + desktop (gs-24), clock toggle, named greeting, favicon toggle, live Google suggestions (5 rows). Zero errors. | See Backlog |
| 2026-10-11 | Link form + greeting polish: (1) URL textarea moved above Name field in the link drawer; (2) title autofills from URL via `getNameFromUrl()` (`js/untrusted-input.js`: subdomain-aware, e.g. mail.google.com → "Google Mail"; only fills when name empty, never overwrites; also used as fallback for section-linkcard titles); (3) greeting name textbox restyled to the standard `.settings-text-field` stacked pattern. Verified headless: DOM order, "Google Mail" autofill, typed-name preservation, invalid-URL no-crash, 12px-radius full-width input. Zero errors. | See Backlog |
| 2026-10-11 | Link consistency batch: (1) URL field moved above name in the group drawer too; title autofill added to group-drawer link-buttons (Standard/Tile/Large tile — same form); (2) bare domains accepted everywhere (`normalizeLinkUrl()` in `sanitizeLinkUrl()` core + section-URL fallback: `github.com` saves as `https://github.com`; `getNameFromUrl` tolerant too); (3) fixed Selected-preview edit bug — `choosenIconAddLink` used an unscoped query that grabbed the group drawer's preview (`#group` precedes `#link` in DOM), so editing an in-group link showed "No icon chosen yet!" and painted the wrong drawer; now scoped to `#link .choosen-icon`; (4) removed dead icon-picker preview path (`use-favicon-btn`/`favicon-preview`/`group-favicon-*` elements never existed in HTML; `renderFaviconMeta` never ran). Verified headless: group-drawer add (autofill "Github", favicon preview, normalized save), link-editor add (bare-domain save `https://example.com/some/page`), link-button edit (values + preview + autofetch restored), in-group-link edit (saved SVG now shows). Zero errors. | See Backlog |
| 2026-10-11 | Custom icon tab: icon picker now offers Solid / Brands / Regular / **Custom** in both drawers (link + group). Custom tab takes any SVG/PNG link (e.g. faviconapi URLs), validates scheme, probes load via `Image` before adopting into the Selected preview + saved icon; invalid/failed shows an inline error. Injected dynamically by `ensureCustomIconTab()` in `js/icon-picker.js` (no HTML duplication); 5 new `ip22_custom_*` i18n keys in all 10 locales; styles in `css/components/icon-picker.css`. Verified headless in both drawers: tab order, panel/grid toggling, invalid-URL error, data-URL apply into `svgInput` + preview. Zero errors. | See Backlog |
| 2026-10-11 | Backup now covers settings: export includes a `settings` object (all `general_*` keys — greeting name, clock format, search engine, favicon privacy, language — plus `todo_reminders` and `workspace_notes_*`/`workspace_todos_*`), collected prefix-based so future keys are automatic; import restores them and reloads so everything applies (old backups without `settings` still import the legacy way). Export description reworded in all 10 locales. Verified headless: export file contains settings, wipe + import restores all four test keys and greeting renders post-reload. Zero errors. | See Backlog |
|            |     |      |

## What changed vs the extension

### Deleted (extension-only)
- `manifest.json`, `background.js` (service worker: tab tracking, alarms,
  notifications, context menus, omnibox search, native messaging),
  `content-scripts/`, `_metadata/`
- `reader.html` + `js/reader/` + `css/reader.css` (shared-board viewer —
  needed the backend)

### Deleted (Pro license — everything is free now)
- `js/license.js`, `license-capabilities.js`, `license-refresh.js`,
  `settings-license.js`, `upgrade-modal.js`, `license-change-warning.js`,
  `backend-compatibility.js`, `config.js` (backend URL)
- Settings → Account tab, empty-workspace Pro upsell pane, all
  `pro-locked` upgrade buttons. Passphrase-protected workspaces are
  free for everyone (still encrypted locally via `crypto-utils.js`).

### Deleted (cloud sync / sharing — local-only now)
- `cloud-sync.js`, `cloud-sync-manager.js`, `sync-engine.js`,
  `sync-diff-modal.js`, `sharing-hub.js`, `sharing-ui.js`,
  `workspace-share.js`, `public-board*.js`, `shared-boards-modal.js`,
  `shared-board-*.js`, `managed-boards*.js`
- Settings → Spaces → Sharing card, Account → sync controls,
  `general_cloud*` settings. `managedBoardIds` guards stay in code but are
  always empty (harmless).
- `link-health.js` (needed the service worker for CORS-free fetching)

### Deleted (needed browser tab access — no web equivalent)
- Save-current-window (`save-current-window-handlers.js` + settings row +
  modal), session recovery (`session-recovery-handlers.js` + settings
  section + modals + startup prompt), open-tabs search / tab ribbon /
  matching-tabs / mouse-gesture / all-pages spotlight options,
  Link Health toggle, companion-app status (`CompanionPing` → no-op),
  native file/folder/app launching (routine + launcher steps of those kinds
  now show "not available").

### Reworked
- **Storage** (`js/storage-local.js`): same `getLocal` / `setLocal` /
  `removeLocal` exports (promise + optional-callback style), now backed by
  `localStorage` with JSON serialization. Plus in-memory `getSession` /
  `setSession` (replaces `chrome.storage.session`) and `onLocalChange`.
  All ~30 direct `chrome.storage.local` call sites converted.
- **Cross-tab sync** (`workspaces/storage-coordinator.js`): `StorageEvent`
  (other tabs) + `onLocalChange` (same tab) fan-out with the same handler
  contract (`workspace-reload`, `workspace-visuals`, `onboarding`,
  `session-recovery`, `todo-badge`). Removed handler names are ignored at
  registration instead of throwing.
- **i18n** (`js/i18n.js`): `navigator.language` instead of
  `chrome.i18n.getUILanguage`, `fetch()` of `locales/<code>/messages.json`
  (renamed from `_locales/` — leading underscores break some static hosts)
  instead of `chrome.runtime.getURL`. Language pref lives only in
  `localStorage`.
- **General settings persistence**: the background used to persist these on
  `GeneralSetting` messages — handlers now `setLocal()` directly
  (`general_linkTarget`, `general_clockShow`, `general_greetingShow`,
  `general_clockFormat`, `general_clockSeconds`, `general_clockDate`).
- **Bookmarks**: no `chrome.bookmarks` — import via bookmark HTML export
  file everywhere: new parser `parseBookmarkFile()` in
  `bookmark-import-model.js`, file picker in the import dialog
  (`#bmi-file`), file-based folder picker in empty-group import,
  start-screen card opens the dialog directly.
- **Search**: `performWebSearch()` navigates to engine URLs directly;
  the "Browser default" engine maps to Google (English label updated).
  Link-card metadata fetched page-side (CORS-permitting, best-effort).
- **Open-all-links**: `window.open()` per link.
- **Todo reminders**: in-page poller (`initTodoReminders()`, every 30s +
  once shortly after boot) fires due reminders via the Web Notifications
  API with in-page toast fallback; master switch uses
  `Notification.permission` instead of the `notifications` extension
  permission.
- **Routines**: `url`/`app` steps use `window.open`; `file`/`folder`/
  native-launcher steps show "not available".

## Project structure

```
index.html            UI shell (4 settings tabs: General, Design, Spaces, Data)
locales/              UI strings (10 languages, fetched at runtime)
css/ icon/            styles, artwork
js/main.js            boot: i18n → settings → theme → workspaces → notes/todo → spotlight
js/storage-local.js   localStorage backend (the only persistence layer)
js/workspaces/        boards state, tabs UI, grid sync, protection, metadata
js/dom-manager/       grid + widget renderers
js/theme-editor/      themes + per-workspace visuals
js/backgrounds/       animated background scenes
js/notes/ js/todo/    workspace-scoped hubs (localStorage, optional passphrase encryption)
js/spotlight.js       in-page '/' palette (chrome-free)
js/bookmark-import*.js  bookmark HTML file import
js/lib/               vendored gridstack + sortable (no build step, no npm)
```

## Storage keys (localStorage)

`workspaces`, `workspaceOrder`, `workspaceNames`, `activeWorkspace`,
`workspaceVisuals`, `workspaceWriteToken`, `workspace_metadata_v2`,
`workspace_protected_ids`, `workspace_protected_*`, `workspace_bg_*`,
`workspace_notes_*`, `workspace_todos_*`, `todo_reminders`,
`grid_columns`, `general_*` (settings), `layout_*` (legacy).

## Backlog / known quirks

- [ ] "Browser default" engine label in non-English locales still says the
      old text (maps to Google everywhere).
- [ ] Cross-device sync: manual JSON export/import only (by design for now).
- [ ] Link-card metadata fetch fails on CORS-blocking sites (falls back to
      empty card the user fills in).
- [ ] localStorage ~5MB quota: large custom backgrounds may hit it; a
      future IndexedDB backend would raise the ceiling.
- [ ] Old `general_cloud*` / `general_spotlightTabs*` keys may linger in
      existing profiles — harmless (never read).
- [ ] Stale i18n keys for removed features remain in locale files (unused).

# fvtt-mod-scrollcase — working notes for sessions in this repo

**What this is.** Open Roll 5e: Scroll Case, a Foundry VTT module: the journal as a library of cards, a search that
finds a picture by any word, one-click Show, a keyboard finder. A skin over Foundry's own journal: the sidebar's
Journal button opens it, Classic Mode puts the stock journal back per client. Part of Open Roll 5e (the suite repo
is `..`, its CLAUDE.md has the family's conventions; the plan is `../docs/plans/scrollcase.md`). Plain ES modules,
no build step, no libWrapper, no socketlib, MIT.

**State (2026-10-31).** 1.0.4 (square cards, each picture framed by its shape: `frameShape`, tagged on load; a
tall one cropped from the top, a scroll or a panorama shown whole; as in Clue Board) released and on prod (the
installer). 1.0.3 (the rails shortened on the user's word: a player's is All, then New; the GM's All,
Visible to players, GM only, Not in a journal; pins and what was shown live on the cards, the panel and the finder),
released and on prod (the installer; every released file served byte-identical; a prod GM page reads 1.0.3 and that
rail). 1.0.2 a page's web link, `/game?page=<uuid>`, and the body's view class mended for it; 1.0.1 the JSON export
of the cards in view. 1.0.0, the first release, named Scroll Case on the user's word (built as "Handouts" the same
evening; the setup screen's `getPackages`, 7,086 modules, has no "Scroll Case" and no `scrollcase`). Before it, two
adversarial review passes (four Opus reviewers) and a third on Playwright screenshots, every finding fixed; the
Reader (a card's page simply) and a Show opening in it followed on the user's word. Its look is the family's: Clue
Board wears it too. `npm run verify` green (86 tests); `tools/live-check.mjs --walk` GREEN on the sandbox (43 checks).

## The rules this module keeps

- **A skin, no data of its own** (the user's ruling): no flag, no document of its own, no setting used as a store.
  Every world write is one the stock journal makes, all in `scripts/show.js`: a page's `ownership` (written whole
  with v14's `_replace`, as `dialog-show.mjs` does), a page's `category`, a new `JournalEntryCategory`, a new image
  page for an added picture (page default None, in the journal the `handoutsJournal` setting names, made GM only on
  first use). Pins, *Recently shown*, *New*, the view, the type and the size live in localStorage per world and user
  (`scripts/memory.js`, mended field by field on load).
- **The Journal button is intercepted, not patched**: listeners on the button itself (`click`, and `auxclick` for a
  middle click, since the sidebar acts on both) stop the event before it bubbles to the sidebar's handler, unless
  Classic Mode is on for this client. A right-click still reaches the sidebar. If the window fails to open, the stock
  tab opens (fail open). Classic Mode's way back is one button in the stock directory's header, added on
  `renderJournalDirectory` only while Classic is on.
- **A Show is a message, opened in the Reader**: `show.js` sends `{ action: "show", uuid | src, users, picture,
  title, caption }` on the module's socket channel (`socket: true`; a manifest change, so a new channel needs a
  server restart); each client it is for opens the Reader (`receiveShow` in `scrollcase.js`; `shown`, so it stays
  open without the page's permission, as Foundry's Show allows), or, in Classic Mode or for a PDF, Foundry's own
  view (`ImagePopout`, `Journal._showEntry`). One show per page or file at a time. A player records it as shown and
  seen; Foundry's own `showEntry` and `shareImage` events (a GM in Classic Mode) are heard too, pages only.
- **Who can see a page** is `visibilityWrite` (pure, tested): only the players whose visibility changes are touched;
  everyone at once moves the default to Observer, no one at once back to inherit (None when the journal lets players
  see); null when nothing changes, so inheritance survives. Writes on one page are queued (`show.js`). Players are
  the users who are neither GMs nor banned.
- **A reveal can be undone**: a Show that changes who can see a page records the map it replaced and the map it
  wrote; Undo (the strip at the top of the cards, ten minutes) restores only if the page still holds what was written.
  Show the picture never touches ownership.
- **No GM secret reaches a player**: a non-owner's card text, picture and search come from the page with unrevealed
  `section.secret` removed (Foundry's own rule, on an inert `<template>`); a journal a player cannot observe shows
  them neither its name nor its folder.
- **A page never moves between journals** (its uuid would change and every link break); sections are the filing.
- **A page's web link** is `/game?page=<uuid>` on the game's own address: Foundry's login keeps a `/game` address
  through the join screen (`gameRedirect`) and returns to it, and at `ready` `openLinked` opens the page as a card
  would, only for a user who may see it, then takes the parameter out of the address bar. Nothing is stored; a
  page the user cannot see, or anything not a page's uuid, gets a notice and opens nothing. Foundry's server names
  the body's view class from the whole address (`vtt game?page=…`), which takes the interface's layout with it:
  `mendViewClass`, run as the entry script loads, puts `game` back before anything draws.
- **The search never redraws**: it filters the drawn cards from a JS map of their fields, so the caret and the
  scroll stay; a redraw reapplies it. Focus is put back where it was (the card, the panel, the options). The finder
  redraws only its list.

## How the code is laid out

- `scripts/decide/scrollcase.js` (`// @ts-check`, pure): `kindOf`, `plainText`, `excerptOf`, `firstImage`,
  `allImages`, `pictureOf`, `stripSecrets`, `withoutImages`, paths (`fileName`, `folderOf`, `prettyName`,
  `normPath`, `samePath`, `isImageFile`, `folderList`), `matchWhy`, `searchFields`, `levelOf`, `visibilityWrite`,
  `whoSees`, `sameIds`, `remember`, the export (`exportName`, `exportOf`), the link (`pageLink`, `linkedPage`,
  `withoutLink`, `mendViewClass`), `frameShape`. Tested in `tests/scrollcase.test.js`.
- `scripts/common.js`: the id, the logger, `t`, `setting`.
- `scripts/scrollcase.js`: the entry point; the settings and the keybinding at `init`; the Journal button and the
  directory's way back; the refresh hooks; the players' show listeners, a linked page opened, the stylesheet probe,
  `module.api`.
- `scripts/library.js`: the card data cache, `pageCards`, `loadFiles` and `fileCards`, `ScrollCaseWindow` (context,
  actions, search, focus, drag and drop, the reveal strip, the export of the cards the search leaves showing).
- `scripts/show.js`: every world write and every show, the reveal and its Undo; `players`, `whoCanSee`,
  `openInJournal`, `openForReading`, `openPicture`.
- `scripts/finder.js`: `Finder`.
- `scripts/reader.js`: `Reader`, one page's picture and text (enriched with `secrets: page.isOwner`), one window
  per page, following its page; what a card click (a player's) or Enter (the GM's) opens.
- `scripts/memory.js`: the browser's record.
- `templates/library.hbs`, `templates/finder.hbs`, `templates/reader.hbs`, `styles/scrollcase.css`, `lang/en.json`.
- `tools/live-check.mjs` (the walk), `tools/shots.mjs` (24 states and the words audit); both refuse any host but
  `FOUNDRY_HOST=local`.

# Open Roll 5e: Scroll Case

A Foundry VTT module for the GM who keeps losing the picture they meant to show. **Scroll Case** turns the
journal into a case of cards: every handout, map, portrait and letter at a glance, found in a keystroke, shown
to the players in one click, and read by them in a plain, quiet window with just the picture and the words.

It is a skin over Foundry's own journal, not a replacement. It keeps no data of its own in your world, so you
can switch it off at any time and every journal is exactly as Foundry wrote it. **Classic Mode** gives any
player (or you) the stock journal back with one click.

## What it does

### For the GM

- **The Journal button opens the Scroll Case.** No new buttons on the sidebar: the Journal button you already
  use opens the Scroll Case window instead of the Journal tab. (A right-click still pops out Foundry's journal.)
- **Every page as a card.** An image page shows its picture; a text page shows the first picture in it (a
  bestiary entry's portrait) or its first lines. Each card says who can see it: *All players*, *GM only*, or
  the players by name. Three card sizes.
- **Find it fast.** The search box (or **/**) looks through names, captions, sections, journals, folders, file
  names and the text itself, and tells you where it matched (*in text*, *in file name*). Every word you type
  must match somewhere. **Ctrl+Shift+H** opens the finder over the table from anywhere: type a word, arrow to
  the one you want, press **Enter**, and it is on the players' screens.
- **Pictures not yet in a journal.** The finder and the *Not in a journal* view also list the pictures in your
  world's asset folders that no page uses yet (handouts, maps, portraits). Show one straight away, or add it to
  a *Handouts* journal in one click.
- **Show in one click.** Hover a card and press its button, which says what it will do:
  - **Show**: the players who can already see it get it on their screens.
  - **Reveal**: a GM-only page is made visible to the players, so it stays in their Scroll Case, and shown.
    A strip at the top of the window offers **Undo**.
  - **Add & show**: a picture not in a journal becomes a page and is shown.

  The chevron beside it opens the options: everyone or chosen players, keep it visible or show it just once,
  the title and caption, or only the picture of a text page (a monster's portrait without its stat block).
- **Organise with what Foundry already has.** The rail lists your journals by folder, with their sections
  (Foundry's own page categories). Drag a card onto a section to file it there; pin cards for next session's
  shortlist. *Visible to players*, *GM only*, *Recently shown* and *Pinned* views sit at the top.
- **The detail panel.** Click a card for the picture large, where it lives, its section, who can see it (player
  by player), when you last showed it and *Show again* to the same players, *Open in journal* for editing, and
  a copyable link.

### For the players

- **Their Journal button opens their Scroll Case**: everything the GM has given them, *Recently shown* first,
  anything they haven't opened yet marked **New**.
- **The Reader.** Clicking a card, or being shown something by the GM, opens a simple window with just that
  page: its name, its picture and its text. No page list, no journal around it. It updates when the GM edits
  the page, and it never shows the GM's secret sections.
- A player who prefers Foundry's journal turns on **Classic Mode** for themselves; a GM's Show then reaches them
  the way Foundry's own Show does.

## What it writes, and where

Scroll Case only ever makes changes Foundry's own journal makes:

| What | Where it is kept | With the module off |
| --- | --- | --- |
| Who can see a page | the page's ownership, exactly as the stock dialog writes it | unchanged, Foundry shows it the same |
| A page's section | the page's category | unchanged |
| A picture added to the Handouts journal | an ordinary image page | an ordinary page |
| Pins, *Recently shown*, *New*, your view and card size | your browser's local storage | simply forgotten |

No flags, no documents of its own, no patched classes. A Show is a message on the module's own socket channel;
nothing about it is stored.

## Installation

In Foundry's *Install Module* dialog, paste the manifest URL:

```
https://github.com/Txpple/fvtt-mod-scrollcase/releases/latest/download/module.json
```

Requires Foundry VTT v14 (verified on 14.369). It works with any game system and needs no other module.

## Settings

*Game Settings → Configure Settings → Open Roll 5e: Scroll Case.*

| Setting | Scope | Default | What it does |
| --- | --- | --- | --- |
| Enabled | world | on | Off: the Journal button is Foundry's, and nothing of the module's is drawn (reload). |
| Classic Mode | per user | off | On: the Journal button opens Foundry's own Journal tab for this user. |
| Show keeps it visible | world | on | A Show also makes the page visible to the players it went to. The Show options can choose either way each time. |
| Asset folders | world | the world's `assets/handouts`, `assets/journal`, `assets/maps`, `assets/portraits` | Where *Not in a journal* looks, one folder per line or separated by commas. |
| Handouts journal | world | Handouts | The journal *Add to the Handouts journal* puts a picture in, made (GM only) the first time. |

The finder's key is under *Configure Controls*.

## For module authors

- `scrollcase.shown(page, users, src)` fires on the showing client after a Show (`page` is null for a picture
  not in a journal).
- `game.modules.get("fvtt-mod-scrollcase").api`: `open({ key, opts })` (the window, a card picked),
  `finder()`, `classic(on)`, `memory` (this browser's record), `show` (the write layer: `setVisible`,
  `showPage`, `showFile`, `undoReveal`, …).

## Development

No build step: the module is plain ES modules loaded from `scripts/`. `npm install` once; `npm run verify` is
the gate (Biome and the unit tests of `scripts/decide/`). `tools/live-check.mjs --walk` drives a GM page and a
temporary player page on a local test world, and `tools/shots.mjs <dir>` screenshots the interface's states;
both refuse to run anywhere but a local sandbox (`FOUNDRY_HOST=local`) and use the sibling MCP repo
(`fvtt-mcp-dnd5e`) as a dev dependency.

Contributions are welcome as issues.

<!-- openroll5e:family -->
<!-- /openroll5e:family -->

## License

MIT. See [LICENSE](LICENSE).

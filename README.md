# Open Roll 5e: Scroll Case

> **Retired.** Scroll Case is now the journal case of
> [Open Roll 5e: Card Catalogue](https://github.com/Txpple/fvtt-mod-cardcatalogue), which carries every behaviour
> below over whole, with the scenes, the actors and the items beside it. Install Card Catalogue instead: its first
> load carries Scroll Case's settings, each browser's history and its page links over. This repository is archived;
> 1.0.4 was the last release.

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
  (Foundry's own page categories). Drag a card onto a section to file it there. *All*, *Visible to players*,
  *GM only* and *Not in a journal* sit at the top. Pin cards for next session's shortlist: the finder lists the
  pins and what you showed last before you type.
- **The detail panel.** Click a card for the picture large, where it lives, its section, who can see it (player
  by player), when you last showed it and *Show again* to the same players, *Open in journal* for editing, and
  two links to copy: Foundry's own `@UUID` link, to paste into a journal, a description or chat, and a web link.
- **A web link to a page.** `https://<your game>/game?page=<the page's id>` opens the page in the Reader for
  anyone who can see it. Someone not logged in gets the join screen first, and Foundry brings them back to the
  page once they join. Anyone else gets a notice and nothing opens. The link holds no copy of the page: it is
  always read live from the world, so it never goes stale and never shows a secret section to a player.
- **Export what you see.** The export button beside the heading saves the cards in view as a JSON file, in their
  order, with the view, the type and the search applied: each page's name, journal, folder, section, caption and
  text (as plain text and as HTML). Pictures are left out; an image, video or PDF page gives its file path.

### For the players

- **Their Journal button opens their Scroll Case**: everything the GM has given them under *All*,
  and *New* for anything they haven't opened yet.
- **The Reader.** Clicking a card, or being shown something by the GM, opens a simple window with just that
  page: its name, its picture and its text. No page list, no journal around it. It updates when the GM edits
  the page, and it never shows the GM's secret sections.
- **Export** works for players too: what they can see, without the GM's secret sections.
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
  `finder()`, `classic(on)`, `link(page)` (a page's web link), `memory` (this browser's record), `show` (the write layer: `setVisible`,
  `showPage`, `showFile`, `undoReveal`, …).

## Development

No build step: the module is plain ES modules loaded from `scripts/`. `npm install` once; `npm run verify` is
the gate (Biome and the unit tests of `scripts/decide/`). `tools/live-check.mjs --walk` drives a GM page and a
temporary player page on a local test world, and `tools/shots.mjs <dir>` screenshots the interface's states;
both refuse to run anywhere but a local sandbox (`FOUNDRY_HOST=local`) and use the sibling MCP repo
(`fvtt-mcp-dnd5e`) as a dev dependency.

Contributions are welcome as issues.

<!-- openroll5e:family -->
## Part of Open Roll 5e

Scroll Case is one of the Open Roll 5e modules for Foundry VTT, a suite built for one D&D 5e table and
shared. Each module installs and works on its own and none needs another; together they cover the
table from the fog of war to the loot. The other modules:

- [Open Roll 5e: Autoexplore](https://github.com/Txpple/fvtt-mod-autoexplore): lets a scene start fully explored, so the whole map shows through the fog of war while tokens still need line of sight.
- [Open Roll 5e: By the Books](https://github.com/Txpple/fvtt-mod-bythebooks): the 2024 rules played from the sheet: a hit rolls and applies its own damage, saves resolve themselves, reactions hold, concentration is tracked, and rests, senses, sizes and lights follow the book. Every rule that rides a use or an effect in the 2024 core books, Heroes of Faerûn, Arcana Unleashed and Ravenloft: The Horrors Within, each step with a receipt and a revert; offered, never enforced.
- [Open Roll 5e: Combat Plus](https://github.com/Txpple/fvtt-mod-combatplus): automates the chores of running a fight: combat music, an initiative gate, an out-of-turn movement block, defeated marking at 0 HP and turn alerts.
- [Open Roll 5e: Errata](https://github.com/Txpple/fvtt-mod-errata5e): corrects, in memory, bugs in the premium D&D 2024 books, the dnd5e system and Foundry itself, each fix held until the vendor ships its own.
- [Open Roll 5e: FX Studio](https://github.com/Txpple/fvtt-mod-fxstudio): visual and sound effects for dnd5e, played from what actually happened at the table, with about a thousand stock FX and a window for authoring your own.
- [Open Roll 5e: Loot Shelf](https://github.com/Txpple/fvtt-mod-lootshelf): loot chests and merchant shelves that players can take from, buy from and sell to without owning them, with a receipt for every trade.
- [Open Roll 5e: Open Server](https://github.com/Txpple/fvtt-mod-openserver): for hosted worlds: clears the startup pause so players can play before the GM arrives, and gives every user a one-click jump to their character's token, and their familiar's, from the Players list.
- [Open Roll 5e: Party Stash](https://github.com/Txpple/fvtt-mod-partystash): makes a dnd5e Group actor's inventory a working party stash: drags move instead of copying, coin moves through a dialog, and every transfer posts a receipt.
- [Open Roll 5e: Area Sounds](https://github.com/Txpple/fvtt-mod-areasounds): background sound for scenes: random one-shots with silence between them, seamless crossfaded loops, day and night gating, and quiet during combat.
- [Open Roll 5e: Token Art](https://github.com/Txpple/fvtt-mod-tokenart): gives every token the look of its state, ready, in combat or dead, each a file named beside the base art, with nothing to configure.
- [Open Roll 5e: Clue Board](https://github.com/Txpple/fvtt-mod-clueboard): keeps the party's Mysteries: every clue the GM hands them, stamped with where it was found and who has read it, sorted into the questions the party names.

Three MCP servers for [Claude Code](https://claude.com/claude-code) complete the suite:

- [fvtt-mcp-dnd5e](https://github.com/Txpple/fvtt-mcp-dnd5e): builds D&D 5e content in a live Foundry world from Claude Code: a stat block becomes a complete NPC, a map image a walled and lit scene, an adventure its journals, tables and handouts.
- [fvtt-mcp-imagegen](https://github.com/Txpple/fvtt-mcp-imagegen): makes the art with Google's Gemini image models: icons, tokens, props, portraits and illustrations, token redresses and restyles, battlemap and overland-map repaints, and the illustrated session records, all grounded in what the world already shows.
- [fvtt-mcp-sessionscribe](https://github.com/Txpple/fvtt-mcp-sessionscribe): turns a session's Discord recording and Foundry chat log into its record. Its end-to-end `session-scribe` skill drives the server from the Craig link to a speaker-labelled transcript, a fully illustrated player recap, combat statistics, GM notes and a party snapshot.

Issues are welcome on every repo in the family; pull requests are not accepted, since each is one
author's design for one table, shared because it might suit yours. How they fit together is mapped in [fvtt-suite-openroll5e](https://github.com/Txpple/fvtt-suite-openroll5e).
<!-- /openroll5e:family -->

## License

MIT. See [LICENSE](LICENSE).

# Open Roll 5e: Handouts

A Foundry VTT module that turns the journal into a library of cards: every page with its picture, a search
that finds a handout by any word it is known by, and **Show** in one click. It is a skin over Foundry's own
journal, not a replacement: it keeps no data of its own in the world, and **Classic Mode** puts the stock
journal back on any client at any time. Switch it off and every journal is exactly as Foundry wrote it.

**0.1.0**, unreleased. The plan is `docs/plans/handouts.md` in the suite repo.

## How it works

- **The Journal button opens Handouts.** The sidebar's own Journal button (a click or a middle click) opens the
  Handouts window instead of the Journal tab; nothing is added to the sidebar. A right-click still pops out
  Foundry's journal, and if the window ever fails to open, the stock tab opens instead. **Classic Mode**, a
  button in the window, makes the Journal button Foundry's again on this client; the stock Journal tab then has a
  **Handouts** button to come back.
- **Cards.** One card per journal page: an image page's picture, a text page's first picture (a bestiary
  entry's portrait), else its first lines. Each card says who can see it (*All players*, *GM only*, or the
  players' names). Three sizes; a pin on each card.
- **Search.** The box across the top (or **/**) matches a page's name, caption, section, journal, folder, file
  name and text, and says where it matched (*in file name*, *in text*). Every word must match somewhere. In a
  narrower view, it offers the matches outside it.
- **The rail.** *All*, *Visible to players*, *GM only*, *Recently shown*, *Pinned*, *Not in a journal*, then the
  journals by folder with their sections. Drop a card on a section of its own journal to file it there, on its
  journal to take it out of its section, on *Pinned* to pin it.
- **Show.** Hover a card and press its button. It says what it will do: **Show** (to every connected player, as
  Foundry shows it: an image as the image popout, anything else as the journal open on that page), **Reveal** (the
  page is not yet visible to every player: it is made visible, so it stays in their Handouts, then shown; the
  *Show keeps it visible* setting), or **Add & show** (a picture not in a journal). A reveal leaves a strip at the
  top with **Undo**, which puts back who can open the page, unless it has changed since. The chevron opens the
  options: everyone or picked players, keep it or show it once, the title and the caption, or just the picture of
  a text page.
- **The detail panel.** Click a card: the picture large, where it lives, its section (or a new one), *Players can
  see* (everyone, or player by player: the page's own ownership), when this browser last showed it and *Show
  again* to the same players, *Show the picture* for a text page with one, *Pin*, *Open in journal* for editing,
  and *Copy link* (its `@UUID`). Enter or a second click opens it in the Reader.
- **The Reader.** One page, simply: its name, its picture and its text in a plain window, with no page list and
  no journal around it (a PDF opens in the journal). It follows the page as it is edited, and a player's never
  shows a secret section.
- **Not in a journal.** The pictures in the world's asset folders that no page uses yet (handouts, journal
  images, maps, portraits; the *Asset folders* setting). The search in *All* finds them too. Show one as a bare
  popout, or **Add to the Handouts journal**: an ordinary image page, GM only until shown.
- **The finder.** **Ctrl+Shift+H** opens a search box over the table: type a word, pick with the arrows,
  **Enter** shows it to everyone (the row says when that reveals it). Shift+Enter opens the Show options,
  Ctrl+Enter opens it in the journal, Escape clears and then closes. Empty, it lists the pins and what was shown
  last.
- **Players.** The Journal button opens the player's own Handouts: what they can see, *Recently shown* first
  (what the GM showed them, heard from Foundry's own show events), the unopened marked **New**, *Mark all seen*.
  A click opens the page in the Reader. A player never sees text from a page's unrevealed secret sections, nor the name or
  folder of a journal hidden from them. Players have Classic Mode too.

### What it writes, and where

| What | Where | Off, or another browser |
| --- | --- | --- |
| Who can see a page | the page's `ownership`, as the stock dialog writes it | unchanged |
| A page's section | the page's `category` (and a new section is a journal category) | unchanged |
| A picture added | a new image page in the Handouts journal | an ordinary page |
| Pins, *Recently shown*, *New*, the view, the type and the card size | this browser's local storage | gone with the browser |

Nothing else: no flags, no documents of the module's own, no socket of its own, no class patched. Showing a text
page opens it on the GM's own screen too: that is Foundry's Show.

## Installation

Not released yet. When it is, paste the manifest URL into Foundry's *Install Module* dialog:

```
https://github.com/Txpple/fvtt-mod-handouts/releases/latest/download/module.json
```

Requires Foundry VTT v14 (verified on 14.369). Works with any system; no other dependencies.

## Settings

*Game Settings → Configure Settings → Open Roll 5e: Handouts.*

| Setting | Scope | Default | What it does |
| --- | --- | --- | --- |
| Enabled | world | on | Off: the Journal button is Foundry's, and nothing of the module's is drawn (reload). |
| Classic Mode | client | off | On: the Journal button opens Foundry's Journal tab on this client. |
| Show keeps it visible | world | on | Show also makes the page visible to the players it was shown to. |
| Asset folders | world | (the world's four) | Where *Not in a journal* looks, one folder per line or comma. |
| Handouts journal | world | Handouts | Where *Add to the Handouts journal* puts a new image page. |

The finder's key is under *Configure Controls*.

## Hooks and API

- `handouts.shown(page, users, src)` fires on the showing client after a Show (`page` null for a bare file).
- `game.modules.get("fvtt-mod-handouts").api`: `open({ key, opts })`, `finder()`, `classic(on)`, `memory`,
  `show` (the write layer: `setVisible`, `showPage`, `showFile`, `undoReveal`, …).

## Development

No build step: plain ES modules from `scripts/`. `npm install` once; `npm run verify` is the gate (Biome and the
unit tests of `scripts/decide/`). The live check, `FOUNDRY_HOST=local node tools/live-check.mjs --walk`, drives
a GM page and a temporary player page on the sandbox and cleans up after itself; `FOUNDRY_HOST=local node
tools/shots.mjs <dir>` writes screenshots of 24 states and an audit of every card's words. Both refuse any host
but the local sandbox, and need the MCP repo cloned beside this one (`fvtt-mcp-dnd5e`, a dev dependency) with
its `.env`.

<!-- openroll5e:family -->
<!-- /openroll5e:family -->

## License

MIT. See [LICENSE](LICENSE).

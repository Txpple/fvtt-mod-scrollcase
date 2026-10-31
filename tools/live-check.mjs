// The live check on a real world (the local sandbox): a GM page (the bridge user) and a temporary
// player page, every fact read from the world. Clue Board's in shape.
//
//   FOUNDRY_HOST=local node tools/live-check.mjs                 # the takeover and the window, nothing written
//   FOUNDRY_HOST=local node tools/live-check.mjs --walk [--shots <dir>]
//
// With --walk, the GM page makes a scratch journal (an image page and a text page, GM only), sets
// who can see the image page three ways and reads the ownership back, files the text page under a
// new section, keeps a file as a handout (into a scratch Handouts journal the setting names for
// the run), and has a temporary player connect: the player's window lists only what they can see,
// the GM's Show reaches the player as Foundry's popout and lands in their Recently shown, marked
// New. Classic Mode is switched on and off through the Journal button and the directory's way
// back. The scratch journals, the temp user and the settings go back in `finally`.
import { Foundry, foundryConfig, loadEnv } from "fvtt-mcp-dnd5e/client";

if (process.env.FOUNDRY_HOST !== "local") {
  console.error("The live check writes to the world it joins: run it on the sandbox only, with FOUNDRY_HOST=local.");
  process.exit(2);
}

const env = loadEnv();
const MODULE_ID = "fvtt-mod-handouts";
const TEMP_USER = "ZZ-HDT Player";
const SCRATCH = "ZZ-HDT Scratch";
const SCRATCH_KEEP = "ZZ-HDT Handouts";

const arg = n => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : null;
};
const walk = process.argv.includes("--walk");
const shots = arg("shots");

let fails = 0;
const assert = (cond, msg) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fails++;
};
function watch(f, label, sink) {
  const page = f.page;
  if (!page) return;
  page.on("console", msg => {
    const text = msg.text();
    const type = msg.type();
    if (type === "error" || type === "warning" || /handouts/i.test(text)) sink.push(`[${label} ${type}] ${text}`);
  });
  page.on("pageerror", err => sink.push(`[${label} pageerror] ${err?.message ?? err}`));
  page.on("response", res => {
    if (res.status() >= 400) sink.push(`[${label} http ${res.status()}] ${res.url()}`);
  });
}

let cleanup = async () => {};
setTimeout(async () => {
  console.error("[handouts] WATCHDOG: 240s elapsed, cleaning up and aborting");
  await cleanup().catch(() => {});
  process.exit(3);
}, 240_000).unref();

const lines = [];
const f = new Foundry(foundryConfig(env));
console.log("[handouts] connecting as the GM…");
await f.connect();
watch(f, "gm", lines);
await f.page.setViewportSize?.({ width: 1600, height: 1000 }).catch(() => {});

let temp = null;
let fp = null;
let prior = null;
cleanup = async () => {
  cleanup = async () => {};
  if (fp) await fp.disconnect?.().catch(() => {});
  await f
    .evaluate(
      async ({ id, scratch, keep, userName, prior }) => {
        for (const j of game.journal.filter(j => j.name === scratch || j.name === keep)) await j.delete();
        for (const u of game.users.filter(u => u.name === userName)) await u.delete();
        if (prior) {
          await game.settings.set(id, "handoutsJournal", prior.handoutsJournal);
          await game.settings.set(id, "classic", prior.classic);
        }
        for (const app of [...foundry.applications.instances.values()]) {
          if (["handouts-library", "handouts-finder"].includes(app.id) || app.constructor.name === "ImagePopout") await app.close();
        }
      },
      { id: MODULE_ID, scratch: SCRATCH, keep: SCRATCH_KEEP, userName: TEMP_USER, prior }
    )
    .catch(err => console.log(`  cleanup: ${err?.message ?? err}`));
  await f.disconnect?.().catch(() => {});
};

const settle = ms => new Promise(r => setTimeout(r, ms));

try {
  // --- A. the takeover ----------------------------------------------------------------------
  console.log("# A. the Journal button opens Handouts");
  const A = await f.evaluate(async id => {
    const m = game.modules.get(id);
    await game.settings.set(id, "classic", false);
    for (const app of [...foundry.applications.instances.values()]) if (app.id === "handouts-library") await app.close();
    const before = { tab: ui.sidebar.tabGroups.primary, expanded: ui.sidebar.expanded };
    const strip = [...document.querySelectorAll("#sidebar-tabs [data-tab], #sidebar nav.tabs [data-tab]")].map(b => b.dataset.tab);
    const button = document.querySelector('#sidebar-tabs [data-tab="journal"]');
    button?.click();
    let win = null;
    for (let i = 0; i < 40 && !win?.rendered; i++) {
      await new Promise(r => setTimeout(r, 100));
      win = foundry.applications.instances.get("handouts-library");
    }
    const after = { tab: ui.sidebar.tabGroups.primary, expanded: ui.sidebar.expanded };
    const el = win?.element;
    const pages = game.journal.contents.reduce((n, j) => n + j.pages.size, 0);
    for (let i = 0; i < 60 && el?.querySelector(".hdt-loading"); i++) await new Promise(r => setTimeout(r, 150));
    // A middle click on the Journal button is the sidebar's too: it must open Handouts, not the tab.
    await win?.close();
    button?.dispatchEvent(new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }));
    let mid = null;
    for (let i = 0; i < 30 && !mid?.rendered; i++) {
      await new Promise(r => setTimeout(r, 100));
      mid = foundry.applications.instances.get("handouts-library");
    }
    const midStill = ui.sidebar.tabGroups.primary === before.tab && ui.sidebar.expanded === before.expanded;
    return {
      middle: !!mid?.rendered && midStill,
      active: !!m?.active,
      version: m?.version,
      api: !!m?.api,
      keybinding: !!game.keybindings.actions.get(`${id}.finder`),
      strip,
      opened: !!win?.rendered,
      sidebarStill: before.tab === after.tab && before.expanded === after.expanded,
      cards: el?.querySelectorAll(".hdt-card").length ?? 0,
      pageCards: el?.querySelectorAll(".hdt-card:not([data-loose])").length ?? 0,
      fileCards: el?.querySelectorAll(".hdt-card[data-loose]").length ?? 0,
      pages,
      classicButton: !!el?.querySelector('[data-action="classic"]'),
      rail: [...(el?.querySelectorAll(".hdt-rail .hdt-row .n") ?? [])].map(n => n.textContent.trim()),
      noNewStripButton: strip.length === new Set(strip).size
    };
  }, MODULE_ID);
  assert(A.active && A.api, `the module is active, its API set (v${A.version})`);
  assert(A.keybinding, "the finder's keybinding is registered");
  assert(A.opened, "a click on the Journal button opens the Handouts window");
  assert(A.sidebarStill, "the sidebar did not switch tabs or expand");
  assert(A.middle, "a middle click on the Journal button opens Handouts too, the sidebar unchanged");
  assert(A.pageCards === A.pages, `one card per journal page (${A.pageCards} of ${A.pages})`);
  assert(A.fileCards > 0, `the asset folders give file cards (${A.fileCards})`);
  assert(A.classicButton, "the window carries Classic Mode");
  console.log(`  rail: ${A.rail.join(" | ")}`);

  // --- B. the search ------------------------------------------------------------------------
  console.log("# B. the search");
  const B = await f.evaluate(async () => {
    const win = foundry.applications.instances.get("handouts-library");
    const input = win.element.querySelector("input[name=search]");
    const type = async q => {
      input.value = q;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(r => setTimeout(r, 50));
      return [...win.element.querySelectorAll(".hdt-card:not([hidden])")].map(c => ({
        name: c.querySelector(".hdt-nm span")?.textContent.trim(),
        why: c.querySelector(".hdt-why")?.textContent.trim()
      }));
    };
    const maze = await type("maze");
    const portrait = await type("portraits ysolde");
    const none = await type("zzqqxx-nothing");
    const empty = win.element.querySelector(".hdt-empty");
    const emptyShown = empty && !empty.hidden;
    const count = win.element.querySelector(".hdt-count")?.textContent;
    await type("");
    return { maze, portrait, noneN: none.length, emptyShown, count };
  });
  assert(B.maze.length > 0, `"maze" finds ${B.maze.map(c => c.name).join(", ")}`);
  assert(B.portrait.some(c => /ysolde/i.test(c.name) && c.why), `"portraits ysolde" finds a file by its folder (${B.portrait.map(c => `${c.name} [${c.why}]`).join(", ")})`);
  assert(B.noneN === 0 && B.emptyShown, "a query with no match hides every card and says so");

  if (walk) {
    // --- C. the writes, on a scratch journal ----------------------------------------------
    console.log("# C. who can see it, a section, a kept file (scratch journal)");
    prior = await f.evaluate(id => ({ handoutsJournal: game.settings.get(id, "handoutsJournal"), classic: game.settings.get(id, "classic") }), MODULE_ID);
    temp = await f.evaluate(async userName => {
      const user = game.users.find(u => u.name === userName) ?? (await User.implementation.create({ name: userName, role: CONST.USER_ROLES.PLAYER }));
      return { userId: user.id };
    }, TEMP_USER);
    const C = await f.evaluate(
      async ({ id, scratch, keep, userId }) => {
        const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
        for (const j of game.journal.filter(j => j.name === scratch || j.name === keep)) await j.delete();
        await game.settings.set(id, "handoutsJournal", keep);
        const img = game.journal.contents.flatMap(j => j.pages.contents).find(p => p.type === "image" && p.src)?.src;
        const entry = await CONFIG.JournalEntry.documentClass.create({
          name: scratch,
          ownership: { default: L.NONE },
          pages: [
            { name: "ZZ-HDT Picture", type: "image", src: img },
            {
              name: "ZZ-HDT Letter",
              type: "text",
              text: { content: '<p>A letter for the <em>check</em>.</p><section class="secret" id="s1"><p>ZZSECRETWORD <img src="icons/svg/skull.svg"></p></section>' }
            }
          ]
        });
        const picture = entry.pages.find(p => p.type === "image");
        const letter = entry.pages.find(p => p.type === "text");
        const win = foundry.applications.instances.get("handouts-library");
        const pageCardsPicture = uuid => win.element.querySelector(`.hdt-card[data-key="${uuid}"] .hdt-thumb img`);
        const wait = async pred => {
          for (let i = 0; i < 40; i++) {
            if (pred()) return true;
            await new Promise(r => setTimeout(r, 100));
          }
          return false;
        };
        const players = game.users.filter(u => !u.isGM).map(u => u.id);
        const sees = p => players.filter(u => p.testUserPermission(game.users.get(u), "OBSERVER"));
        const out = {};
        // the API's way to the detail panel: pick the card
        win.select(picture.uuid);
        await win.render();
        out.detail = !!win.element.querySelector(`.hdt-detail[data-key="${picture.uuid}"]`);
        out.startHidden = sees(picture).length === 0;
        // one player, by the detail's toggle
        win.element.querySelector(`.hdt-detail [data-action="seeUser"][data-user="${userId}"]`)?.click();
        await wait(() => picture.testUserPermission(game.users.get(userId), "OBSERVER"));
        out.onlyTemp = JSON.stringify(sees(picture)) === JSON.stringify([userId]);
        out.mapOne = { ...picture._source.ownership };
        // everyone
        await wait(() => win.element.querySelector('.hdt-detail [data-action="seeAll"]'));
        win.element.querySelector('.hdt-detail [data-action="seeAll"]')?.click();
        await wait(() => picture._source.ownership.default === L.OBSERVER);
        out.all = sees(picture).length === players.length;
        out.mapAll = { ...picture._source.ownership };
        // no one again
        await wait(() => win.element.querySelector('.hdt-detail [data-action="seeAll"].on'));
        win.element.querySelector('.hdt-detail [data-action="seeAll"]')?.click();
        await wait(() => sees(picture).length === 0);
        out.none = sees(picture).length === 0;
        out.mapNone = { ...picture._source.ownership };
        out.letterUntouched = letter.testUserPermission(game.users.get(userId), "OBSERVER") === false;
        // The letter, visible to the temp player for D: its secret section must never reach them.
        await game.modules.get(id).api.show.setVisible(letter, [userId]);
        out.gmLetterPicture = await wait(() => !!pageCardsPicture(letter.uuid));
        // Just the picture of a text page: the page's ownership is never touched.
        const beforePic = JSON.stringify(letter._source.ownership);
        await game.modules.get(id).api.show.showPage(letter, { keep: true, picture: "icons/svg/skull.svg" });
        out.pictureOnlyKept = JSON.stringify(letter._source.ownership) === beforePic;
        // a section, made and used
        const cat = (await entry.createEmbeddedDocuments("JournalEntryCategory", [{ name: "ZZ Section", sort: 100000 }]))[0];
        await letter.update({ category: cat.id });
        await new Promise(r => setTimeout(r, 400));
        out.sectionRow = !!win.element.querySelector(`.hdt-row.hdt-cat[data-cat="${cat.id}"]`);
        out.sectionSub = win.element.querySelector(`.hdt-card[data-key="${letter.uuid}"] .hdt-where`)?.textContent.trim();
        // a kept file
        const api = game.modules.get(id).api;
        out.keepBefore = !game.journal.getName(keep);
        win.element.querySelector('.hdt-row[data-view="loose"]')?.click();
        await new Promise(r => setTimeout(r, 400));
        const loose = win.element.querySelector(".hdt-card[data-loose]")?.dataset.key;
        win.select(loose);
        await win.render();
        win.element.querySelector('.hdt-detail [data-action="keep"]')?.click();
        await wait(() => game.journal.getName(keep)?.pages.size === 1);
        const kept = game.journal.getName(keep)?.pages.contents[0];
        out.kept = kept ? { name: kept.name, type: kept.type, src: kept.src === loose, hidden: sees(kept).length === 0 } : null;
        out.keptGone = await wait(() => !win.element.querySelector(`.hdt-card[data-loose][data-key="${CSS.escape(loose)}"]`));
        out.api = Object.keys(api);
        return { ...out, pictureUuid: picture.uuid, letterUuid: letter.uuid, catId: cat.id };
      },
      { id: MODULE_ID, scratch: SCRATCH, keep: SCRATCH_KEEP, userId: temp.userId }
    );
    assert(C.detail, "picking a card opens its detail panel");
    assert(C.startHidden, "the scratch picture starts GM only");
    assert(C.onlyTemp, `one player's toggle: only that player can see it (${JSON.stringify(C.mapOne)})`);
    assert(C.all, `Everyone: every player can see it (${JSON.stringify(C.mapAll)})`);
    assert(C.none, `Everyone off: no player can see it (${JSON.stringify(C.mapNone)})`);
    assert(C.letterUntouched, "the other page of the journal is untouched");
    assert(C.pictureOnlyKept, "Show the picture of a text page leaves who can open the page as it was");
    assert(C.gmLetterPicture, "the GM's card shows the picture inside the page's secret section (the GM owns it)");
    assert(C.sectionRow && /ZZ Section/.test(C.sectionSub ?? ""), `a section shows in the rail and on the card (${C.sectionSub})`);
    assert(C.keepBefore && C.kept?.type === "image" && C.kept.src && C.kept.hidden, `Keep as a handout makes a GM-only image page (${C.kept?.name})`);
    assert(C.keptGone, "the kept file is no longer listed as on no page");

    // --- D. a player ---------------------------------------------------------------------
    console.log("# D. a player's Handouts, and a Show reaching them");
    fp = new Foundry({ ...foundryConfig(env), user: TEMP_USER, password: "" });
    console.log("[handouts] connecting as the player…");
    await fp.connect();
    watch(fp, "player", lines);
    const D1 = await fp.evaluate(async () => {
      document.querySelector('#sidebar-tabs [data-tab="journal"]')?.click();
      let win = null;
      for (let i = 0; i < 40 && !win?.rendered; i++) {
        await new Promise(r => setTimeout(r, 100));
        win = foundry.applications.instances.get("handouts-library");
      }
      const visible = game.journal.contents.flatMap(j => j.pages.contents).filter(p => p.testUserPermission(game.user, "OBSERVER")).length;
      const view = win?.element.querySelector(".hdt-row.on")?.dataset.view;
      win?.element.querySelector('.hdt-row[data-view="all"]')?.click();
      await new Promise(r => setTimeout(r, 300));
      const letter = game.journal.contents.flatMap(j => j.pages.contents).find(p => p.name === "ZZ-HDT Letter");
      const letterCard = letter ? win?.element.querySelector(`.hdt-card[data-key="${letter.uuid}"]`) : null;
      const input = win?.element.querySelector("input[name=search]");
      if (input) {
        input.value = "zzsecretword";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise(r => setTimeout(r, 100));
      }
      const secretHits = win?.element.querySelectorAll(".hdt-card:not([hidden])").length ?? -1;
      if (input) {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const secret = {
        listed: !!letterCard,
        inText: /ZZSECRETWORD/i.test(letterCard?.textContent ?? ""),
        picture: !!letterCard?.querySelector(".hdt-thumb img"),
        hits: secretHits,
        inDom: /ZZSECRETWORD/i.test(win?.element.innerHTML ?? "")
      };
      // the "All" view: every page the player can see
      win?.element.querySelector('.hdt-row[data-view="all"]')?.click();
      await new Promise(r => setTimeout(r, 300));
      return {
        opened: !!win?.rendered,
        view,
        cards: win?.element.querySelectorAll(".hdt-card").length ?? 0,
        visible,
        journalsOnClient: game.journal.size,
        noShow: !win?.element.querySelector('[data-action="quickShow"]'),
        noFiles: !win?.element.querySelector(".hdt-card[data-loose]"),
        classic: !!win?.element.querySelector('[data-action="classic"]'),
        secret
      };
    });
    assert(D1.opened, "the player's Journal button opens their Handouts");
    assert(D1.cards === D1.visible, `the player sees exactly the pages they can observe (${D1.cards} of ${D1.visible})`);
    assert(D1.noShow && D1.noFiles, "no Show buttons and no files for a player");
    assert(D1.classic, "the player has Classic Mode too");
    assert(
      D1.secret.listed && !D1.secret.inText && !D1.secret.picture && D1.secret.hits === 0 && !D1.secret.inDom,
      `a page's secret section never reaches the player: not in the card, its picture, the search or the DOM (${JSON.stringify(D1.secret)})`
    );
    console.log(`  journals on the player's client: ${D1.journalsOnClient}`);

    const R = await fp.evaluate(async () => {
      const letter = game.journal.contents.flatMap(j => j.pages.contents).find(p => p.name === "ZZ-HDT Letter");
      const win = foundry.applications.instances.get("handouts-library");
      win.element.querySelector('.hdt-row[data-view="all"]')?.click();
      await new Promise(r => setTimeout(r, 300));
      win.element.querySelector(`.hdt-card[data-key="${letter.uuid}"] [data-action="pick"]`)?.click();
      let reader = null;
      for (let i = 0; i < 40 && !reader?.rendered; i++) {
        await new Promise(r => setTimeout(r, 100));
        reader = foundry.applications.instances.get(`handouts-reader-${letter.id}`);
      }
      const text = reader?.element?.textContent ?? "";
      const sheet = [...foundry.applications.instances.values()].some(a => a.document?.documentName === "JournalEntry" && a.rendered);
      await reader?.close();
      return { opened: !!reader?.rendered || text.length > 0, title: /ZZ-HDT Letter/.test(text), body: /A letter for the/.test(text), secret: /ZZSECRETWORD/.test(text), sheet };
    });
    assert(R.opened && R.title && R.body, "a player's click on a card opens the Reader: the page's name and its text");
    assert(!R.secret, "the Reader never shows the page's secret section to the player");
    assert(!R.sheet, "no journal sheet opens for it");

    await f.evaluate(
      async ({ uuid, userId }) => {
        const page = await fromUuid(uuid);
        const win = foundry.applications.instances.get("handouts-library");
        win.select(uuid, { opts: true });
        await win.render();
        win.element.querySelector(`.hdt-opts [data-action="optUser"][data-user="${userId}"]`)?.click();
        await new Promise(r => setTimeout(r, 300));
        win.element.querySelector('.hdt-opts [data-action="optGo"]')?.click();
        for (let i = 0; i < 40 && !page.testUserPermission(game.users.get(userId), "OBSERVER"); i++) await new Promise(r => setTimeout(r, 100));
      },
      { uuid: C.pictureUuid, userId: temp.userId }
    );
    await settle(1200);
    const D2 = await fp.evaluate(async uuid => {
      const popout = [...foundry.applications.instances.values()].find(a => a.constructor.name === "ImagePopout");
      const record = game.modules.get("fvtt-mod-handouts").api.memory.load();
      const win = foundry.applications.instances.get("handouts-library");
      win?.element.querySelector('.hdt-row[data-view="recent"]')?.click();
      await new Promise(r => setTimeout(r, 400));
      const card = win?.element.querySelector(`.hdt-card[data-key="${uuid}"]`);
      return {
        popout: !!popout,
        popoutTitle: popout?.title ?? popout?.options?.window?.title ?? null,
        recent: record.recent.some(r => r.key === uuid),
        listed: !!card,
        unseen: card?.classList.contains("unseen") ?? false
      };
    }, C.pictureUuid);
    assert(D2.popout, `the GM's Show reaches the player as Foundry's image popout (${D2.popoutTitle})`);
    assert(D2.recent && D2.listed, "it lands in the player's Recently shown");
    assert(!D2.unseen, "not marked New: Foundry already opened it on the player's screen");
    const D3 = await f.evaluate(
      async ({ uuid, userId }) => (await fromUuid(uuid)).testUserPermission(game.users.get(userId), "OBSERVER"),
      { uuid: C.pictureUuid, userId: temp.userId }
    );
    assert(D3, "Keep it in their Handouts left the page visible to that player");
    const D4 = await f.evaluate(
      async ({ uuid, userId }) => {
        const page = await fromUuid(uuid);
        const win = foundry.applications.instances.get("handouts-library");
        const undo = win.element.querySelector('.hdt-reveal [data-action="undo"]');
        undo?.click();
        for (let i = 0; i < 40 && page.testUserPermission(game.users.get(userId), "OBSERVER"); i++) await new Promise(r => setTimeout(r, 100));
        return { offered: !!undo, hidden: !page.testUserPermission(game.users.get(userId), "OBSERVER") };
      },
      { uuid: C.pictureUuid, userId: temp.userId }
    );
    assert(D4.offered && D4.hidden, "Undo puts the page back as it was before the Show");

    // --- E. Classic Mode ---------------------------------------------------------------
    console.log("# E. Classic Mode, there and back");
    const E = await f.evaluate(async id => {
      const win = foundry.applications.instances.get("handouts-library");
      win.element.querySelector('[data-action="classic"]')?.click();
      await new Promise(r => setTimeout(r, 900));
      const classic = game.settings.get(id, "classic");
      const closed = !win.rendered;
      const tab = ui.sidebar.tabGroups.primary;
      const back = document.getElementById("handouts-directory-button");
      // with Classic on, the Journal button is Foundry's again
      ui.sidebar.changeTab("chat", "primary");
      document.querySelector('#sidebar-tabs [data-tab="journal"]')?.click();
      await new Promise(r => setTimeout(r, 500));
      const stockTab = ui.sidebar.tabGroups.primary;
      const stayedClosed = !foundry.applications.instances.get("handouts-library")?.rendered;
      const back2 = document.getElementById("handouts-directory-button");
      back2?.click();
      let reopened = false;
      for (let i = 0; i < 40 && !reopened; i++) {
        await new Promise(r => setTimeout(r, 100));
        reopened = !!foundry.applications.instances.get("handouts-library")?.rendered;
      }
      return { classic, closed, tab, back: !!back, stockTab, stayedClosed, reopened, classicAfter: game.settings.get(id, "classic") };
    }, MODULE_ID);
    assert(E.classic && E.closed && E.tab === "journal", "Classic Mode closes the window and opens Foundry's Journal tab");
    assert(E.back, "the stock directory carries the Handouts button");
    assert(E.stockTab === "journal" && E.stayedClosed, "in Classic Mode the Journal button is Foundry's own");
    assert(E.reopened && E.classicAfter === false, "the directory's Handouts button turns Classic off and opens the window");

    // --- F. the finder -------------------------------------------------------------------
    console.log("# F. the finder");
    const F = await f.evaluate(async uuid => {
      const api = game.modules.get("fvtt-mod-handouts").api;
      await api.finder();
      let app = null;
      for (let i = 0; i < 30 && !app?.rendered; i++) {
        await new Promise(r => setTimeout(r, 100));
        app = foundry.applications.instances.get("handouts-finder");
      }
      const input = app.element.querySelector("input[name=find]");
      const focused = document.activeElement === input;
      input.value = "zz-hdt pic";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(r => setTimeout(r, 100));
      const rows = [...app.element.querySelectorAll(".hdt-res .hdt-res-nm")].map(n => n.textContent);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await new Promise(r => setTimeout(r, 100));
      const cleared = input.value === "";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      return { focused, rows, cleared, closed: !app.rendered, uuid };
    }, C.pictureUuid);
    assert(F.focused, "the finder opens with the caret in its box");
    assert(F.rows.includes("ZZ-HDT Picture"), `typing finds the page (${F.rows.join(", ")})`);
    assert(F.cleared && F.closed, "Escape clears, then closes");
  }

  // --- G. screenshots --------------------------------------------------------------------
  if (shots) {
    console.log(`# G. screenshots into ${shots}`);
    const { mkdirSync } = await import("node:fs");
    mkdirSync(shots, { recursive: true });
    const shot = async (name, fn, arg) => {
      await f.evaluate(fn, arg);
      await settle(700);
      await f.page.screenshot({ path: `${shots}/${name}.png` });
    };
    await shot("1-library", async () => {
      const win = game.modules.get("fvtt-mod-handouts").api.open();
      for (let i = 0; i < 30 && !win.rendered; i++) await new Promise(r => setTimeout(r, 100));
    });
    await shot("2-loose", async () => {
      foundry.applications.instances.get("handouts-library").element.querySelector('.hdt-row[data-view="loose"]')?.click();
    });
    console.log("  written");
  }
} finally {
  await cleanup();
}

console.log("# console");
const ours = lines.filter(l => /handouts/i.test(l) && !/http 404/.test(l) && /error|pageerror/.test(l));
for (const l of lines.filter(l => !/http 404/.test(l)).slice(0, 40)) console.log(`  ${l}`);
assert(ours.length === 0, `no errors of the module's on either page (${ours.length})`);
console.log(fails ? `RED (${fails} failed)` : "GREEN");
process.exit(fails ? 1 : 0);

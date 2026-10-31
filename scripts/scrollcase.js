/**
 * Open Roll 5e: Scroll Case — the entry point (module.json's `esmodules`).
 *
 * A skin over Foundry's journal: the sidebar's own Journal button opens the Scroll Case window (the
 * journal as cards, a search, one-click Show) instead of the Journal tab. Classic Mode, a button in
 * the window, puts the stock Journal back for this client; the stock directory then carries a
 * Scroll Case button to come back. The module keeps no data of its own in the world: every write is
 * one the stock journal makes (show.js), and what only it needs lives in the browser (memory.js).
 * Nothing is patched: the Journal button is intercepted with a listener on the button itself. The
 * plan is the suite's docs/plans/scrollcase.md.
 */

import { log, MODULE_ID, setting, t } from "./common.js";
import { kindOf, LINK_PARAM, linkedPage, mendViewClass, pageLink, withoutLink } from "./decide/scrollcase.js";
import { Finder } from "./finder.js";
import { ScrollCaseWindow, openClassicJournal } from "./library.js";
import * as memory from "./memory.js";
import { Reader } from "./reader.js";
import * as show from "./show.js";

export { MODULE_ID, log, t, setting };

const DIRECTORY_BUTTON = "scrollcase-directory-button";

// A page link's query reaches Foundry's server, which names the body's view class from the whole
// address (`game?page=…`, not `game`): the interface loses its layout. Mended as this script loads,
// before the game draws anything; the link itself is read at `ready`.
try {
  const { remove, add } = mendViewClass(document.body?.classList ?? []);
  if (remove.length) {
    document.body.classList.remove(...remove);
    document.body.classList.add(...add);
  }
} catch (err) {
  log.error("mending the body's view class failed", err);
}

/** The module's window replaces the Journal tab here: enabled for the world, not Classic on this client. */
const takesOver = () => setting("enabled") && !setting("classic");

/* -------------------------------------------------- */
/*  init: the settings, the keybinding, the templates */
/* -------------------------------------------------- */

Hooks.once("init", () => {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, { name: `${MODULE_ID}.settings.${key}.name`, hint: `${MODULE_ID}.settings.${key}.hint`, ...data });
  reg("enabled", { scope: "world", config: true, type: Boolean, default: true, requiresReload: true });
  reg("classic", {
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      ui.journal?.render();
    }
  });
  reg("showKeeps", { scope: "world", config: true, type: Boolean, default: true });
  reg("assetFolders", { scope: "world", config: true, type: String, default: "" });
  reg("handoutsJournal", { scope: "world", config: true, type: String, default: "Handouts" });

  game.keybindings.register(MODULE_ID, "finder", {
    name: `${MODULE_ID}.keys.finder.name`,
    hint: `${MODULE_ID}.keys.finder.hint`,
    editable: [{ key: "KeyH", modifiers: ["Control", "Shift"] }],
    onDown: () => {
      if (!setting("enabled")) return false;
      void Finder.toggle();
      return true;
    },
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  if (!setting("enabled")) return;
  const load = foundry.applications?.handlebars?.loadTemplates ?? loadTemplates;
  load([
    `modules/${MODULE_ID}/templates/library.hbs`,
    `modules/${MODULE_ID}/templates/finder.hbs`,
    `modules/${MODULE_ID}/templates/reader.hbs`
  ]).catch(err =>
    log.error("preloading the templates failed", err)
  );
});

/* -------------------------------------------------- */
/*  The sidebar's Journal button opens Scroll Case       */
/* -------------------------------------------------- */

/**
 * A listener on the Journal button itself, which runs before the click can bubble up to the
 * sidebar's own handler: unless this client is in Classic Mode, it stops the click there and opens
 * the window, so the sidebar never switches or expands. A right-click still reaches the sidebar
 * (its stock popout of the Journal), and Classic Mode lets every click through.
 */
Hooks.on("renderSidebar", app => {
  try {
    if (!setting("enabled")) return;
    const button = app.element?.querySelector('#sidebar-tabs [data-tab="journal"], nav.tabs [data-tab="journal"]');
    if (!button || button.dataset.scrollcase) return;
    button.dataset.scrollcase = "1";
    // The sidebar acts on `click` and on a middle button's `auxclick` alike; a right-click is its popout.
    const open = ev => {
      if (!takesOver() || (ev.type === "click" ? ev.button !== 0 : ev.button !== 1)) return;
      ev.preventDefault();
      ev.stopPropagation();
      // Fail open: whatever goes wrong in the window, the stock journal still opens.
      try {
        ScrollCaseWindow.open();
      } catch (err) {
        log.error("the Scroll Case window failed to open; Foundry's journal opens instead", err);
        openClassicJournal();
      }
    };
    button.addEventListener("click", open);
    button.addEventListener("auxclick", open);
  } catch (err) {
    log.error("taking over the Journal button failed", err);
  }
});

/**
 * In Classic Mode, the stock Journal directory carries one button back to Scroll Case. It switches
 * Classic Mode off for this client and opens the window.
 */
Hooks.on("renderJournalDirectory", (app, html) => {
  try {
    if (!setting("enabled")) return;
    const root = html instanceof HTMLElement ? html : (html?.[0] ?? app.element);
    root?.querySelector(`#${DIRECTORY_BUTTON}`)?.remove();
    if (!setting("classic")) return;
    const actions = root?.querySelector(".header-actions, .directory-header .action-buttons");
    if (!actions) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = DIRECTORY_BUTTON;
    button.className = "scrollcase-directory-button";
    button.innerHTML = `<i class="fa-solid fa-images" inert></i> <span>${t("classic.back")}</span>`;
    button.addEventListener("click", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      await game.settings.set(MODULE_ID, "classic", false);
      ScrollCaseWindow.open();
    });
    actions.append(button);
  } catch (err) {
    log.error("adding the Scroll Case button to the journal directory failed", err);
  }
});

/* -------------------------------------------------- */
/*  The window follows the journal                    */
/* -------------------------------------------------- */

const refresh = () => ScrollCaseWindow.refresh();
for (const doc of ["JournalEntry", "JournalEntryPage", "JournalEntryCategory"]) {
  for (const verb of ["create", "update", "delete"]) Hooks.on(`${verb}${doc}`, refresh);
}
for (const hook of ["createFolder", "updateFolder", "deleteFolder"]) {
  Hooks.on(hook, folder => {
    if (folder.type === "JournalEntry") refresh();
  });
}
// A Reader follows its page: an edit redraws it, a page gone or no longer visible closes it.
Hooks.on("updateJournalEntryPage", page => Reader.refresh(page));
Hooks.on("deleteJournalEntryPage", page => Reader.closeFor(page));
Hooks.on("updateJournalEntry", entry => {
  for (const page of entry.pages) Reader.refresh(page);
});
Hooks.on("userConnected", refresh);
Hooks.on("updateUser", (_user, changes) => {
  if ("role" in changes || "name" in changes || "character" in changes) refresh();
});
Hooks.on("createUser", refresh);
Hooks.on("deleteUser", refresh);

/* -------------------------------------------------- */
/*  ready: what a player is shown, the probe, the API */
/* -------------------------------------------------- */

/**
 * A Show sent from Scroll Case, on a client it is for: the page (or the picture) in the Reader, the GM
 * having shown it so it stays open even without the page's permission. In Classic Mode, or for a
 * PDF the Reader cannot show, it opens as Foundry's own Show would. A player's client records it
 * as shown and seen.
 */
function receiveShow(message, heard) {
  if (message?.action !== "show" || message.from === game.user.id) return;
  if (message.users?.length && !message.users.includes(game.user.id)) return;
  const classic = setting("classic");
  const ImagePopout = foundry.applications?.apps?.ImagePopout;
  const Journal = foundry.documents?.collections?.Journal ?? globalThis.Journal;
  if (message.src) {
    if (classic && ImagePopout) return void new ImagePopout({ src: message.src, window: { title: message.name } }).render({ force: true });
    return void Reader.openFile(message.src, message.name, { title: message.title });
  }
  const page = fromUuidSync(message.uuid, { strict: false });
  if (page?.documentName !== "JournalEntryPage") return;
  const kind = kindOf(page.type);
  if (classic || kind === "pdf") {
    const image = message.picture || (kind === "image" ? page.src : null);
    if (image && ImagePopout) {
      new ImagePopout({ src: image, uuid: message.picture ? undefined : page.uuid, caption: message.caption && !message.picture ? (page.image?.caption ?? "") : "", window: { title: page.name } }).render({ force: true });
    } else void Journal._showEntry(page.uuid, true);
  } else {
    void Reader.open(page, { shown: true, picture: message.picture, caption: message.caption, title: message.title });
  }
  if (!game.user.isGM) heard(page.uuid);
}

/**
 * A link to a page, `/game?page=<uuid>` (Foundry's login carries it through to the game): the page
 * opens as a card would open it, only for a user who may see it; the parameter leaves the address
 * bar either way, so a reload opens nothing.
 */
async function openLinked() {
  if (!new URLSearchParams(window.location.search).has(LINK_PARAM)) return;
  const uuid = linkedPage(window.location.search);
  history.replaceState(history.state, "", withoutLink(window.location.href));
  const page = uuid ? await fromUuid(uuid).catch(() => null) : null;
  if (page?.documentName !== "JournalEntryPage" || !page.testUserPermission(game.user, "OBSERVER")) {
    return void ui.notifications.warn(t("link.unavailable"));
  }
  if (setting("classic") && page.parent.testUserPermission(game.user, "OBSERVER")) show.openInJournal(page);
  else show.openForReading(page);
  if (!game.user.isGM) {
    memory.noteSeen(page.uuid);
    refresh();
  }
}

Hooks.once("ready", () => {
  if (!setting("enabled")) return;

  // What is shown to this player, recorded as shown and seen: a Show from Scroll Case (below), and
  // Foundry's own show events (a GM in Classic Mode), which Foundry opens itself.
  try {
    const heard = uuid => {
      try {
        if (typeof uuid !== "string" || fromUuidSync(uuid, { strict: false })?.documentName !== "JournalEntryPage") return;
        memory.noteShown(uuid, t("show.toYou"));
        memory.noteSeen(uuid);
        refresh();
      } catch (err) {
        log.error("recording a shown handout failed", err);
      }
    };
    if (!game.user.isGM) {
      // Only a page is a handout: a whole journal, a token's or an actor's image shown is left out.
      game.socket.on("showEntry", uuid => heard(uuid));
      game.socket.on("shareImage", data => heard(data?.uuid));
    }
    // A Show from Scroll Case: the Reader on this screen (Foundry's own view in Classic Mode).
    game.socket.on(show.CHANNEL, message => {
      try {
        receiveShow(message, heard);
      } catch (err) {
        log.error("opening a shown handout failed", err);
      }
    });
  } catch (err) {
    log.error("listening for shown handouts failed", err);
  }

  openLinked().catch(err => log.error("opening a linked page failed", err));

  // Foundry v14 bundles module CSS: if a rule of ours does not reach an element, load the sheet.
  try {
    const probe = document.createElement("div");
    probe.className = "scrollcase-css-probe";
    document.body.append(probe);
    const applied = getComputedStyle(probe).flexDirection === "column";
    probe.remove();
    if (!applied && !document.querySelector(`link[data-${MODULE_ID}-fallback]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `modules/${MODULE_ID}/styles/scrollcase.css`;
      link.setAttribute(`data-${MODULE_ID}-fallback`, "true");
      document.head.append(link);
      log.warn("the manifest stylesheet is not in the cascade; loading it directly.");
    }
  } catch (err) {
    log.error("the stylesheet probe failed", err);
  }

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      open: options => ScrollCaseWindow.open(options),
      finder: () => Finder.toggle(),
      classic: async (on = true) => {
        await game.settings.set(MODULE_ID, "classic", !!on);
        if (on) openClassicJournal();
        else ScrollCaseWindow.open();
      },
      link: page => pageLink(window.location.href, page.uuid),
      memory,
      show
    };
  }
});

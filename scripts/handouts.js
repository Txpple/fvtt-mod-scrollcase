/**
 * Open Roll 5e: Handouts — the entry point (module.json's `esmodules`).
 *
 * A skin over Foundry's journal: the sidebar's own Journal button opens the Handouts window (the
 * journal as cards, a search, one-click Show) instead of the Journal tab. Classic Mode, a button in
 * the window, puts the stock Journal back for this client; the stock directory then carries a
 * Handouts button to come back. The module keeps no data of its own in the world: every write is
 * one the stock journal makes (show.js), and what only it needs lives in the browser (memory.js).
 * Nothing is patched: the Journal button is intercepted with a listener on the button itself. The
 * plan is the suite's docs/plans/handouts.md.
 */

import { log, MODULE_ID, setting, t } from "./common.js";
import { Finder } from "./finder.js";
import { HandoutsWindow, openClassicJournal } from "./library.js";
import * as memory from "./memory.js";
import { Reader } from "./reader.js";
import * as show from "./show.js";

export { MODULE_ID, log, t, setting };

const DIRECTORY_BUTTON = "handouts-directory-button";

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
/*  The sidebar's Journal button opens Handouts       */
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
    if (!button || button.dataset.handouts) return;
    button.dataset.handouts = "1";
    // The sidebar acts on `click` and on a middle button's `auxclick` alike; a right-click is its popout.
    const open = ev => {
      if (!takesOver() || (ev.type === "click" ? ev.button !== 0 : ev.button !== 1)) return;
      ev.preventDefault();
      ev.stopPropagation();
      // Fail open: whatever goes wrong in the window, the stock journal still opens.
      try {
        HandoutsWindow.open();
      } catch (err) {
        log.error("the Handouts window failed to open; Foundry's journal opens instead", err);
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
 * In Classic Mode, the stock Journal directory carries one button back to Handouts. It switches
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
    button.className = "handouts-directory-button";
    button.innerHTML = `<i class="fa-solid fa-images" inert></i> <span>${t("classic.back")}</span>`;
    button.addEventListener("click", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      await game.settings.set(MODULE_ID, "classic", false);
      HandoutsWindow.open();
    });
    actions.append(button);
  } catch (err) {
    log.error("adding the Handouts button to the journal directory failed", err);
  }
});

/* -------------------------------------------------- */
/*  The window follows the journal                    */
/* -------------------------------------------------- */

const refresh = () => HandoutsWindow.refresh();
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

Hooks.once("ready", () => {
  if (!setting("enabled")) return;

  // Foundry's own show events, heard as every client hears them: a player's Recently shown.
  // Foundry opens the sheet or the popout itself; this only remembers that it came.
  try {
    if (!game.user.isGM) {
      // Only a page is a handout: a whole journal, a token's or an actor's image shown is left out.
      // Foundry has opened it on this screen: it is recorded as shown and as seen.
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
      game.socket.on("showEntry", uuid => heard(uuid));
      game.socket.on("shareImage", data => heard(data?.uuid));
    }
  } catch (err) {
    log.error("listening for shown handouts failed", err);
  }

  // Foundry v14 bundles module CSS: if a rule of ours does not reach an element, load the sheet.
  try {
    const probe = document.createElement("div");
    probe.className = "handouts-css-probe";
    document.body.append(probe);
    const applied = getComputedStyle(probe).flexDirection === "column";
    probe.remove();
    if (!applied && !document.querySelector(`link[data-${MODULE_ID}-fallback]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `modules/${MODULE_ID}/styles/handouts.css`;
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
      open: options => HandoutsWindow.open(options),
      finder: () => Finder.toggle(),
      classic: async (on = true) => {
        await game.settings.set(MODULE_ID, "classic", !!on);
        if (on) openClassicJournal();
        else HandoutsWindow.open();
      },
      memory,
      show
    };
  }
});

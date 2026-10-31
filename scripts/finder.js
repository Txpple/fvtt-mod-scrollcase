/**
 * The finder: a search box over the table, opened by the keybinding. Empty, it lists the pins and
 * what was shown last; typing narrows to everything with a thumbnail (for a GM, the pictures on no
 * page too), the arrows move, Enter shows the pick to everyone (a player's Enter opens it),
 * Shift+Enter opens the Show options in the library, Ctrl+Enter opens it in the journal, Escape
 * clears and then closes. The list redraws by itself, never the window, so the caret never leaves
 * the box; a click on a row keeps the caret there too.
 */

import { log, MODULE_ID, setting, t } from "./common.js";
import { matchWhy, searchFields } from "./decide/scrollcase.js";
import { fileCards, ScrollCaseWindow, loadFiles, pageCards } from "./library.js";
import * as memory from "./memory.js";
import * as show from "./show.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const RANK = { "": 0, caption: 1, section: 2, journal: 3, folder: 4, file: 5, text: 6 };
const MAX = 14;
const ICON = { text: "fa-file-lines", pdf: "fa-file-pdf", video: "fa-film", image: "fa-image" };

const esc = s => foundry.utils.escapeHTML?.(String(s ?? "")) ?? String(s ?? "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export class Finder extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "scrollcase-finder",
    classes: ["scrollcase-finder"],
    window: { title: `${MODULE_ID}.finder.title`, icon: "fa-solid fa-magnifying-glass", resizable: false, minimizable: false },
    position: { width: 640, height: "auto", top: 90 }
  };

  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/finder.hbs` } };

  static current = null;

  /** Open the finder fresh, or close it when it is open (the key toggles it). */
  static toggle() {
    const app = Finder.current;
    if (app?.rendered) return app.close();
    Finder.current = new Finder();
    return Finder.current.render({ force: true });
  }

  #query = "";
  #at = 0;
  #rows = [];
  #cards = [];

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.isGM = game.user.isGM;
    return context;
  }

  #gather() {
    this.#cards = [...pageCards(), ...fileCards()];
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#gather();
    // The pictures on no page arrive when the asset folders have been read.
    if (game.user.isGM) {
      void loadFiles().then(() => {
        if (!this.rendered) return;
        this.#gather();
        this.#draw();
      });
    }
    const input = this.element.querySelector("input[name=find]");
    input.addEventListener("input", ev => {
      this.#query = ev.currentTarget.value;
      this.#at = 0;
      this.#draw();
    });
    input.addEventListener("keydown", ev => this.#key(ev));
    const list = this.element.querySelector(".hdt-results");
    // A row is not a focus stop: the caret stays in the box, so the keys keep working.
    list.addEventListener("mousedown", ev => ev.preventDefault());
    list.addEventListener("click", ev => {
      const row = ev.target.closest("[data-index]");
      if (!row) return;
      this.#at = Number(row.dataset.index);
      if (ev.detail >= 2) void this.#act("show");
      else this.#draw();
    });
    this.#draw();
    if (options.isFirstRender) {
      const width = Math.min(640, window.innerWidth - 32);
      this.setPosition({ width, left: Math.max(16, (window.innerWidth - width) / 2), top: 90 });
    }
    input.focus();
  }

  #results() {
    const q = this.#query.trim();
    const record = memory.load();
    if (!q) {
      const byKey = new Map(this.#cards.map(c => [c.key, c]));
      const pinned = record.pins.map(k => byKey.get(k)).filter(Boolean);
      const recent = record.recent
        .map(r => byKey.get(r.key))
        .filter(c => c && !pinned.includes(c))
        .slice(0, 6);
      return [
        { label: t("finder.pinned"), rows: pinned.map(card => ({ card, why: "" })) },
        { label: t("finder.recent"), rows: recent.map(card => ({ card, why: "" })) }
      ].filter(g => g.rows.length);
    }
    const hits = [];
    for (const card of this.#cards) {
      const why = matchWhy(searchFields(card), q);
      // Pages before files, then the best field, then by name.
      if (why !== null) hits.push({ card, why, rank: (card.loose ? 10 : 0) + (RANK[why] ?? 9) });
    }
    hits.sort((a, b) => a.rank - b.rank || a.card.name.localeCompare(b.card.name, game.i18n.lang));
    const label = hits.length > MAX ? t("finder.matchesMore", { n: hits.length, shown: MAX }) : t("finder.matches", { n: hits.length });
    return [{ label, rows: hits.slice(0, MAX) }];
  }

  #draw() {
    const groups = this.#results();
    this.#rows = groups.flatMap(g => g.rows);
    if (this.#at >= this.#rows.length) this.#at = Math.max(0, this.#rows.length - 1);
    const gm = game.user.isGM;
    const keeps = setting("showKeeps");
    let i = 0;
    const html = groups
      .map(g => {
        const rows = g.rows
          .map(({ card, why }) => {
            const index = i++;
            const on = index === this.#at;
            const hidden = gm && !card.loose && show.whoCanSee(card.page).none;
            const who = gm ? (card.loose ? t("badge.file") : hidden ? t("badge.gm") : t("badge.visible")) : "";
            const where = card.loose ? card.folder.replace(/^worlds\/[^/]+\//, "") : [card.journal, card.section].filter(Boolean).join(" › ");
            const sub = [where, t(`kind.${card.kind}`), who].filter(Boolean).join(" · ");
            const thumb = card.picture ? `<img src="${esc(card.picture)}" alt="" loading="lazy">` : `<i class="fa-solid ${ICON[card.kind]}" inert></i>`;
            const enter = !gm ? t("finder.enterOpen") : hidden && keeps ? t("finder.enterReveal") : t("finder.enterShow");
            return `<li class="hdt-res${on ? " on" : ""}" id="scrollcase-finder-row-${index}" data-index="${index}" role="option" aria-selected="${on}">
              <span class="hdt-res-th">${thumb}</span>
              <span class="hdt-res-tx"><span class="hdt-res-nm">${esc(card.name)}</span><span class="hdt-res-sub">${esc(sub)}${why ? ` <span class="hdt-why">· ${esc(t(`why.${why}`))}</span>` : ""}</span></span>
              ${on ? `<span class="hdt-res-go"><kbd>Enter</kbd> ${esc(enter)}</span>` : ""}
            </li>`;
          })
          .join("");
        return `<li class="hdt-res-group" role="presentation">${esc(g.label)}</li>${rows}`;
      })
      .join("");
    const list = this.element.querySelector(".hdt-results");
    list.innerHTML = html || `<li class="hdt-res-none" role="presentation">${esc(this.#query.trim() ? t("finder.none") : t("finder.empty"))}</li>`;
    const input = this.element.querySelector("input[name=find]");
    if (this.#rows.length) input.setAttribute("aria-activedescendant", `scrollcase-finder-row-${this.#at}`);
    else input.removeAttribute("aria-activedescendant");
    list.querySelector(".hdt-res.on")?.scrollIntoView({ block: "nearest" });
  }

  #key(ev) {
    switch (ev.key) {
      case "ArrowDown":
        ev.preventDefault();
        this.#at = Math.min(this.#at + 1, Math.max(0, this.#rows.length - 1));
        return this.#draw();
      case "ArrowUp":
        ev.preventDefault();
        this.#at = Math.max(this.#at - 1, 0);
        return this.#draw();
      case "Enter":
        ev.preventDefault();
        return void this.#act(ev.ctrlKey || ev.metaKey ? "journal" : ev.shiftKey ? "options" : "show");
      case "Escape":
        ev.preventDefault();
        ev.stopPropagation();
        if (this.#query) {
          this.#query = "";
          ev.currentTarget.value = "";
          this.#at = 0;
          return this.#draw();
        }
        return void this.close();
    }
  }

  async #act(how) {
    const row = this.#rows[this.#at];
    if (!row) return;
    const { card } = row;
    try {
      await this.close();
      if (how === "journal") {
        if (card.loose) return show.openPicture(card.key);
        return show.openInJournal(card.page);
      }
      if (!game.user.isGM) {
        show.openForReading(card.page);
        memory.noteSeen(card.key);
        return ScrollCaseWindow.refresh();
      }
      if (how === "options") return ScrollCaseWindow.open({ key: card.key, opts: true });
      const online = show.onlinePlayers().length;
      const keep = setting("showKeeps");
      let revealed = false;
      if (card.loose) revealed = !!(await show.showFile(card.key, { keep }));
      else revealed = !!(await show.showPage(card.page, { keep }))?.revealed;
      // The reveal's Undo lives in the Scroll Case window's strip; the toast says where.
      if (revealed) ui.notifications.info(t("show.revealedFinder", { name: card.name }));
      if (!online) ui.notifications.warn(t("show.nobodyOnline", { name: card.name }));
      else ui.notifications.info(t("show.sent", { name: card.name, whom: t("show.everyone") }));
      ScrollCaseWindow.refresh();
    } catch (err) {
      log.error("the finder's action failed", err);
      ui.notifications.error(t("error.show", { name: card.name }));
    }
  }
}

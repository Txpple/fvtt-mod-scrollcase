/**
 * The Scroll Case window: the journal as cards. The DM's view has a rail (the views, the journals by
 * folder with their sections), the cards, a detail panel and Show; a player's view is what they
 * can see, newest shown first, the unopened marked New. Everything it draws is read live from
 * Foundry's journal; the only state of its own is the browser's (memory.js).
 *
 * A card's text, picture and excerpt are worked out once per page edit (the cache below), and a
 * player's are worked out from the page as Foundry would show it to them: unrevealed secrets out.
 * The search filters the drawn cards from a map kept here, never from the DOM, and never redraws.
 */

import { log, MODULE_ID, setting, t } from "./common.js";
import {
  allImages,
  excerptOf,
  folderList,
  folderOf,
  isImageFile,
  kindOf,
  matchWhy,
  normPath,
  pictureOf,
  plainText,
  prettyName,
  searchFields,
  stripSecrets
} from "./decide/scrollcase.js";
import * as memory from "./memory.js";
import * as show from "./show.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** A journal page, and not a file path or anything else. */
const isPage = doc => doc?.documentName === "JournalEntryPage";

const ICONS = { image: "fa-image", video: "fa-film", pdf: "fa-file-pdf", text: "fa-file-lines" };
const TYPES = ["all", "image", "text", "pdf", "video"];
const SIZES = ["s", "m", "l"];
const TEXT_MAX = 20000;

/** A folder's path as the directory nests it. */
function folderPath(folder) {
  const names = [];
  for (let f = folder; f; f = f.folder) names.unshift(f.name);
  return names.join(" › ");
}

const byName = (a, b) => a.localeCompare(b, game.i18n.lang, { sensitivity: "base", numeric: true });

/** The world's journals in the directory's shape: by folder path, then by name. */
function journals() {
  return game.journal.contents
    .map(entry => ({ entry, folder: folderPath(entry.folder) }))
    .sort((a, b) => byName(a.folder, b.folder) || byName(a.entry.name, b.entry.name));
}

/** What a page's HTML comes to, per page edit and per reader (owner or not). */
const pageCache = new Map();
function pageData(page, owner) {
  const stamp = `${page._stats?.modifiedTime ?? 0}|${page.type}|${page.src}|${owner}`;
  const hit = pageCache.get(page.uuid);
  if (hit?.stamp === stamp) return hit.data;
  const raw = page.text?.content ?? "";
  const html = owner ? raw : stripSecrets(raw);
  const data = {
    picture: pictureOf({ type: page.type, src: page.src, html }),
    excerpt: excerptOf(html),
    text: plainText(html).slice(0, TEXT_MAX),
    images: owner ? allImages(raw) : []
  };
  pageCache.set(page.uuid, { stamp, data });
  return data;
}

/** One card per page the user can see (every page, for a GM). */
export function pageCards(user = game.user) {
  const cards = [];
  for (const { entry, folder } of journals()) {
    // A player is not told the folder of a journal the stock directory hides from them.
    const entryShown = user.isGM || entry.testUserPermission(user, "OBSERVER");
    const pages = entry.pages.contents.slice().sort((a, b) => a.sort - b.sort);
    for (const page of pages) {
      if (!user.isGM && !page.testUserPermission(user, "OBSERVER")) continue;
      const kind = kindOf(page.type);
      const data = pageData(page, page.testUserPermission(user, "OWNER"));
      cards.push({
        key: page.uuid,
        page,
        entry,
        kind,
        hasPicture: !!data.picture,
        name: page.name,
        picture: data.picture,
        excerpt: data.picture ? "" : data.excerpt,
        journal: entryShown ? entry.name : "",
        journalShown: entryShown,
        folder: entryShown ? folder : "",
        section: page.category ? (entry.categories.get(page.category)?.name ?? "") : "",
        file: kind === "text" ? (data.picture ?? "") : (page.src ?? ""),
        caption: page.image?.caption ?? "",
        text: data.text,
        loose: false
      });
    }
  }
  return cards;
}

/** Every path a page uses: its own file and the images in its text. */
function usedPaths() {
  const used = new Set();
  for (const entry of game.journal) {
    for (const page of entry.pages) {
      if (page.src) used.add(normPath(page.src));
      for (const src of pageData(page, true).images) used.add(normPath(src));
    }
  }
  return used;
}

/** The asset folders the setting names, or the world's four. */
export function assetFolders() {
  const base = `worlds/${game.world.id}/assets`;
  return folderList(setting("assetFolders"), ["handouts", "journal", "maps", "portraits"].map(f => `${base}/${f}`));
}

/** The image files under the asset folders (two folders deep at most): read once, shared. */
let files = null;
let filesLoading = null;

/** Read the asset folders (GM only); a second call while reading waits for the first. */
export function loadFiles(force = false) {
  if (!game.user.isGM) return Promise.resolve([]);
  if (filesLoading) return filesLoading;
  if (files && !force) return Promise.resolve(files);
  const FilePicker = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  const found = [];
  const walk = async (path, depth) => {
    let res;
    try {
      res = await FilePicker.browse("data", path);
    } catch {
      return;
    }
    for (const f of res.files ?? []) if (isImageFile(f)) found.push(f);
    if (depth < 2) for (const d of res.dirs ?? []) await walk(d, depth + 1);
  };
  filesLoading = (async () => {
    try {
      for (const folder of assetFolders()) await walk(folder, 0);
      files = [...new Set(found)];
    } catch (err) {
      log.error("reading the asset folders failed", err);
      files = [];
    } finally {
      filesLoading = null;
    }
    ScrollCaseWindow.refresh();
    return files;
  })();
  return filesLoading;
}

export const filesReading = () => !!filesLoading;

/** The file cards: the pictures no page uses, once the folders are read. */
export function fileCards() {
  if (!game.user.isGM || !files) return [];
  const used = usedPaths();
  return files.filter(path => !used.has(normPath(path))).map(path => ({
    key: path,
    page: null,
    entry: null,
    kind: "image",
    hasPicture: true,
    name: prettyName(path),
    picture: path,
    excerpt: "",
    journal: "",
    folder: folderOf(path),
    section: "",
    file: path,
    caption: "",
    text: "",
    loose: true
  }));
}

/** The time a thing was shown, short. */
function when(at) {
  try {
    return new Date(at).toLocaleString(game.i18n.lang, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return new Date(at).toLocaleString();
  }
}

/** Open Foundry's own journal: the sidebar's Journal tab, the sidebar expanded. */
export function openClassicJournal() {
  ui.sidebar?.changeTab("journal", "primary");
  if (ui.sidebar && !ui.sidebar.expanded) ui.sidebar.expand();
}

/**
 * What the one-click Show will do to a card, so its button can say so: "reveal" a page not every
 * player can open yet (the setting keeps it visible), "add" a picture on no page as a new page, or
 * just "show".
 */
function showAs(card, who) {
  const keeps = setting("showKeeps");
  if (card.loose) return keeps ? "add" : "show";
  return keeps && !who.all ? "reveal" : "show";
}

/** "1 page", "3 pages": the count keys have a one and a many. */
const counted = (n, base) => t(n === 1 ? `${base}One` : base, { n });

export class ScrollCaseWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "scrollcase-library",
    classes: ["scrollcase-library"],
    window: { title: `${MODULE_ID}.library.title`, icon: "fa-solid fa-images", resizable: true },
    position: { width: 1180, height: 800 },
    actions: {
      type: ScrollCaseWindow.#onType,
      size: ScrollCaseWindow.#onSize,
      view: ScrollCaseWindow.#onView,
      searchAll: ScrollCaseWindow.#onSearchAll,
      pick: ScrollCaseWindow.#onPick,
      quickShow: ScrollCaseWindow.#onQuickShow,
      showPicture: ScrollCaseWindow.#onShowPicture,
      openOpts: ScrollCaseWindow.#onOpenOpts,
      optAll: ScrollCaseWindow.#onOptAll,
      optUser: ScrollCaseWindow.#onOptUser,
      optKeep: ScrollCaseWindow.#onOptKeep,
      optPicture: ScrollCaseWindow.#onOptPicture,
      optTitle: ScrollCaseWindow.#onOptTitle,
      optCaption: ScrollCaseWindow.#onOptCaption,
      optGo: ScrollCaseWindow.#onOptGo,
      optCancel: ScrollCaseWindow.#onOptCancel,
      pin: ScrollCaseWindow.#onPin,
      openJournal: ScrollCaseWindow.#onOpenJournal,
      copyLink: ScrollCaseWindow.#onCopyLink,
      keep: ScrollCaseWindow.#onKeep,
      undo: ScrollCaseWindow.#onUndo,
      dismissReveal: ScrollCaseWindow.#onDismissReveal,
      showAgain: ScrollCaseWindow.#onShowAgain,
      markSeen: ScrollCaseWindow.#onMarkSeen,
      seeAll: ScrollCaseWindow.#onSeeAll,
      seeUser: ScrollCaseWindow.#onSeeUser,
      classic: ScrollCaseWindow.#onClassic,
      rescan: ScrollCaseWindow.#onRescan
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/library.hbs`,
      scrollable: [".hdt-cards", ".hdt-rail", ".hdt-detail"]
    }
  };

  /** The one open window, so the Journal button, the finder and the API reuse it. */
  static current = null;

  /** Open the window, or bring it forward; `key` picks a card, `opts` opens its Show options. */
  static open({ key = null, opts = false } = {}) {
    ScrollCaseWindow.current ??= new ScrollCaseWindow();
    const app = ScrollCaseWindow.current;
    if (key) app.select(key, { opts });
    if (app.rendered) {
      app.bringToFront();
      if (key) app.render();
      return app;
    }
    app.render({ force: true }).catch(err => {
      log.error("the Scroll Case window failed to open; Foundry's journal opens instead", err);
      openClassicJournal();
    });
    return app;
  }

  static #timer = null;

  /** Redraw when open, once per burst of changes (a journal edited, a player connecting). */
  static refresh() {
    clearTimeout(ScrollCaseWindow.#timer);
    ScrollCaseWindow.#timer = setTimeout(() => {
      const app = ScrollCaseWindow.current;
      if (app?.rendered && !app.minimized) app.render();
    }, 250);
  }

  /** The card being dragged: its key, journal, section, and whether it is a file. */
  static #dragging = null;

  #view = null;
  #type = "all";
  #size = "m";
  #query = "";
  #selected = null;
  #opts = null;
  /** Every card's search fields (in view or not), and the keys the view itself holds. */
  #fields = new Map();
  #inView = new Set();
  /** The focused control before a redraw, to put focus back after it. */
  #focus = null;
  /**
   * A card kept in the view though it no longer fits it, until the DM moves on: one just shown
   * (a GM-only page leaves "GM only" once revealed, and its Undo must stay in reach), or one the
   * finder or the API picked from outside the view.
   */
  #sticky = null;
  #optsFresh = false;
  #returnTo = null;
  /** Shows under way from this window, so a double click shows once. */
  #busy = new Set();

  constructor(options) {
    super(options);
    const prefs = memory.load();
    this.#type = TYPES.includes(prefs.type) ? prefs.type : "all";
    this.#size = SIZES.includes(prefs.size) ? prefs.size : "m";
    this.#view = prefs.view;
  }

  /** Pick a card (the finder's and the API's way in). */
  select(key, { opts = false } = {}) {
    this.#selected = key;
    this.#sticky = key;
    this.#query = "";
    this.#type = "all";
    if (opts) this.#openOpts(key);
  }

  /** Open the Show options on a card; the first draw puts focus on Show, later ones leave it be. */
  #openOpts(key) {
    this.#opts = this.#newOpts(key);
    this.#optsFresh = true;
  }

  /** Close the Show options; focus goes back to the card they were opened from. */
  #closeOpts() {
    if (!this.#opts) return;
    this.#returnTo = this.#opts.key;
    this.#opts = null;
    this.render();
  }

  #inViewOf(card, view, who) {
    const gm = game.user.isGM;
    switch (view) {
      case "all":
        return !card.loose;
      case "visible":
        return !card.loose && !who.none;
      case "gm":
        return !card.loose && who.none;
      case "recent":
        return !!memory.lastShown(card.key);
      case "pinned":
        return memory.isPinned(card.key);
      case "loose":
        return gm && card.loose;
      case "unseen":
        return !gm && !memory.isSeen(card.key);
      default:
        if (view?.startsWith("j:")) return card.entry?.id === view.slice(2);
        if (view?.startsWith("c:")) {
          const [entryId, catId] = view.slice(2).split(".");
          return card.entry?.id === entryId && card.page?.category === catId;
        }
        return false;
    }
  }

  #ofType(card, type) {
    if (type === "all") return true;
    if (type === "image") return card.hasPicture;
    return card.kind === type;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const gm = game.user.isGM;
    if (gm && files === null && !filesLoading) void loadFiles();
    const pages = pageCards();
    const loose = fileCards();
    const all = [...pages, ...loose];
    const nobody = { all: false, none: true, ids: [] };
    const seeing = new Map(all.map(c => [c.key, c.loose ? nobody : show.whoCanSee(c.page)]));

    // A player's first look: what they can already see is not New.
    if (!gm && !memory.load().baseline) {
      memory.edit(r => {
        for (const c of pages) r.seen[c.key] = Date.now();
        r.baseline = true;
      });
    }

    const viewIds = gm ? ["all", "visible", "gm", "recent", "pinned", "loose"] : ["recent", "unseen", "all", "pinned"];
    if (!this.#view || !this.#validView(this.#view, viewIds)) {
      this.#view = gm ? "all" : pages.some(c => memory.lastShown(c.key)) ? "recent" : "all";
    }
    const view = this.#view;
    const inView = c => c.key === this.#sticky || this.#inViewOf(c, view, seeing.get(c.key));

    let list = all.filter(inView);
    const fits = c => this.#inViewOf(c, view, seeing.get(c.key));
    const typeCount = Object.fromEntries(TYPES.map(k => [k, list.filter(c => fits(c) && this.#ofType(c, k)).length]));
    list = list.filter(c => this.#ofType(c, this.#type));
    const orderBy = keys => {
      const order = new Map(keys.map((k, i) => [k, i]));
      list.sort((a, b) => (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9));
    };
    if (view === "recent") orderBy(memory.load().recent.map(r => r.key));
    if (view === "pinned") orderBy(memory.load().pins);

    // Every card's search fields; in All, the files are drawn too but show only for a search.
    this.#fields = new Map(all.map(c => [c.key, searchFields(c)]));
    this.#inView = new Set(list.map(c => c.key));
    const listed = new Set(list.map(c => c.key));
    const searchOnly = gm && view === "all" ? loose.filter(c => !listed.has(c.key) && this.#ofType(c, this.#type)) : [];

    const players = show.players();
    const nPages = list.filter(c => !c.loose && fits(c)).length;
    const nFiles = list.filter(c => c.loose && fits(c)).length;
    context.isGM = gm;
    context.size = this.#size;
    context.query = this.#query;
    context.loading = gm && !!filesLoading;
    context.types = TYPES.map(id => ({ id, label: t(`type.${id}`), n: typeCount[id], on: this.#type === id }));
    context.sizes = SIZES.map(id => ({ id, label: t(`size.${id}`), aria: t(`size.${id}Aria`), on: this.#size === id }));
    context.views = viewIds.map(id => ({
      id,
      label: t(`view.${id}`),
      n: all.filter(c => this.#inViewOf(c, id, seeing.get(c.key))).length,
      on: view === id,
      drop: gm && id === "pinned" ? "pinned" : null
    }));
    context.folders = this.#railJournals(pages, view);
    context.heading = this.#heading(view);
    context.cards = [
      ...list.map(c => this.#cardContext(c, seeing.get(c.key), players)),
      ...searchOnly.map(c => ({ ...this.#cardContext(c, nobody, players), searchOnly: true }))
    ];
    context.countBase = view === "loose" ? counted(nFiles, "count.files") : gm || nPages ? counted(nPages, "count.pages") : "";
    context.emptyText = t(`empty.${gm ? "gm" : "player"}.${view.startsWith("j:") || view.startsWith("c:") ? "journal" : view}`);
    context.detail = gm ? this.#detailContext(all, seeing, players, list, searchOnly) : null;
    context.opts = gm && this.#opts ? this.#optsContext(all) : null;
    const reveal = gm ? show.lastReveal() : null;
    context.reveal = reveal ? { text: t("show.revealed", { name: reveal.name, whom: reveal.whom }) } : null;
    context.markAll = !gm && view === "unseen" && list.length > 0;
    return context;
  }

  #validView(view, ids) {
    if (ids.includes(view)) return true;
    if (view.startsWith("j:")) return !!game.journal.get(view.slice(2));
    if (view.startsWith("c:")) {
      const [entryId, catId] = view.slice(2).split(".");
      return !!game.journal.get(entryId)?.categories.get(catId);
    }
    return false;
  }

  #heading(view) {
    if (view.startsWith("j:")) return game.journal.get(view.slice(2))?.name ?? "";
    if (view.startsWith("c:")) {
      const [entryId, catId] = view.slice(2).split(".");
      const entry = game.journal.get(entryId);
      return `${entry?.name ?? ""} › ${entry?.categories.get(catId)?.name ?? ""}`;
    }
    return t(`view.${view}`);
  }

  /** The rail's journals: grouped by folder (for a GM), each with its sections; a journal with no card is left out. */
  #railJournals(pages, view) {
    const gm = game.user.isGM;
    const byEntry = new Map();
    for (const c of pages) {
      if (!byEntry.has(c.entry.id)) byEntry.set(c.entry.id, []);
      byEntry.get(c.entry.id).push(c);
    }
    const groups = new Map();
    for (const { entry, folder } of journals()) {
      const mine = byEntry.get(entry.id);
      if (!mine || !(gm || mine[0].journalShown)) continue;
      const group = gm ? folder : "";
      if (!groups.has(group)) groups.set(group, []);
      const cats = entry.categories.contents
        .slice()
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        .map(cat => ({
          id: cat.id,
          name: cat.name || t("section.unnamed"),
          n: mine.filter(c => c.page.category === cat.id).length,
          on: view === `c:${entry.id}.${cat.id}`
        }))
        .filter(cat => gm || cat.n);
      groups.get(group).push({
        id: entry.id,
        name: entry.name,
        n: mine.length,
        nNew: gm ? 0 : mine.filter(c => !memory.isSeen(c.key)).length,
        on: view === `j:${entry.id}`,
        cats
      });
    }
    return [...groups].map(([name, list]) => ({ name, journals: list }));
  }

  #badge(card, who, players) {
    if (card.loose) return { badge: t("badge.file"), badgeCls: "file", badgeIcon: "fa-file-image" };
    if (who.all) return { badge: t("badge.all"), badgeCls: "all", badgeIcon: "fa-eye" };
    if (who.none) return { badge: t("badge.gm"), badgeCls: "gm", badgeIcon: "fa-eye-slash" };
    const names = who.ids.map(id => players.find(u => u.id === id)?.name ?? "?");
    return { badge: names.length > 2 ? t("badge.some", { n: names.length }) : names.join(", "), badgeCls: "some", badgeIcon: "fa-eye" };
  }

  #cardContext(card, who, players) {
    const gm = game.user.isGM;
    const sub = card.loose
      ? card.folder.replace(/^worlds\/[^/]+\//, "")
      : [card.journal, card.section].filter(Boolean).join(" › ") || t(`kind.${card.kind}`);
    const as = showAs(card, who);
    return {
      key: card.key,
      name: card.name,
      picture: card.picture,
      excerpt: card.excerpt || t(`kind.${card.kind}`),
      icon: ICONS[card.kind],
      sub,
      loose: card.loose,
      entryId: card.entry?.id ?? "",
      category: card.page?.category ?? "",
      pinned: memory.isPinned(card.key),
      unseen: !gm && !memory.isSeen(card.key),
      selected: gm && this.#selected === card.key,
      dim: gm && !card.loose && who.none,
      showLabel: t(`show.as.${as}`),
      showHint: t(`show.hint.${as}`),
      ...(gm ? this.#badge(card, who, players) : {})
    };
  }

  #detailContext(all, seeing, players, list, searchOnly) {
    const drawn = new Set([...list, ...searchOnly].map(c => c.key));
    if (!drawn.has(this.#selected)) return null;
    const card = all.find(c => c.key === this.#selected);
    if (!card) return null;
    const who = seeing.get(card.key);
    const shown = memory.lastShown(card.key);
    const cats = card.entry ? card.entry.categories.contents.slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)) : [];
    return {
      key: card.key,
      name: card.name,
      picture: card.picture,
      excerpt: card.text ? `${card.text.slice(0, 600)}${card.text.length > 600 ? "…" : ""}` : card.excerpt,
      icon: ICONS[card.kind],
      loose: card.loose,
      textPicture: card.kind === "text" && card.hasPicture,
      kindLine: card.loose ? t("detail.fileLine") : t("detail.pageLine", { kind: t(`kind.${card.kind}`), journal: card.journal }),
      where: card.loose ? t("detail.onNoPage", { folder: card.folder }) : [card.folder, card.journal, card.section, card.name].filter(Boolean).join(" › "),
      file: card.file,
      pinned: memory.isPinned(card.key),
      sections: card.entry
        ? [
            { id: "", name: t("section.none"), on: !card.page.category },
            ...cats.map(c => ({ id: c.id, name: c.name || t("section.unnamed"), on: card.page.category === c.id })),
            { id: "__new", name: t("section.new"), on: false }
          ]
        : null,
      everyone: who.all,
      players: players.map(u => ({ id: u.id, name: u.name, character: u.character?.name ?? "", on: who.ids.includes(u.id), online: u.active })),
      noPlayers: !players.length,
      shown: shown ? t("detail.shownLine", { when: when(shown.at), to: shown.to }) : t("detail.notShown"),
      again: shown?.ids?.length ? t("detail.again", { to: shown.to }) : null,
      showLabel: t(`show.everyoneAs.${showAs(card, who)}`)
    };
  }

  #newOpts(key) {
    return { key, to: null, keep: setting("showKeeps"), picture: false, title: true, caption: true };
  }

  #optsContext(all) {
    const o = this.#opts;
    const card = all.find(c => c.key === o.key);
    if (!card) {
      this.#opts = null;
      return null;
    }
    const online = show.onlinePlayers().length;
    return {
      name: card.name,
      picture: card.picture,
      isImage: card.kind === "image" || (o.picture && card.hasPicture),
      textPicture: card.kind === "text" && card.hasPicture,
      pictureOnly: o.picture,
      loose: card.loose,
      everyone: o.to === null,
      everyoneLabel: online ? t("opts.everyone", { n: online }) : t("opts.everyoneNone"),
      players: show.players().map(u => ({ id: u.id, name: u.name, on: o.to?.includes(u.id) ?? false, online: u.active })),
      keep: o.keep,
      title: o.title,
      caption: o.caption,
      keepLabel: card.loose ? t("opts.keepFile") : t("opts.keep"),
      keepHelp: card.loose ? t(o.keep ? "opts.keepFileOn" : "opts.keepFileOff") : t(o.keep ? "opts.keepOn" : "opts.keepOff")
    };
  }

  /** @override */
  async _preRender(context, options) {
    await super._preRender(context, options);
    const el = this.element;
    const active = el?.contains(document.activeElement) ? document.activeElement : null;
    if (!active) {
      this.#focus = null;
      return;
    }
    this.#focus = {
      zone: active.closest(".hdt-opts") ? ".hdt-opts" : active.closest(".hdt-detail") ? ".hdt-detail" : active.closest(".hdt-head") ? ".hdt-head" : null,
      name: active.name || null,
      action: active.dataset?.action ?? null,
      key: active.closest("[data-key]")?.dataset.key ?? null,
      data: { ...(active.dataset ?? {}) },
      start: active.selectionStart ?? null,
      end: active.selectionEnd ?? null
    };
  }

  /**
   * The window's own keys, bound once (the element outlives every redraw): Escape closes the Show
   * options and not the window, Tab stays inside them while they are open, and "/" puts the caret
   * in the search.
   * @override
   */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.element.addEventListener("keydown", ev => {
      if (this.#opts && ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        return this.#closeOpts();
      }
      if (this.#opts && ev.key === "Tab") {
        const stops = [...this.element.querySelectorAll(".hdt-opts button")];
        if (!stops.length) return;
        const at = stops.indexOf(document.activeElement);
        const next = ev.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : at === stops.length - 1 || at < 0 ? 0 : at + 1;
        ev.preventDefault();
        return stops[next].focus();
      }
      const typing = ev.target.closest?.("input, textarea, select, [contenteditable]");
      if (ev.key === "/" && !typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault();
        this.element.querySelector("input[name=search]")?.focus();
      }
    });
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    const input = root.querySelector("input[name=search]");
    input?.addEventListener("input", ev => {
      this.#query = ev.currentTarget.value;
      this.#filter();
    });
    input?.addEventListener("keydown", ev => {
      if (ev.key === "Escape" && this.#query) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.currentTarget.value = "";
        this.#query = "";
        this.#filter();
      }
    });
    root.querySelector("select[name=section]")?.addEventListener("change", ev => void this.#onSection(ev.currentTarget.value));
    this.#wireDrag(root);

    // A click on the veil closes the Show options, not the window.
    root.querySelector(".hdt-veil")?.addEventListener("click", ev => {
      if (ev.target === ev.currentTarget) this.#closeOpts();
    });

    this.#filter();
    this.#restoreFocus(options, context);
  }

  #restoreFocus(options, context) {
    const root = this.element;
    if (context.opts && this.#optsFresh) {
      this.#optsFresh = false;
      this.#focus = null;
      return root.querySelector('.hdt-opts [data-action="optGo"]')?.focus();
    }
    const usable = el => el && !el.closest("[hidden]") && !el.disabled;
    const back = this.#returnTo;
    this.#returnTo = null;
    if (back) {
      const card = root.querySelector(`.hdt-card[data-key="${CSS.escape(back)}"]`);
      const el = card?.querySelector('[data-action="openOpts"]') ?? card?.querySelector('[data-action="pick"]') ?? root.querySelector('.hdt-detail [data-action="openOpts"]');
      if (usable(el)) return el.focus({ preventScroll: true });
    }
    const f = this.#focus;
    this.#focus = null;
    if (!f) {
      if (options.isFirstRender) root.querySelector("input[name=search]")?.focus();
      return;
    }
    let el = null;
    if (f.name) el = root.querySelector(`[name="${CSS.escape(f.name)}"]`);
    else if (f.action) {
      const sel = [`[data-action="${CSS.escape(f.action)}"]`];
      for (const k of ["view", "type", "size", "user"]) if (f.data[k]) sel.push(`[data-${k}="${CSS.escape(f.data[k])}"]`);
      // The control's own place: the panel, the options, the head, or its card in the grid.
      const scope = f.zone ? root.querySelector(f.zone) : f.key ? root.querySelector(`.hdt-card[data-key="${CSS.escape(f.key)}"]`) : root;
      el = scope?.querySelector(sel.join("")) ?? (f.key && !f.zone ? scope?.querySelector('[data-action="pick"]') : null);
    }
    // Gone with the redraw (an Undo done, a pin taken off in Pinned): the picked card, else the search.
    if (!usable(el)) {
      const picked = this.#selected ? root.querySelector(`.hdt-card[data-key="${CSS.escape(this.#selected)}"] [data-action="pick"]`) : null;
      el = usable(picked) ? picked : root.querySelector("input[name=search]");
    }
    if (!usable(el)) return;
    el.focus({ preventScroll: true });
    if (f.start !== null && f.start !== undefined && typeof el.setSelectionRange === "function") {
      try {
        el.setSelectionRange(f.start, f.end ?? f.start);
      } catch {
        // Not a text field.
      }
    }
  }

  /** The search, applied to the drawn cards: no redraw, so the caret and the scroll stay. */
  #filter() {
    const root = this.element;
    if (!root) return;
    const q = this.#query.trim();
    let shown = 0;
    let shownFiles = 0;
    const drawn = new Set();
    for (const card of root.querySelectorAll(".hdt-card[data-key]")) {
      const key = card.dataset.key;
      drawn.add(key);
      const why = matchWhy(this.#fields.get(key) ?? {}, q);
      const only = card.dataset.searchOnly === "1";
      const hide = why === null || (only && !q);
      card.hidden = hide;
      if (!hide) {
        if (only) shownFiles++;
        else shown++;
      }
      const label = card.querySelector(".hdt-why");
      if (label) label.textContent = why ? t(`why.${why}`) : "";
    }
    const count = root.querySelector(".hdt-count");
    if (count) {
      if (!q) count.textContent = count.dataset.base ?? "";
      else count.textContent = shownFiles ? t("count.matchingFiles", { pages: counted(shown, "count.pages"), files: counted(shownFiles, "count.files"), q }) : t("count.matching", { n: shown, q });
    }
    root.querySelector(".hdt-root")?.classList.toggle("hdt-searching", !!q);
    // Matches the view leaves out: offer them.
    let elsewhere = 0;
    if (q) for (const [key, f] of this.#fields) if (matchWhy(f, q) !== null && !drawn.has(key) && !this.#inView.has(key)) elsewhere++;
    const more = root.querySelector(".hdt-more");
    if (more) {
      more.hidden = !elsewhere;
      more.textContent = elsewhere ? t("search.more", { n: elsewhere }) : "";
    }
    const empty = root.querySelector(".hdt-empty");
    if (empty) {
      empty.hidden = shown + shownFiles > 0;
      empty.textContent = !q ? (empty.dataset.view ?? "") : elsewhere ? t("empty.searchHere", { q }) : t("empty.search");
    }
    // The detail panel follows the cards: a card the search hides takes its panel with it.
    const detail = root.querySelector(".hdt-detail[data-key]");
    if (detail) {
      const card = root.querySelector(`.hdt-card[data-key="${CSS.escape(detail.dataset.key)}"]`);
      detail.hidden = !card || card.hidden;
    }
  }

  #wireDrag(root) {
    for (const card of root.querySelectorAll(".hdt-card[data-key]")) {
      card.addEventListener("dragstart", ev => {
        const d = card.dataset;
        ScrollCaseWindow.#dragging = { key: d.key, entry: d.entry || null, category: d.category || null, loose: d.loose === "1" };
        card.classList.add("dragging");
        ev.dataTransfer.effectAllowed = "copyMove";
        // A page drags as Foundry's own page drag (a drop on the canvas makes a map note).
        ev.dataTransfer.setData("text/plain", d.loose === "1" ? d.key : JSON.stringify({ type: "JournalEntryPage", uuid: d.key }));
      });
      card.addEventListener("dragend", () => {
        ScrollCaseWindow.#dragging = null;
        card.classList.remove("dragging");
        for (const el of root.querySelectorAll(".drop-ok")) el.classList.remove("drop-ok");
      });
    }
    if (!game.user.isGM) return;
    for (const row of root.querySelectorAll("[data-drop]")) {
      row.addEventListener("dragover", ev => {
        if (!this.#accepts(row.dataset)) return;
        ev.preventDefault();
        ev.stopPropagation();
        row.classList.add("drop-ok");
      });
      row.addEventListener("dragleave", () => row.classList.remove("drop-ok"));
      row.addEventListener("drop", ev => {
        const d = ScrollCaseWindow.#dragging;
        if (!d || !this.#accepts(row.dataset)) return;
        ev.preventDefault();
        ev.stopPropagation();
        row.classList.remove("drop-ok");
        void this.#dropped(d, row.dataset);
      });
    }
  }

  /** Whether the card being dragged can land on this row: pins take anything, a section only its own journal's pages. */
  #accepts(where) {
    const d = ScrollCaseWindow.#dragging;
    if (!d) return false;
    if (where.drop === "pinned") return true;
    if (d.loose || d.entry !== where.entry) return false;
    if (where.drop === "cat") return d.category !== where.cat;
    return where.drop === "journal" && !!d.category;
  }

  async #dropped(d, where) {
    try {
      if (where.drop === "pinned") {
        if (memory.isPinned(d.key)) ui.notifications.info(t("drop.alreadyPinned"));
        else memory.togglePin(d.key);
        return this.render();
      }
      const page = fromUuidSync(d.key);
      if (!isPage(page)) return;
      await show.setSection(page, where.drop === "cat" ? where.cat : null);
      const cat = where.drop === "cat" ? page.parent.categories.get(where.cat)?.name : null;
      ui.notifications.info(cat ? t("drop.filed", { name: page.name, section: cat }) : t("drop.unfiled", { name: page.name }));
    } catch (err) {
      log.error("a drop failed", err);
      ui.notifications.error(t("error.write"));
    }
  }

  async #onSection(value) {
    const page = fromUuidSync(this.#selected);
    if (!isPage(page)) return;
    try {
      if (value === "__new") {
        const name = await promptName();
        if (!name) return this.render();
        const cat = await show.newSection(page.parent, name);
        await show.setSection(page, cat.id);
        return;
      }
      await show.setSection(page, value);
    } catch (err) {
      log.error("filing the page failed", err);
      ui.notifications.error(t("error.write"));
    }
  }

  /** The page or the file a key names. */
  static #resolve(key) {
    const doc = key ? fromUuidSync(key) : null;
    if (isPage(doc)) return { page: doc, file: null };
    return { page: null, file: key };
  }

  /**
   * Show, keeping it visible by the setting. Foundry posts its own notice of the show; the window
   * adds only what Foundry's does not say: a reveal goes in the strip at the top with its Undo, and
   * a warning when none of the players it went to is connected.
   */
  async #show(key, { to = null, keep = setting("showKeeps"), title = true, caption = true, picture = false } = {}) {
    if (this.#busy.has(key)) return;
    this.#busy.add(key);
    const { page, file } = ScrollCaseWindow.#resolve(key);
    const name = page?.name ?? prettyName(file);
    const online = new Set(show.onlinePlayers().map(u => u.id));
    try {
      if (page) {
        const pic = picture ? pageCards().find(c => c.key === page.uuid)?.picture : null;
        const res = await show.showPage(page, { to, keep, title, caption, picture: pic });
        if (res?.revealed) {
          this.#selected = page.uuid;
          this.#sticky = page.uuid;
        }
      } else {
        const kept = await show.showFile(file, { to, keep, title });
        if (kept) {
          this.#selected = kept.uuid;
          this.#sticky = kept.uuid;
        }
      }
      const reached = to ? to.some(id => online.has(id)) : online.size > 0;
      if (!reached) ui.notifications.warn(t("show.nobodyOnline", { name }));
      else ui.notifications.info(t("show.sent", { name, whom: to ? to.map(id => game.users.get(id)?.name ?? "?").join(", ") : t("show.everyone") }));
    } catch (err) {
      log.error("showing failed", err);
      ui.notifications.error(t("error.show", { name }));
    } finally {
      this.#busy.delete(key);
    }
    this.#opts = null;
    return this.render();
  }

  static #onType(_event, target) {
    this.#type = target.dataset.type;
    memory.setPrefs({ type: this.#type });
    this.render();
  }

  static #onSize(_event, target) {
    this.#size = target.dataset.size;
    memory.setPrefs({ size: this.#size });
    this.render();
  }

  static #onView(_event, target) {
    this.#view = target.dataset.view;
    this.#sticky = null;
    memory.setPrefs({ view: this.#view });
    this.render();
  }

  static #onSearchAll() {
    this.#view = "all";
    this.#sticky = null;
    this.#type = "all";
    memory.setPrefs({ view: "all", type: "all" });
    this.render();
  }

  static #onPick(event, target) {
    const key = target.closest("[data-key]")?.dataset.key;
    if (!key) return;
    if (!game.user.isGM) {
      const page = fromUuidSync(key);
      if (isPage(page)) {
        show.openForReading(page);
        memory.noteSeen(key);
        this.render();
      }
      return;
    }
    // The DM: a click picks; a second click, a double click, or Enter on the picked card opens it to look at.
    if (this.#selected === key && (event.detail >= 2 || event.detail === 0)) {
      const { page, file } = ScrollCaseWindow.#resolve(key);
      if (page) show.openForReading(page);
      else show.openPicture(file);
      return;
    }
    this.#selected = key;
    if (this.#sticky !== key) this.#sticky = null;
    this.render();
  }

  static #onQuickShow(event, target) {
    event.stopPropagation();
    if (event.detail > 1) return;
    const key = target.closest("[data-key]")?.dataset.key;
    if (key) return this.#show(key);
  }

  static #onShowPicture(event, target) {
    event.stopPropagation();
    const key = target.closest("[data-key]")?.dataset.key;
    if (key) return this.#show(key, { picture: true });
  }

  static #onOpenOpts(event, target) {
    event.stopPropagation();
    const key = target.closest("[data-key]")?.dataset.key ?? this.#selected;
    if (!key) return;
    this.#openOpts(key);
    this.render();
  }

  static #onOptAll() {
    this.#opts.to = null;
    this.render();
  }

  static #onOptUser(_event, target) {
    const id = target.dataset.user;
    const cur = this.#opts.to ?? [];
    this.#opts.to = cur.includes(id) ? cur.filter(u => u !== id) : [...cur, id];
    this.render();
  }

  static #onOptKeep() {
    this.#opts.keep = !this.#opts.keep;
    this.render();
  }

  static #onOptPicture() {
    this.#opts.picture = !this.#opts.picture;
    this.render();
  }

  static #onOptTitle() {
    this.#opts.title = !this.#opts.title;
    this.render();
  }

  static #onOptCaption() {
    this.#opts.caption = !this.#opts.caption;
    this.render();
  }

  static #onOptGo() {
    const o = this.#opts;
    if (!o) return;
    if (o.to && !o.to.length) return ui.notifications.warn(t("opts.nobody"));
    return this.#show(o.key, { to: o.to, keep: o.keep, title: o.title, caption: o.caption, picture: o.picture });
  }

  static #onOptCancel() {
    this.#closeOpts();
  }

  static #onPin(_event, target) {
    const key = target.closest("[data-key]")?.dataset.key ?? this.#selected;
    if (!key) return;
    memory.togglePin(key);
    this.render();
  }

  static #onOpenJournal() {
    const { page, file } = ScrollCaseWindow.#resolve(this.#selected);
    if (page) show.openInJournal(page);
    else if (file) show.openPicture(file);
  }

  static async #onCopyLink() {
    const page = fromUuidSync(this.#selected);
    if (!isPage(page)) return;
    const link = `@UUID[${page.uuid}]{${page.name}}`;
    try {
      await game.clipboard.copyPlainText(link);
      ui.notifications.info(t("detail.copied"));
    } catch {
      ui.notifications.info(link);
    }
  }

  static async #onKeep() {
    const file = this.#selected;
    if (!file || fromUuidSync(file)) return;
    try {
      const page = await show.keepFile(file);
      this.#selected = page.uuid;
      this.#sticky = page.uuid;
      ui.notifications.info(t("keep.done", { name: page.name, journal: page.parent.name }));
    } catch (err) {
      log.error("keeping the file failed", err);
      ui.notifications.error(t("error.write"));
    }
    this.render();
  }

  static async #onUndo() {
    const name = show.lastReveal()?.name ?? "";
    try {
      const res = await show.undoReveal();
      if (res === "undone") ui.notifications.info(t("show.undone", { name }));
      else if (res === "changed") ui.notifications.warn(t("show.undoChanged", { name }));
    } catch (err) {
      log.error("undoing the reveal failed", err);
      ui.notifications.error(t("error.write"));
    }
    this.render();
  }

  static #onDismissReveal() {
    show.forgetReveal();
    this.render();
  }

  /** Show it again to the same players as last time (from this browser). */
  static #onShowAgain() {
    const last = memory.lastShown(this.#selected);
    if (!last?.ids?.length) return;
    return this.#show(this.#selected, { to: last.ids });
  }

  /** A player's New view: every card in it marked seen. */
  static #onMarkSeen() {
    const keys = [...this.element.querySelectorAll(".hdt-card[data-key]")].map(c => c.dataset.key);
    memory.edit(r => {
      for (const k of keys) r.seen[k] = Date.now();
    });
    this.render();
  }

  static async #onSeeAll() {
    const page = fromUuidSync(this.#selected);
    if (!isPage(page)) return;
    try {
      await show.toggleEveryone(page);
    } catch (err) {
      log.error("setting who can see it failed", err);
      ui.notifications.error(t("error.write"));
    }
  }

  static async #onSeeUser(_event, target) {
    const page = fromUuidSync(this.#selected);
    if (!isPage(page)) return;
    try {
      await show.toggleVisible(page, target.dataset.user);
    } catch (err) {
      log.error("setting who can see it failed", err);
      ui.notifications.error(t("error.write"));
    }
  }

  static async #onClassic() {
    await game.settings.set(MODULE_ID, "classic", true);
    await this.close();
    openClassicJournal();
    ui.notifications.info(t("classic.on"));
  }

  static #onRescan() {
    void loadFiles(true);
    this.render();
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    this.#opts = null;
    this.#focus = null;
    this.#sticky = null;
    this.#returnTo = null;
  }
}

/** A name, asked for in a small dialog; null when cancelled. */
async function promptName() {
  const DialogV2 = foundry.applications.api.DialogV2;
  try {
    const name = await DialogV2.prompt({
      window: { title: t("section.newTitle") },
      content: `<div class="form-group"><label>${t("section.name")}</label><input type="text" name="name" autofocus></div>`,
      ok: { label: t("section.create"), callback: (_event, button) => button.form.elements.name.value.trim() },
      rejectClose: false
    });
    return name || null;
  } catch {
    return null;
  }
}

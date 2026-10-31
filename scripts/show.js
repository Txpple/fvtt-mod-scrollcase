/**
 * The module's only writes to the world, each one the stock journal makes itself: a page's
 * ownership (the Show dialog's and the ownership dialog's write), a page's section, a new section,
 * a new image page for a kept file. Showing is a message on the module's own socket channel (not
 * data: nothing is stored): each player's client it is for opens it in the Reader, or, in Classic
 * Mode or for a PDF, as Foundry's own Show would (handouts.js, `receiveShow`).
 *
 * Ownership writes on one page run one after another, each reading the page as the last one left
 * it, so two quick toggles never build on the same stale map. A Show that reveals a page records
 * the map it replaced and the map it wrote, so Undo can put it back, and refuses when the page has
 * changed since.
 */

import { log, MODULE_ID, setting, t } from "./common.js";
import { kindOf, LEVEL, prettyName, visibilityWrite, whoSees } from "./decide/handouts.js";
import * as memory from "./memory.js";
import { Reader } from "./reader.js";

/** The module's socket channel (module.json declares `socket: true`). */
export const CHANNEL = `module.${MODULE_ID}`;

/** Tell the players' clients to open something: a page (`uuid`), or a picture on no page (`src`). */
function send(message) {
  game.socket.emit(CHANNEL, { action: "show", from: game.user.id, ...message });
}

/** The players: every user who is neither a GM (Gamemaster or Assistant) nor banned, connected or not. */
export const players = () => game.users.filter(u => !u.isGM && u.role > CONST.USER_ROLES.NONE);

/** The players connected now. */
export const onlinePlayers = () => players().filter(u => u.active);

const own = doc => doc?._source?.ownership ?? doc?.ownership ?? {};

const sameMap = (a, b) => {
  const norm = o => JSON.stringify(Object.entries(o ?? {}).sort(([x], [y]) => x.localeCompare(y)));
  return norm(a) === norm(b);
};

/** Who of the players can see a page: { all, none, ids }. */
export const whoCanSee = page => whoSees(own(page), own(page.parent), players().map(u => u.id));

/** One queue per page: each ownership write waits for the one before it. */
const queues = new Map();
function queued(page, fn) {
  const prior = queues.get(page.uuid) ?? Promise.resolve();
  const next = prior.catch(() => {}).then(fn);
  queues.set(page.uuid, next);
  const done = () => {
    if (queues.get(page.uuid) === next) queues.delete(page.uuid);
  };
  next.then(done, done);
  return next;
}

/** Replace a page's ownership map whole, the way the stock dialog writes it. */
async function writeOwnership(page, map) {
  const replace = globalThis._replace;
  if (typeof replace === "function") await page.update({ ownership: replace(map) });
  else await page.update({ ownership: map }, { diff: false, recursive: false });
}

/**
 * Make exactly `wanted` (user ids, or a function of the ids that see it now) of the players able
 * to see the page. Returns { before, after } (the maps, for an undo), or null when nothing changed.
 */
export function setVisible(page, wanted) {
  return queued(page, async () => {
    const before = foundry.utils.deepClone(own(page));
    const ids = typeof wanted === "function" ? wanted(whoCanSee(page).ids) : wanted;
    const next = visibilityWrite(before, own(page.parent), players().map(u => u.id), ids);
    if (!next) return null;
    await writeOwnership(page, next);
    return { before, after: foundry.utils.deepClone(next) };
  });
}

/** One player in or out, decided against the page as it is when the write runs. */
export const toggleVisible = (page, userId) =>
  setVisible(page, ids => (ids.includes(userId) ? ids.filter(u => u !== userId) : [...ids, userId]));

/** Everyone in, or (when everyone already sees it) everyone out. */
export const toggleEveryone = page =>
  setVisible(page, ids => (ids.length === players().length ? [] : players().map(u => u.id)));

/* -------------------------------------------------- */
/*  The last reveal, for Undo                         */
/* -------------------------------------------------- */

const UNDO_FOR = 10 * 60 * 1000;
let reveal = null;

/** The last reveal this client made, while it can still be undone (ten minutes, the page still there). */
export function lastReveal() {
  if (!reveal) return null;
  if (Date.now() - reveal.at > UNDO_FOR || !fromUuidSync(reveal.uuid, { strict: false })) reveal = null;
  return reveal;
}

export const forgetReveal = uuid => {
  if (!uuid || reveal?.uuid === uuid) reveal = null;
};

/**
 * Put the page back as it was before the reveal, unless it has changed since (another GM, the stock
 * dialog, a later toggle): then nothing is written and the answer says so.
 * @returns {Promise<"undone" | "changed" | "gone">}
 */
export async function undoReveal() {
  const r = lastReveal();
  reveal = null;
  const page = r ? fromUuidSync(r.uuid, { strict: false }) : null;
  if (!page) return "gone";
  return queued(page, async () => {
    if (!sameMap(own(page), r.after)) return "changed";
    await writeOwnership(page, r.before);
    return "undone";
  });
}

/* -------------------------------------------------- */
/*  Showing                                           */
/* -------------------------------------------------- */

/** What is being shown right now, so a double click or a double Enter shows it once. */
const showing = new Set();

const toWords = ids => (ids ? ids.map(id => game.users.get(id)?.name ?? id).join(", ") : t("show.everyone"));

/**
 * Show a page to players, now. `to` is null (everyone connected) or user ids; `keep` makes the
 * page visible to them first, so it stays in their Handouts. Their clients open it in the Reader,
 * or, with `picture` (a src), that picture alone: then the page's ownership is never touched,
 * since the players were shown the picture and not the page.
 * @returns {Promise<{ revealed: object|null } | null>} null when the same thing was already being shown
 */
export async function showPage(page, { to = null, keep = setting("showKeeps"), title = true, caption = true, picture = null } = {}) {
  if (!page?.isOwner) throw new Error(t("show.notOwner"));
  if (showing.has(page.uuid)) return null;
  showing.add(page.uuid);
  try {
    let revealed = null;
    if (keep && !picture) {
      const add = to ?? players().map(u => u.id);
      const change = await setVisible(page, ids => [...new Set([...ids, ...add])]);
      if (change) {
        revealed = { uuid: page.uuid, name: page.name, whom: to ? toWords(to) : t("show.allPlayers"), at: Date.now(), ...change };
        reveal = revealed;
      }
    }
    const users = to ?? [];
    send({ uuid: page.uuid, users, picture: picture || null, title, caption });
    memory.noteShown(page.uuid, toWords(to), to);
    Hooks.callAll("handouts.shown", page, users);
    return { revealed };
  } finally {
    showing.delete(page.uuid);
  }
}

let making = null;

/** The journal kept files go into, made (GM only) on first use; two quick calls make one. */
export function handoutsJournal() {
  const name = setting("handoutsJournal") || t("keep.defaultJournal");
  const found = game.journal.getName(name);
  if (found) return Promise.resolve(found);
  making ??= CONFIG.JournalEntry.documentClass.create({ name, ownership: { default: LEVEL.NONE } }).finally(() => {
    making = null;
  });
  return making;
}

/**
 * A file kept as a handout: a plain image page in the Handouts journal, GM only until shown,
 * whatever that journal itself lets players see.
 */
export async function keepFile(src) {
  const entry = await handoutsJournal();
  const [page] = await entry.createEmbeddedDocuments("JournalEntryPage", [
    {
      name: prettyName(src),
      type: "image",
      src,
      ownership: { default: LEVEL.NONE },
      sort: (Math.max(0, ...entry.pages.map(p => p.sort ?? 0)) || 0) + CONST.SORT_INTEGER_DENSITY
    }
  ]);
  return page;
}

/**
 * Show a file that is on no page: kept first when `keep` (its new page returned), else the picture
 * alone (null). Undefined when the same file was already being shown.
 */
export async function showFile(src, { to = null, keep = setting("showKeeps"), title = true } = {}) {
  if (showing.has(src)) return undefined;
  showing.add(src);
  try {
    if (keep) {
      const page = await keepFile(src);
      await showPage(page, { to, keep: true, title });
      return page;
    }
    send({ src, name: prettyName(src), users: to ?? [], title });
    memory.noteShown(src, toWords(to), to);
    Hooks.callAll("handouts.shown", null, to ?? [], src);
    return null;
  } finally {
    showing.delete(src);
  }
}

/** File a page under a section of its journal (or none), as the stock sheet does. */
export async function setSection(page, categoryId) {
  const next = categoryId || null;
  if ((page.category ?? null) === next) return false;
  await page.update({ category: next });
  return true;
}

/** A new section in a journal, last in its order. */
export async function newSection(entry, name) {
  const sort = (Math.max(0, ...entry.categories.map(c => c.sort ?? 0)) || 0) + CONST.SORT_INTEGER_DENSITY;
  const [category] = await entry.createEmbeddedDocuments("JournalEntryCategory", [{ name, sort }]);
  return category;
}

/** Open a page in the stock journal sheet, on that page. */
export function openInJournal(page) {
  try {
    return page.parent.sheet.render({ force: true, pageId: page.id });
  } catch (err) {
    log.error("opening the journal sheet failed", err);
  }
}

/** Open a page for reading: the Reader (its picture and its text, nothing else); a PDF in the journal, which shows one. */
export function openForReading(page) {
  if (kindOf(page.type) === "pdf") return openInJournal(page);
  return Reader.open(page);
}

/** Open a picture in Foundry's image popout, for the GM's own look. */
export function openPicture(src, title) {
  const ImagePopout = foundry.applications?.apps?.ImagePopout;
  if (ImagePopout) return new ImagePopout({ src, window: { title: title ?? prettyName(src) } }).render({ force: true });
}

// @ts-check
/**
 * The decisions that need no Foundry: what a card shows, what a search matches and why, and the
 * ownership map a "who can see it" choice comes to. Tested in tests/scrollcase.test.js.
 */

/** Foundry's ownership levels (CONST.DOCUMENT_OWNERSHIP_LEVELS), copied so this file needs no Foundry. */
export const LEVEL = Object.freeze({ INHERIT: -1, NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 });

/** The card's kind from a page's type: dnd5e's own page types read as text. */
export function kindOf(type) {
  if (type === "image" || type === "video" || type === "pdf") return type;
  return "text";
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", mdash: "—", ndash: "–", hellip: "…" };

/** A page's HTML as plain words: tags gone, enricher links read as their labels, spaces collapsed. */
export function plainText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/h[1-6]>/gi, " · ")
    .replace(/<\/(p|div|li|blockquote|tr|figcaption)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/@\w+\[([^\]]*)\]/g, "$1")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .replace(/([.!?:;,])\s·\s/g, "$1 ")
    .replace(/(?:\s·)+\s·\s/g, " · ")
    .replace(/^[\s·]+|[\s·]+$/g, "")
    .trim();
}

/** The first lines of a page's text, cut at a word. */
export function excerptOf(html, max = 180) {
  const text = plainText(html);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:—-]+$/, "")}…`;
}

/** The src of the first image in a page's HTML, or null. */
export function firstImage(html) {
  const m = /<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/i.exec(String(html ?? ""));
  return m ? m[2] : null;
}

/** Every image src in a page's HTML. */
export function allImages(html) {
  const out = [];
  const re = /<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/gi;
  let m = re.exec(String(html ?? ""));
  while (m) {
    out.push(m[2]);
    m = re.exec(String(html ?? ""));
  }
  return out;
}

/**
 * The picture a card shows: an image page's own file; a text page's first image (the Bestiary's
 * portraits); nothing for a video or a PDF (they show their icon).
 * @param {{ type: string, src?: string | null, html?: string | null }} page
 */
export function pictureOf(page) {
  const kind = kindOf(page.type);
  if (kind === "image") return page.src || null;
  if (kind === "text") return firstImage(page.html);
  return null;
}

/** A path's last part. */
export const fileName = path => String(path ?? "").split(/[\\/]/).pop() ?? "";

/** A path less its last part, with a trailing slash. */
export function folderOf(path) {
  const parts = String(path ?? "").split("/");
  parts.pop();
  return parts.length ? `${parts.join("/")}/` : "";
}

const SMALL = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"]);
const UPPER = new Set(["dm", "gm", "npc", "pc", "hp", "ac", "dc", "ui"]);

/** A file's name as a page name: no extension, words for hyphens, in title case. */
export function prettyName(path) {
  let raw = String(path ?? "");
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // A stray % in a name: read it as it is.
  }
  const base = fileName(raw).replace(/\.[^.]+$/, "");
  const words = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return "Handout";
  return words
    .map((w, i) => {
      const low = w.toLowerCase();
      if (UPPER.has(low)) return low.toUpperCase();
      if (i && SMALL.has(low)) return low;
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/** A path as one spelling: decoded, no leading slash, no query. */
export function normPath(p) {
  const s = String(p ?? "").replace(/\?.*$/, "");
  try {
    return decodeURIComponent(s).replace(/^\/+/, "");
  } catch {
    return s.replace(/^\/+/, "");
  }
}

/** Two paths name the same file, whatever their encoding or a leading slash. */
export const samePath = (a, b) => normPath(a) === normPath(b);

/** The order the fields are searched in, best first; the label says where a match was found. */
export const FIELDS = Object.freeze(["name", "caption", "section", "journal", "folder", "file", "text"]);

/**
 * Whether a card matches a query, and where. Every word of the query must be found somewhere;
 * the answer names the first field that is not the name (null: no match; "": all in the name).
 * @param {Partial<Record<string, string>>} fields lower-cased already
 * @param {string} query
 */
export function matchWhy(fields, query) {
  const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  let why = "";
  for (const word of words) {
    const at = FIELDS.find(f => (fields[f] ?? "").includes(word));
    if (!at) return null;
    if (at !== "name" && !why) why = at;
  }
  return why;
}

/** A card's fields for matchWhy, lower-cased. */
export function searchFields({ name, caption, section, journal, folder, file, text }) {
  const low = s => String(s ?? "").toLowerCase();
  return { name: low(name), caption: low(caption), section: low(section), journal: low(journal), folder: low(folder), file: low(file), text: low(text) };
}

/**
 * The level a user has on a page: its own key, else its default, else (inherit) the entry's.
 * @param {Record<string, number>} pageOwn
 * @param {Record<string, number>} entryOwn
 * @param {string} userId
 */
export function levelOf(pageOwn, entryOwn, userId) {
  let level = pageOwn?.[userId] ?? pageOwn?.default ?? LEVEL.INHERIT;
  if (level === LEVEL.INHERIT) level = entryOwn?.[userId] ?? entryOwn?.default ?? LEVEL.NONE;
  return level;
}

/**
 * The page's ownership map once the players in `wanted` can see it and the others cannot: the
 * smallest change that gets there, as the stock ownership dialog would write it. Only the players
 * whose visibility changes are touched (another player's Limited key stays); everyone at once
 * moves the default to Observer, no one at once takes it back to inherit (None, when the journal
 * itself lets players see). Returns null when no player's visibility would change, so a page that
 * already inherits what is wanted keeps inheriting.
 * @param {Record<string, number>} pageOwn
 * @param {Record<string, number>} entryOwn
 * @param {string[]} players the non-GM users
 * @param {Iterable<string>} wanted
 */
export function visibilityWrite(pageOwn, entryOwn, players, wanted) {
  const want = new Set(wanted);
  /** @type {Record<string, number>} */
  const next = { ...(pageOwn ?? {}) };
  const sees = p => levelOf(next, entryOwn, p) >= LEVEL.OBSERVER;
  if (!players.length || players.every(p => sees(p) === want.has(p))) return null;
  const all = players.every(p => want.has(p));
  const none = players.every(p => !want.has(p));
  const entryDefault = entryOwn?.default ?? LEVEL.NONE;
  const pageDefault = next.default ?? LEVEL.INHERIT;
  const inherited = pageDefault === LEVEL.INHERIT ? entryDefault : pageDefault;
  if (all && inherited < LEVEL.OBSERVER) next.default = LEVEL.OBSERVER;
  if (none && inherited >= LEVEL.OBSERVER) next.default = entryDefault >= LEVEL.OBSERVER ? LEVEL.NONE : LEVEL.INHERIT;
  for (const p of players) {
    if (sees(p) === want.has(p)) continue;
    if (want.has(p)) {
      // A key of the player's own that hides it goes first; the default may be enough.
      if (next[p] !== undefined && next[p] < LEVEL.OBSERVER) delete next[p];
      if (!sees(p)) next[p] = LEVEL.OBSERVER;
    } else {
      if (next[p] !== undefined && next[p] >= LEVEL.OBSERVER) delete next[p];
      if (sees(p)) next[p] = LEVEL.NONE;
    }
  }
  return next;
}

/** The two lists hold the same ids. */
export const sameIds = (a, b) => a.length === b.length && a.every(x => b.includes(x));

/**
 * A page's HTML as a reader without ownership gets it: Foundry's unrevealed secret sections
 * (`<section class="secret">`, not `revealed`) removed, as the page sheet does for a non-owner.
 */
export function stripSecrets(html) {
  if (!html || !/secret/i.test(html)) return html ?? "";
  // In a browser, Foundry's own rule on a parsed copy (an inert template: nothing loads or runs).
  if (typeof document !== "undefined" && document.createElement) {
    const template = document.createElement("template");
    template.innerHTML = String(html);
    for (const el of template.content.querySelectorAll("section.secret:not(.revealed)")) el.remove();
    return template.innerHTML;
  }
  return stripSecretsText(html);
}

/** The same without a DOM (the tests, a worker): a scan of the section tags. */
export function stripSecretsText(html) {
  const s = String(html);
  const tag = /<(\/?)section\b([^>]*)>/gi;
  const stack = [];
  const cuts = [];
  let m = tag.exec(s);
  while (m) {
    if (!m[1]) {
      const cls = /(?:^|\s)class\s*=\s*(?:(["'])([^"']*)\1|([^\s"'>]+))/i.exec(m[2]);
      const value = cls ? (cls[2] ?? cls[3] ?? "") : "";
      stack.push({ at: m.index, secret: /(?:^|\s)secret(?:\s|$)/.test(value) && !/(?:^|\s)revealed(?:\s|$)/.test(value) });
    } else {
      const open = stack.pop();
      if (open?.secret) cuts.push([open.at, tag.lastIndex]);
    }
    m = tag.exec(s);
  }
  // A secret never closed runs to the end.
  for (const open of stack) if (open.secret) cuts.push([open.at, s.length]);
  cuts.sort((x, y) => x[0] - y[0]);
  let out = "";
  let pos = 0;
  for (const [from, to] of cuts) {
    if (from < pos) continue;
    out += s.slice(pos, from);
    pos = to;
  }
  return out + s.slice(pos);
}

/**
 * Who of the players can see a page: "all", "none", or the ids.
 * @returns {{ all: boolean, none: boolean, ids: string[] }}
 */
export function whoSees(pageOwn, entryOwn, players) {
  const ids = players.filter(p => levelOf(pageOwn, entryOwn, p) >= LEVEL.OBSERVER);
  return { all: players.length > 0 && ids.length === players.length, none: ids.length === 0, ids };
}

/**
 * A remembered list, newest first, one row per key, at most `max` long.
 * @template {{ key: string }} T
 * @param {T[]} list
 * @param {T} row
 */
export function remember(list, row, max = 60) {
  return [row, ...(list ?? []).filter(r => r.key !== row.key)].slice(0, max);
}

/** The asset folders setting as paths: one per line or comma, blanks dropped, no trailing slash. */
export function folderList(text, fallback) {
  const list = String(text ?? "")
    .split(/[\n,]+/)
    .map(s => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return list.length ? list : fallback;
}

/** An image file, by its extension. */
export const isImageFile = path => /\.(webp|png|jpe?g|gif|avif|svg|bmp)$/i.test(String(path ?? "").replace(/\?.*$/, ""));

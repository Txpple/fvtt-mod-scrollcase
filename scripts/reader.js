/**
 * The Reader: one page, simply. Its picture and its text in a plain window, nothing else, for a
 * player reading a handout (and the GM looking at one): no page list, no journal around it. It is
 * also what a GM's Show opens on the players' screens: a page, just its picture, or a picture on
 * no page at all. One window per page or picture; a page's follows it as it is edited and closes
 * when the page is gone or (unless the GM showed it) the reader may no longer see it. The text is
 * enriched as the page sheet would for this reader, so a player never sees an unrevealed secret.
 * A PDF opens in the journal, which can show one.
 */

import { log, MODULE_ID, t } from "./common.js";
import { kindOf, prettyName } from "./decide/scrollcase.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const idFor = page => `scrollcase-reader-${page.id}`;

/** A short, stable id for a picture's Reader, from its path. */
function idForSrc(src) {
  let h = 0;
  for (const c of String(src)) h = (Math.imul(h, 31) + c.codePointAt(0)) | 0;
  return `scrollcase-reader-file-${(h >>> 0).toString(36)}`;
}

export class Reader extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["scrollcase-reader"],
    window: { icon: "fa-solid fa-book-open-reader", resizable: true },
    position: { width: 680, height: "auto" },
    actions: { openJournal: Reader.#onOpenJournal }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/reader.hbs`, scrollable: [".hdt-reader-body"] }
  };

  /**
   * Open a page in its Reader, or bring that Reader forward. `shown`: the GM showed it, so it stays
   * open even for a reader without the page's permission (Foundry's own Show allows the same);
   * `picture`: only that picture, with the page's name; `caption` false: no caption.
   */
  static open(page, { shown = false, picture = null, caption = true, title = true } = {}) {
    const id = picture ? idForSrc(picture) : idFor(page);
    const open = foundry.applications.instances.get(id);
    if (open) {
      if (shown) open.options.shown = true;
      open.bringToFront();
      return open.render();
    }
    return new Reader({ id, pageUuid: page.uuid, shown, picture, caption, showName: title }).render({ force: true });
  }

  /** Open a picture that is on no page, under a name. */
  static openFile(src, name, { title = true } = {}) {
    const id = idForSrc(src);
    const open = foundry.applications.instances.get(id);
    if (open) {
      open.bringToFront();
      return open.render();
    }
    return new Reader({ id, picture: src, name: name || prettyName(src), showName: title }).render({ force: true });
  }

  /** Redraw a page's Reader after an edit, or close it when the reader may no longer see the page. */
  static refresh(page) {
    const app = foundry.applications.instances.get(idFor(page));
    if (!app?.rendered) return;
    if (!app.options.shown && !page.testUserPermission(game.user, "OBSERVER")) return void app.close();
    void app.render();
  }

  static closeFor(page) {
    void foundry.applications.instances.get(idFor(page))?.close();
  }

  get page() {
    return this.options.pageUuid ? fromUuidSync(this.options.pageUuid, { strict: false }) : null;
  }

  /** @override */
  get title() {
    return this.page?.name ?? this.options.name ?? t("reader.gone");
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const page = this.page;
    const picture = this.options.picture;
    context.isGM = game.user.isGM;
    context.showName = this.options.showName !== false;
    // Just a picture: a page's (with its name) or a file on no page.
    if (picture) {
      Object.assign(context, { name: page?.name ?? this.options.name, isImage: true, src: picture, caption: "" });
      context.canOpen = context.isGM && !!page;
      return context;
    }
    if (!page) return { ...context, empty: true };
    const kind = kindOf(page.type);
    context.name = page.name;
    context.canOpen = context.isGM;
    context.isImage = kind === "image" && !!page.src;
    context.isVideo = kind === "video" && !!page.src;
    context.src = page.src;
    context.caption = this.options.caption === false ? "" : (page.image?.caption ?? "");
    if (kind === "text" && page.text?.content) {
      try {
        const TextEditor = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
        context.html = await TextEditor.enrichHTML(page.text.content, { secrets: page.isOwner, relativeTo: page });
      } catch (err) {
        log.error("enriching the page's text failed", err);
        context.html = "";
      }
    }
    context.empty = !context.isImage && !context.isVideo && !context.html;
    return context;
  }

  static #onOpenJournal() {
    const page = this.page;
    if (!page) return;
    void this.close();
    page.parent.sheet.render({ force: true, pageId: page.id });
  }
}

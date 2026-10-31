/**
 * The Reader: one page, simply. Its picture and its text in a plain window, nothing else, for a
 * player reading a handout (and the GM looking at one): no page list, no journal around it. One
 * window per page; it follows the page as it is edited and closes when the page is gone or the
 * reader may no longer see it. The text is enriched as the page sheet would for this reader, so
 * a player never sees an unrevealed secret. A PDF opens in the journal, which can show one.
 */

import { log, MODULE_ID, t } from "./common.js";
import { kindOf } from "./decide/handouts.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const idFor = page => `handouts-reader-${page.id}`;

export class Reader extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["handouts-reader"],
    window: { icon: "fa-solid fa-book-open-reader", resizable: true },
    position: { width: 680, height: "auto" },
    actions: { openJournal: Reader.#onOpenJournal }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/reader.hbs`, scrollable: [".hdt-reader-body"] }
  };

  /** Open a page in its Reader, or bring that Reader forward. */
  static open(page) {
    const open = foundry.applications.instances.get(idFor(page));
    if (open) {
      open.bringToFront();
      return open.render();
    }
    return new Reader({ id: idFor(page), pageUuid: page.uuid }).render({ force: true });
  }

  /** Redraw a page's Reader after an edit, or close it when the reader may no longer see the page. */
  static refresh(page) {
    const app = foundry.applications.instances.get(idFor(page));
    if (!app?.rendered) return;
    if (!page.testUserPermission(game.user, "OBSERVER")) return void app.close();
    void app.render();
  }

  static closeFor(page) {
    void foundry.applications.instances.get(idFor(page))?.close();
  }

  get page() {
    return fromUuidSync(this.options.pageUuid, { strict: false });
  }

  /** @override */
  get title() {
    return this.page?.name ?? t("reader.gone");
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const page = this.page;
    context.isGM = game.user.isGM;
    if (!page) return { ...context, empty: true };
    const kind = kindOf(page.type);
    context.name = page.name;
    context.isImage = kind === "image" && !!page.src;
    context.isVideo = kind === "video" && !!page.src;
    context.src = page.src;
    context.caption = page.image?.caption ?? "";
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

import { describe, expect, it } from "vitest";
import {
  allImages,
  excerptOf,
  exportName,
  exportOf,
  firstImage,
  folderList,
  folderOf,
  isImageFile,
  kindOf,
  LEVEL,
  levelOf,
  matchWhy,
  normPath,
  pictureOf,
  plainText,
  prettyName,
  remember,
  sameIds,
  samePath,
  searchFields,
  stripSecrets,
  visibilityWrite,
  whoSees,
  withoutImages
} from "../scripts/decide/scrollcase.js";

const { INHERIT, NONE, LIMITED, OBSERVER, OWNER } = LEVEL;
const P = ["u1", "u2", "u3"];

describe("kindOf", () => {
  it("reads dnd5e's page types as text", () => {
    expect(kindOf("image")).toBe("image");
    expect(kindOf("pdf")).toBe("pdf");
    expect(kindOf("video")).toBe("video");
    expect(kindOf("text")).toBe("text");
    expect(kindOf("map")).toBe("text");
    expect(kindOf("spells")).toBe("text");
  });
});

describe("plainText and excerptOf", () => {
  it("drops tags, reads enricher links as their labels, decodes entities", () => {
    const html =
      "<p><strong>@UUID[Macro.abc]{Open the Door}</strong></p><p>Shut &amp; locked&nbsp;now — &#8217;tis.</p>";
    expect(plainText(html)).toBe("Open the Door Shut & locked now — ’tis.");
  });
  it("drops scripts and styles, keeps words apart across blocks", () => {
    expect(plainText("<style>p{}</style><h2>Caves</h2><ul><li>A</li><li>B</li></ul>")).toBe(
      "Caves · A B"
    );
  });
  it("cuts at a word with an ellipsis", () => {
    const text = "word ".repeat(80);
    const ex = excerptOf(`<p>${text}</p>`, 40);
    expect(ex.endsWith("…")).toBe(true);
    expect(ex.length).toBeLessThanOrEqual(41);
    expect(ex).not.toMatch(/ …$/);
  });
  it("keeps a short text whole", () => {
    expect(excerptOf("<p>Short.</p>")).toBe("Short.");
    expect(excerptOf(null)).toBe("");
  });
});

describe("pictures", () => {
  const html =
    '<figure><img src="worlds/w/assets/portraits/grimlock.png" alt="x"></figure><img src=\'b.webp\'>';
  it("finds the first and every image", () => {
    expect(firstImage(html)).toBe("worlds/w/assets/portraits/grimlock.png");
    expect(allImages(html)).toEqual(["worlds/w/assets/portraits/grimlock.png", "b.webp"]);
    expect(firstImage("<p>none</p>")).toBeNull();
  });
  it("picks the page's picture by its kind", () => {
    expect(pictureOf({ type: "image", src: "a.webp" })).toBe("a.webp");
    expect(pictureOf({ type: "image", src: null })).toBeNull();
    expect(pictureOf({ type: "text", html })).toBe("worlds/w/assets/portraits/grimlock.png");
    expect(pictureOf({ type: "video", src: "v.webm" })).toBeNull();
  });
});

describe("paths", () => {
  it("names and folders", () => {
    expect(folderOf("worlds/w/assets/maps/the-breach.webp")).toBe("worlds/w/assets/maps/");
    expect(folderOf("x.png")).toBe("");
    expect(prettyName("worlds/w/assets/handouts/tychon-in-the-apprentices-robe.webp")).toBe(
      "Tychon in the Apprentices Robe"
    );
    expect(prettyName("a/My%20File_2.png")).toBe("My File 2");
    expect(prettyName("a/dm-stage-area.webp")).toBe("DM Stage Area");
    expect(prettyName("a/100%25-the-end.png")).toBe("100% the End");
    expect(prettyName("a/50%-off.png")).toBe("50% Off");
  });
  it("compares spellings of one path", () => {
    expect(samePath("/worlds/w/a%20b.png", "worlds/w/a b.png")).toBe(true);
    expect(samePath("a.png?123", "a.png")).toBe(true);
    expect(samePath("a.png", "b.png")).toBe(false);
    expect(normPath("%E0%A4%A")).toBe("%E0%A4%A");
  });
  it("knows an image file", () => {
    expect(isImageFile("a.WEBP")).toBe(true);
    expect(isImageFile("a.jpeg?x")).toBe(true);
    expect(isImageFile("a.webm")).toBe(false);
  });
  it("reads the folder setting", () => {
    expect(folderList("", ["x"])).toEqual(["x"]);
    expect(folderList(" a/ ,\n b//\n\n", ["x"])).toEqual(["a", "b"]);
  });
});

describe("matchWhy", () => {
  const f = searchFields({
    name: "Map of Halruaa",
    caption: "",
    section: "Overland",
    journal: "Player Handouts",
    folder: "Adventure Log",
    file: "worlds/w/assets/handouts/halruaa-map.webp",
    text: ""
  });
  it("an empty query matches, with no label", () => {
    expect(matchWhy(f, "")).toBe("");
    expect(matchWhy(f, "   ")).toBe("");
  });
  it("names where the match is", () => {
    expect(matchWhy(f, "halruaa")).toBe("");
    expect(matchWhy(f, "overland")).toBe("section");
    expect(matchWhy(f, "player")).toBe("journal");
    expect(matchWhy(f, "adventure")).toBe("folder");
    expect(matchWhy(f, "webp")).toBe("file");
  });
  it("every word must match somewhere", () => {
    expect(matchWhy(f, "map webp")).toBe("file");
    expect(matchWhy(f, "map dragon")).toBeNull();
    expect(matchWhy(f, "MAP")).toBe("");
  });
});

describe("levelOf", () => {
  it("a page's key, else its default, else the entry's", () => {
    expect(levelOf({ u1: OBSERVER }, {}, "u1")).toBe(OBSERVER);
    expect(levelOf({ default: LIMITED }, { default: OWNER }, "u1")).toBe(LIMITED);
    expect(levelOf({ default: INHERIT }, { default: OBSERVER }, "u1")).toBe(OBSERVER);
    expect(levelOf({ default: INHERIT }, { u1: OWNER, default: NONE }, "u1")).toBe(OWNER);
    expect(levelOf({}, {}, "u1")).toBe(NONE);
  });
});

describe("visibilityWrite", () => {
  const sees = (page, entry) => whoSees(page, entry, P).ids;

  it("everyone: the default to Observer, a hiding key dropped, a GM's key kept", () => {
    const next = visibilityWrite(
      { default: INHERIT, u2: NONE, gm: OWNER },
      { default: NONE },
      P,
      P
    );
    expect(next).toEqual({ default: OBSERVER, gm: OWNER });
  });
  it("keeps a wanted player's Owner", () => {
    const next = visibilityWrite({ default: INHERIT, u1: OWNER }, { default: NONE }, P, P);
    expect(next).toEqual({ default: OBSERVER, u1: OWNER });
  });
  it("a page that already inherits what is wanted keeps inheriting", () => {
    expect(visibilityWrite({ default: INHERIT }, { default: OBSERVER }, P, P)).toBeNull();
  });
  it("no one: back to inherit when the journal hides it", () => {
    const next = visibilityWrite({ default: OBSERVER }, { default: NONE }, P, []);
    expect(next).toEqual({ default: INHERIT });
  });
  it("no one: None when the journal itself lets players see", () => {
    const next = visibilityWrite({ default: INHERIT }, { default: OBSERVER }, P, []);
    expect(next).toEqual({ default: NONE });
    expect(sees(next, { default: OBSERVER })).toEqual([]);
  });
  it("no one: an entry key for one player is overridden on the page", () => {
    const entry = { default: NONE, u2: OBSERVER };
    const next = visibilityWrite({ default: INHERIT }, entry, P, []);
    expect(sees(next, entry)).toEqual([]);
    expect(next.u2).toBe(NONE);
  });
  it("a mix: per-player keys", () => {
    const entry = { default: NONE };
    const next = visibilityWrite({ default: INHERIT }, entry, P, ["u1", "u3"]);
    expect(sees(next, entry)).toEqual(["u1", "u3"]);
    expect(next).toEqual({ default: INHERIT, u1: OBSERVER, u3: OBSERVER });
  });
  it("one player toggled leaves another player's Limited key alone", () => {
    const entry = { default: NONE };
    const next = visibilityWrite({ default: INHERIT, u1: LIMITED }, entry, P, ["u2"]);
    expect(next).toEqual({ default: INHERIT, u1: LIMITED, u2: OBSERVER });
  });
  it("from everyone to all but one", () => {
    const entry = { default: NONE };
    const next = visibilityWrite({ default: OBSERVER }, entry, P, ["u1", "u2"]);
    expect(sees(next, entry)).toEqual(["u1", "u2"]);
    expect(next).toEqual({ default: OBSERVER, u3: NONE });
  });
  it("demotes an unwanted owner so they cannot see it", () => {
    const entry = { default: NONE };
    const next = visibilityWrite({ default: INHERIT, u1: OWNER }, entry, P, []);
    expect(sees(next, entry)).toEqual([]);
  });
  it("no change, no write", () => {
    expect(visibilityWrite({ default: OBSERVER }, { default: NONE }, P, P)).toBeNull();
    expect(visibilityWrite({ default: INHERIT }, { default: NONE }, P, [])).toBeNull();
    expect(
      visibilityWrite({ default: INHERIT, u1: OBSERVER }, { default: NONE }, P, ["u1"])
    ).toBeNull();
  });
  it("never touches a non-player key", () => {
    const next = visibilityWrite({ default: INHERIT, gmId: OWNER }, { default: NONE }, P, ["u2"]);
    expect(next.gmId).toBe(OWNER);
  });
  it("a world with no players: nothing to write, ever", () => {
    expect(visibilityWrite({ default: INHERIT }, { default: NONE }, [], [])).toBeNull();
    expect(visibilityWrite({ default: OBSERVER }, { default: NONE }, [], [])).toBeNull();
  });
});

describe("stripSecrets", () => {
  it("removes unrevealed secrets, nested ones whole, and keeps the rest", () => {
    const html =
      '<p>a</p><section class="secret" id="s"><p>X<img src="z.png"></p></section><section class="secret revealed"><p>R</p></section><p>b</p>';
    expect(stripSecrets(html)).toBe(
      '<p>a</p><section class="secret revealed"><p>R</p></section><p>b</p>'
    );
    expect(
      stripSecrets(
        '<section id="x" class="secret"><section class="inner">in</section>out</section>!'
      )
    ).toBe("!");
    expect(
      stripSecrets('<section class="other"><section class="secret">s</section>k</section>')
    ).toBe('<section class="other">k</section>');
    expect(stripSecrets('<section class="secret">never closed')).toBe("");
    expect(stripSecrets("<p>plain</p>")).toBe("<p>plain</p>");
    expect(firstImage(stripSecrets(html))).toBeNull();
    expect(stripSecrets('<section data-class="x" class="secret">s</section>ok')).toBe("ok");
    expect(stripSecrets("<section class=secret>s</section>ok")).toBe("ok");
    expect(stripSecrets('<section class="secrets">kept</section>')).toBe(
      '<section class="secrets">kept</section>'
    );
  });
});

describe("sameIds", () => {
  it("compares as sets of ids", () => {
    expect(sameIds(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameIds(["a"], ["a", "b"])).toBe(false);
  });
});

describe("remember", () => {
  it("newest first, one row per key, capped", () => {
    let list = [];
    list = remember(list, { key: "a", at: 1 });
    list = remember(list, { key: "b", at: 2 });
    list = remember(list, { key: "a", at: 3 });
    expect(list.map(r => r.key)).toEqual(["a", "b"]);
    expect(list[0].at).toBe(3);
    expect(remember(list, { key: "c" }, 2).map(r => r.key)).toEqual(["c", "a"]);
  });
});

describe("the export", () => {
  it("drops pictures from the HTML and empty figures with them", () => {
    expect(withoutImages('<p>A<img src="a.webp">B</p>')).toBe("<p>AB</p>");
    expect(withoutImages('<figure><img src="x.png" alt=""></figure><p>Text</p>')).toBe(
      "<p>Text</p>"
    );
    expect(
      withoutImages('<figure><img src="x.png"><figcaption>The map</figcaption></figure>')
    ).toBe("<figure><figcaption>The map</figcaption></figure>");
    expect(withoutImages(null)).toBe("");
  });

  it("names the file after the view and the day", () => {
    expect(exportName("Session 02 › Clues", "2026-10-30T21:00:00.000Z")).toBe(
      "scrollcase-session-02-clues-2026-10-30.json"
    );
    expect(exportName("Café Notes", "2026-10-30T00:00:00Z")).toBe(
      "scrollcase-cafe-notes-2026-10-30.json"
    );
    expect(exportName("", "2026-10-30T00:00:00Z")).toBe("scrollcase-entries-2026-10-30.json");
  });

  it("wraps the entries with what was in view", () => {
    const data = exportOf({
      world: "W",
      view: "All pages",
      type: "all",
      search: "",
      at: "2026-10-30T00:00:00Z",
      entries: [{ name: "A" }]
    });
    expect(data).toMatchObject({
      format: "fvtt-mod-scrollcase/entries",
      version: 1,
      view: "All pages",
      search: null,
      count: 1
    });
    expect(
      exportOf({ world: "W", view: "v", type: "text", search: "map", at: "x", entries: [] }).search
    ).toBe("map");
  });
});

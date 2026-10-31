// Screenshots of the UI's states on the sandbox, for a look by eye, and an audit of every card's
// words for leaks of markup: a GM page (the bridge user) and a temporary player page. Writes only a
// scratch journal and a temporary user, both deleted after.
//
//   FOUNDRY_HOST=local node tools/shots.mjs <dir> [--width 1600 --height 1000]
import { mkdirSync, writeFileSync } from "node:fs";
import { Foundry, foundryConfig, loadEnv } from "fvtt-mcp-dnd5e/client";

if (process.env.FOUNDRY_HOST !== "local") {
  console.error("The screenshots write a scratch journal and a temporary user: run them on the sandbox only, with FOUNDRY_HOST=local.");
  process.exit(2);
}

const env = loadEnv();
const dir = process.argv[2];
if (!dir || dir.startsWith("--")) {
  console.error("usage: node tools/shots.mjs <dir> [--width W --height H]");
  process.exit(2);
}
const arg = n => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? Number(process.argv[i + 1]) : null;
};
const width = arg("width") ?? 1600;
const height = arg("height") ?? 1000;
const TEMP_USER = "ZZ-HDT Viewer";
const SCRATCH = "ZZ-HDT Shots";
mkdirSync(dir, { recursive: true });

const settle = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
const watch = (f, label) => {
  f.page?.on("pageerror", err => errors.push(`[${label}] ${err?.message ?? err}`));
  f.page?.on("console", msg => {
    if (msg.type() === "error" && /scroll ?case/i.test(msg.text())) errors.push(`[${label}] ${msg.text()}`);
  });
};

const f = new Foundry(foundryConfig(env));
await f.connect();
watch(f, "gm");
await f.page.setViewportSize({ width, height });
let fp = null;

const shot = async (page, name, fn, a) => {
  if (fn) await page.evaluate(fn, a);
  await settle(650);
  await page.evaluate(() => {
    for (const li of document.querySelectorAll("#notifications .notification")) li.remove();
  });
  await page.screenshot({ path: `${dir}/${name}.png` });
  console.log(`  ${name}.png`);
};

/** Every card's and row's words, flagged where markup or a missing value leaks through. */
const AUDIT = async () => {
  const bad = [
    [/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i, "an HTML entity"],
    [/@\w+\[/, "an enricher link"],
    [/<\/?[a-z][^>]*>/i, "a tag"],
    [/\{\{|\}\}|\{[a-z]+\}/i, "a template hole"],
    [/\b(?:undefined|null|NaN)\b|\[object /, "a missing value"],
    [/\s{2,}/, "doubled spaces"],
    [/^\s|\s$/, "edge spaces"]
  ];
  const out = [];
  const check = (where, text) => {
    for (const [re, what] of bad) if (re.test(text ?? "")) out.push({ where, what, text: String(text).slice(0, 140) });
    if (!String(text ?? "").length) out.push({ where, what: "empty", text: "" });
  };
  const w = foundry.applications.instances.get("scrollcase-library");
  for (const card of w.element.querySelectorAll(".hdt-card")) {
    const name = card.querySelector(".hdt-nm span")?.textContent ?? "";
    check(`card name ${card.dataset.key}`, name);
    const sub = card.querySelector(".hdt-where")?.textContent;
    if (sub) check(`card sub ${name}`, sub);
    const ex = card.querySelector(".hdt-excerpt span")?.textContent;
    if (ex !== undefined) check(`card excerpt ${name}`, ex);
    const badge = card.querySelector(".hdt-badge")?.textContent?.trim();
    if (badge !== undefined) check(`card badge ${name}`, badge);
  }
  for (const row of w.element.querySelectorAll(".hdt-row")) check("rail row", row.textContent.trim().replace(/\s+/g, " "));
  check("count", w.element.querySelector(".hdt-count")?.textContent);
  check("heading", w.element.querySelector(".hdt-head h2")?.textContent);
  return { cards: w.element.querySelectorAll(".hdt-card").length, problems: out };
};

const audit = {};
try {
  await f.evaluate(async ({ scratch }) => {
    await game.settings.set("fvtt-mod-scrollcase", "classic", false);
    for (const app of [...foundry.applications.instances.values()]) if (app.id?.startsWith("handouts")) await app.close();
    for (const j of game.journal.filter(j => j.name === scratch)) await j.delete();
    const img = game.journal.contents.flatMap(j => j.pages.contents).find(p => p.type === "image" && p.src)?.src;
    await CONFIG.JournalEntry.documentClass.create({
      name: scratch,
      ownership: { default: 0 },
      pages: [
        { name: "ZZ-HDT A Handout With A Rather Long Name, To See How The Card Copes", type: "image", src: img },
        { name: "ZZ-HDT Letter", type: "text", text: { content: "<p>Dear &amp; trusted friend — the <strong>@UUID[Actor.x]{Lady in Grey}</strong> waits at the &lt;old&gt; mill.</p><p>Burn this.</p>" } }
      ]
    });
  }, { scratch: SCRATCH });

  await shot(f.page, "01-gm-all", async () => {
    document.querySelector('#sidebar-tabs [data-tab="journal"]')?.click();
    for (let i = 0; i < 80; i++) {
      await new Promise(r => setTimeout(r, 100));
      const el = foundry.applications.instances.get("scrollcase-library")?.element;
      if (el && !el.querySelector(".hdt-loading")) break;
    }
    foundry.applications.instances.get("scrollcase-library").element.querySelector('.hdt-row[data-view="all"]')?.click();
  });
  audit.all = await f.evaluate(AUDIT);
  await shot(f.page, "02-gm-detail-image", async () => {
    const w = foundry.applications.instances.get("scrollcase-library");
    const page = game.journal.contents.flatMap(j => j.pages.contents).find(p => p.name === "Map of Halruaa");
    w.select(page.uuid);
    await w.render();
  });
  await f.page.hover("#scrollcase-library .hdt-card:nth-child(2)").catch(() => {});
  await shot(f.page, "03-gm-hover");
  await shot(f.page, "04-gm-opts-image", async () => {
    foundry.applications.instances.get("scrollcase-library").element.querySelector('.hdt-detail [data-action="openOpts"]')?.click();
  });
  await shot(f.page, "05-gm-opts-text-picture", async () => {
    const w = foundry.applications.instances.get("scrollcase-library");
    w.element.querySelector('.hdt-opts [data-action="optCancel"]')?.click();
    await new Promise(r => setTimeout(r, 300));
    const page = game.journal.contents.flatMap(j => j.pages.contents).find(p => p.name === "Grimlock");
    w.select(page.uuid, { opts: true });
    await w.render();
    await new Promise(r => setTimeout(r, 300));
    w.element.querySelector('.hdt-opts [data-action="optPicture"]')?.click();
  });
  await shot(f.page, "06-gm-search-maze", async () => {
    const w = foundry.applications.instances.get("scrollcase-library");
    w.element.querySelector('.hdt-opts [data-action="optCancel"]')?.click();
    await new Promise(r => setTimeout(r, 300));
    const input = w.element.querySelector("input[name=search]");
    input.value = "maze";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await shot(f.page, "07-gm-search-files", async () => {
    const input = foundry.applications.instances.get("scrollcase-library").element.querySelector("input[name=search]");
    input.value = "hearth home";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await shot(f.page, "08-gm-search-more", async () => {
    const w = foundry.applications.instances.get("scrollcase-library");
    const id = game.journal.getName("Bestiary")?.id;
    w.element.querySelector(`.hdt-row[data-view="j:${id}"]`)?.click();
    await new Promise(r => setTimeout(r, 400));
    const input = w.element.querySelector("input[name=search]");
    input.value = "maze";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await shot(f.page, "09-gm-loose", async () => {
    const w = foundry.applications.instances.get("scrollcase-library");
    const input = w.element.querySelector("input[name=search]");
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    w.element.querySelector('.hdt-row[data-view="loose"]')?.click();
  });
  audit.loose = await f.evaluate(AUDIT);
  await shot(f.page, "10-gm-bestiary-small", async () => {
    const w = foundry.applications.instances.get("scrollcase-library");
    const id = game.journal.getName("Bestiary")?.id;
    w.element.querySelector(`.hdt-row[data-view="j:${id}"]`)?.click();
    await new Promise(r => setTimeout(r, 300));
    w.element.querySelector('[data-action="size"][data-size="s"]')?.click();
  });
  await shot(f.page, "11-gm-gmonly-large", async () => {
    const w = foundry.applications.instances.get("scrollcase-library");
    w.element.querySelector('[data-action="size"][data-size="l"]')?.click();
    await new Promise(r => setTimeout(r, 300));
    w.element.querySelector('.hdt-row[data-view="gm"]')?.click();
  });
  await shot(f.page, "12-gm-text-detail", async () => {
    const w = foundry.applications.instances.get("scrollcase-library");
    w.element.querySelector('[data-action="size"][data-size="m"]')?.click();
    await new Promise(r => setTimeout(r, 300));
    const page = game.journal.contents.flatMap(j => j.pages.contents).find(p => p.name === "ZZ-HDT Letter");
    w.select(page.uuid);
    await w.render();
  });
  audit.gmOnly = await f.evaluate(AUDIT);
  await shot(f.page, "13-gm-reveal-strip", async () => {
    const w = foundry.applications.instances.get("scrollcase-library");
    const page = game.journal.contents.flatMap(j => j.pages.contents).find(p => p.name.startsWith("ZZ-HDT A Handout"));
    w.select(page.uuid);
    await w.render();
    await new Promise(r => setTimeout(r, 300));
    w.element.querySelector('.hdt-detail [data-action="quickShow"]')?.click();
    for (let i = 0; i < 30 && !w.element.querySelector(".hdt-reveal"); i++) await new Promise(r => setTimeout(r, 100));
  });
  await shot(f.page, "14-finder-empty", async () => {
    await game.modules.get("fvtt-mod-scrollcase").api.finder();
  });
  await shot(f.page, "15-finder-query", async () => {
    const app = foundry.applications.instances.get("scrollcase-finder");
    const input = app.element.querySelector("input[name=find]");
    input.value = "grim";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 100));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });
  await shot(f.page, "16-finder-files", async () => {
    const app = foundry.applications.instances.get("scrollcase-finder");
    const input = app.element.querySelector("input[name=find]");
    input.value = "breach";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  audit.finder = await f.evaluate(() => {
    const app = foundry.applications.instances.get("scrollcase-finder");
    const rows = [...app.element.querySelectorAll(".hdt-res")].map(r => r.textContent.replace(/\s+/g, " ").trim());
    return { rows, problems: rows.filter(r => /undefined|null|NaN|&[a-z]+;|@\w+\[|<\//.test(r)) };
  });
  await shot(f.page, "17-classic-directory", async () => {
    await foundry.applications.instances.get("scrollcase-finder")?.close();
    foundry.applications.instances.get("scrollcase-library").element.querySelector('[data-action="classic"]')?.click();
  });
  await f.evaluate(async () => {
    await game.settings.set("fvtt-mod-scrollcase", "classic", false);
    await foundry.applications.instances.get("scrollcase-library")?.close();
  });
  for (const [name, w, h] of [
    ["18-gm-narrow-760", 760, 640],
    ["19-gm-medium-960", 960, 700]
  ]) {
    await shot(
      f.page,
      name,
      async ({ w, h }) => {
        const app = game.modules.get("fvtt-mod-scrollcase").api.open();
        for (let i = 0; i < 30 && !app.rendered; i++) await new Promise(r => setTimeout(r, 100));
        app.setPosition({ width: w, height: h });
      },
      { w, h }
    );
  }
  await f.evaluate(async () => {
    const app = foundry.applications.instances.get("scrollcase-library");
    app?.setPosition({ width: 1180, height: 800 });
    await app?.close();
  });

  // A player: a first look (the baseline), then the GM shows one and makes another visible.
  const userId = await f.evaluate(async name => {
    for (const u of game.users.filter(u => u.name === name)) await u.delete();
    return (await User.implementation.create({ name, role: CONST.USER_ROLES.PLAYER })).id;
  }, TEMP_USER);
  fp = new Foundry({ ...foundryConfig(env), user: TEMP_USER, password: "" });
  await fp.connect();
  watch(fp, "player");
  await fp.page.setViewportSize({ width, height });
  await fp.evaluate(async () => {
    document.querySelector('#sidebar-tabs [data-tab="journal"]')?.click();
    for (let i = 0; i < 40 && !foundry.applications.instances.get("scrollcase-library")?.rendered; i++) await new Promise(r => setTimeout(r, 100));
  });
  await f.evaluate(
    async ({ userId }) => {
      const pages = game.journal.contents.flatMap(j => j.pages.contents);
      const api = game.modules.get("fvtt-mod-scrollcase").api;
      await api.show.setVisible(pages.find(p => p.name === "ZZ-HDT Letter"), [userId]);
      await api.show.showPage(pages.find(p => p.name === "Map of Halruaa"), { to: [userId], keep: false });
    },
    { userId }
  );
  await settle(1500);
  await shot(fp.page, "20-player-shown-popout");
  await shot(fp.page, "21-player-after-show", async () => {
    for (const app of [...foundry.applications.instances.values()]) if (app.constructor.name === "ImagePopout") await app.close();
    foundry.applications.instances.get("scrollcase-library")?.element.querySelector('.hdt-row[data-view="all"]')?.click();
  });
  await shot(fp.page, "22-player-new", async () => {
    foundry.applications.instances.get("scrollcase-library")?.element.querySelector('.hdt-row[data-view="unseen"]')?.click();
  });
  await shot(fp.page, "23-player-all", async () => {
    foundry.applications.instances.get("scrollcase-library")?.element.querySelector('.hdt-row[data-view="all"]')?.click();
  });
  audit.player = await fp.evaluate(AUDIT);
  const openReader = async name => {
    const page = game.journal.contents.flatMap(j => j.pages.contents).find(p => p.name === name);
    foundry.applications.instances.get("scrollcase-library")?.element.querySelector(`.hdt-card[data-key="${page.uuid}"] [data-action="pick"]`)?.click();
    for (let i = 0; i < 40 && !foundry.applications.instances.get(`scrollcase-reader-${page.id}`)?.rendered; i++) await new Promise(r => setTimeout(r, 100));
  };
  await shot(fp.page, "25-player-reader-text", openReader, "Darkmantle");
  await shot(fp.page, "26-player-reader-image", async name => {
    for (const app of [...foundry.applications.instances.values()]) if (app.id?.startsWith("scrollcase-reader-")) await app.close();
    const page = game.journal.contents.flatMap(j => j.pages.contents).find(p => p.name === name);
    foundry.applications.instances.get("scrollcase-library")?.element.querySelector(`.hdt-card[data-key="${page.uuid}"] [data-action="pick"]`)?.click();
    for (let i = 0; i < 40 && !foundry.applications.instances.get(`scrollcase-reader-${page.id}`)?.rendered; i++) await new Promise(r => setTimeout(r, 100));
  }, "The Elders at the Fire");
  await fp.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) if (app.id?.startsWith("scrollcase-reader-")) await app.close();
  });
  await shot(fp.page, "24-player-finder", async () => {
    await game.modules.get("fvtt-mod-scrollcase").api.finder();
    await new Promise(r => setTimeout(r, 300));
    const input = foundry.applications.instances.get("scrollcase-finder").element.querySelector("input[name=find]");
    input.value = "letter";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
} catch (err) {
  console.error(err);
  errors.push(String(err?.message ?? err));
} finally {
  if (fp) await fp.disconnect?.().catch(() => {});
  await f
    .evaluate(
      async ({ name, scratch }) => {
        await game.modules.get("fvtt-mod-scrollcase").api.show.forgetReveal?.();
        for (const u of game.users.filter(u => u.name === name)) await u.delete();
        for (const j of game.journal.filter(j => j.name === scratch)) await j.delete();
        for (const app of [...foundry.applications.instances.values()]) if (app.id?.startsWith("handouts")) await app.close();
      },
      { name: TEMP_USER, scratch: SCRATCH }
    )
    .catch(() => {});
  await f.disconnect?.().catch(() => {});
}
writeFileSync(`${dir}/audit.json`, JSON.stringify(audit, null, 2));
const problems = Object.entries(audit).flatMap(([k, v]) => (v?.problems ?? []).map(p => ({ in: k, ...(typeof p === "string" ? { text: p } : p) })));
console.log(`audit: ${Object.entries(audit).map(([k, v]) => `${k} ${v?.cards ?? v?.rows?.length ?? 0}`).join(", ")}; ${problems.length} problem(s)`);
for (const p of problems.slice(0, 40)) console.log(`  ${p.in}: ${p.where ?? ""} — ${p.what ?? ""}: ${p.text}`);
console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no page errors");
process.exit(errors.length ? 1 : 0);

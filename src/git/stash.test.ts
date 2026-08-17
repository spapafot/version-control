import { describe, it, expect } from "vitest";
import { createMemFs } from "./fs";
import { GitEngine } from "./engine";
import { runSetup, type SetupStep } from "./setup";

async function seeded(steps: SetupStep[]): Promise<GitEngine> {
  const engine = new GitEngine(createMemFs());
  await runSetup(engine, steps);
  return engine;
}

/** prices.html committed as 1.80; the tests dirty it from there. */
const BASE: SetupStep[] = [
  { do: "file", path: "index.html", content: "<h1>Central Café</h1>\n" },
  { do: "file", path: "prices.html", content: "<p>Greek coffee 1.80</p>\n" },
  { do: "init" },
  { do: "add", paths: "*" },
  { do: "commit", message: "Basic pages" },
];

const status = (s: Awaited<ReturnType<GitEngine["snapshot"]>>, path: string) =>
  s.status.find((f) => f.path === path);

describe("stash push", () => {
  it("shelves an unstaged change and leaves the tree clean at HEAD", async () => {
    const engine = await seeded(BASE);
    await engine.writeFile("prices.html", "<p>Greek coffee 2.20</p>\n");

    const r = await engine.stashPush();
    expect(r.saved).toBe(true);
    expect(engine.stash).toHaveLength(1);
    expect(engine.stash[0].label).toMatch(
      /^WIP on main: [0-9a-f]{7} Basic pages$/,
    );
    expect(engine.stash[0].files.map((f) => f.path)).toEqual(["prices.html"]);

    expect(await engine.readFile("prices.html")).toBe(
      "<p>Greek coffee 1.80</p>\n",
    );
    const s = await engine.snapshot();
    expect(
      s.status.every((f) => !f.staged && !f.unstaged && !f.untracked),
    ).toBe(true);
    expect(s.stash).toEqual([
      { label: engine.stash[0].label, files: ["prices.html"] },
    ]);
  });

  it("also shelves staged changes, and pop brings them back unstaged", async () => {
    const engine = await seeded(BASE);
    await engine.writeFile("prices.html", "<p>Greek coffee 2.20</p>\n");
    await engine.add("prices.html");

    await engine.stashPush();
    expect(await engine.readFile("prices.html")).toBe(
      "<p>Greek coffee 1.80</p>\n",
    );

    await engine.stashPop(0);
    const s = await engine.snapshot();
    expect(await engine.readFile("prices.html")).toBe(
      "<p>Greek coffee 2.20</p>\n",
    );
    // real git default (no --index): the change returns unstaged
    expect(status(s, "prices.html")?.unstaged).toBe("modified");
    expect(status(s, "prices.html")?.staged).toBeNull();
    expect(engine.stash).toHaveLength(0);
  });

  it("a same-byte-length restore is still visible to statusMatrix", async () => {
    // regression guard: memfs same-size writes inside 1 ms hide from
    // statusMatrix's stat shortcut. This is why apply goes through
    // engine.writeFile (monotonic mtime) instead of a raw fs write.
    const engine = await seeded(BASE);
    await engine.writeFile("prices.html", "<p>Greek coffee 2.20</p>\n");
    await engine.stashPush();
    await engine.stashPop(0);

    const s = await engine.snapshot();
    expect(await engine.readFile("prices.html")).toBe(
      "<p>Greek coffee 2.20</p>\n",
    );
    expect(status(s, "prices.html")?.unstaged).toBe("modified");
  });

  it("stashes a deletion, and pop deletes the file again", async () => {
    const engine = await seeded(BASE);
    await engine.deleteFile("prices.html");

    await engine.stashPush();
    expect(await engine.exists("/repo/prices.html")).toBe(true);

    await engine.stashPop(0);
    expect(await engine.exists("/repo/prices.html")).toBe(false);
    expect(status(await engine.snapshot(), "prices.html")?.unstaged).toBe(
      "deleted",
    );
  });

  it("takes a staged new file off disk, and pop returns it untracked", async () => {
    const engine = await seeded(BASE);
    await engine.writeFile("hours.html", "<p>08:00 - 22:00</p>\n");
    await engine.add("hours.html");

    await engine.stashPush();
    expect(await engine.exists("/repo/hours.html")).toBe(false);
    const clean = await engine.snapshot();
    expect(
      clean.status.every((f) => !f.staged && !f.unstaged && !f.untracked),
    ).toBe(true);

    await engine.stashPop(0);
    expect(status(await engine.snapshot(), "hours.html")?.untracked).toBe(true);
  });

  it("leaves untracked files alone unless -u is given", async () => {
    const engine = await seeded(BASE);
    await engine.writeFile("hours.html", "<p>08:00 - 22:00</p>\n");

    const plain = await engine.stashPush();
    expect(plain.saved).toBe(false);
    expect(engine.stash).toHaveLength(0);
    expect(await engine.exists("/repo/hours.html")).toBe(true);

    const withU = await engine.stashPush({ includeUntracked: true });
    expect(withU.saved).toBe(true);
    expect(await engine.exists("/repo/hours.html")).toBe(false);

    await engine.stashPop(0);
    expect(status(await engine.snapshot(), "hours.html")?.untracked).toBe(true);
  });

  it("reports nothing to save on a clean tree", async () => {
    const engine = await seeded(BASE);
    expect((await engine.stashPush()).saved).toBe(false);
    expect(engine.stash).toHaveLength(0);
  });

  it("labels a -m push the way real git does", async () => {
    const engine = await seeded(BASE);
    await engine.writeFile("prices.html", "<p>Greek coffee 2.20</p>\n");
    await engine.stashPush({ message: "new prices" });
    expect(engine.stash[0].label).toBe("On main: new prices");
  });

  it("refuses in the middle of a merge", async () => {
    const engine = await seeded([
      { do: "file", path: "menu.html", content: "<p>a</p>\n" },
      { do: "init" },
      { do: "add", paths: "*" },
      { do: "commit", message: "base" },
      { do: "branch", name: "other" },
      { do: "file", path: "menu.html", content: "<p>ours</p>\n" },
      { do: "add", paths: "*" },
      { do: "commit", message: "ours" },
      { do: "switch", ref: "other" },
      { do: "file", path: "menu.html", content: "<p>theirs</p>\n" },
      { do: "add", paths: "*" },
      { do: "commit", message: "theirs" },
      { do: "switch", ref: "main" },
      { do: "merge", ref: "other" },
    ]);
    await expect(engine.stashPush()).rejects.toThrow(/middle of a merge/);
  });
});

describe("stash stack", () => {
  const TWO: SetupStep[] = [
    ...BASE,
    { do: "file", path: "prices.html", content: "<p>Greek coffee 2.20</p>\n" },
    { do: "stash", message: "new prices" },
    {
      do: "file",
      path: "index.html",
      content: "<h1>Central Café - open late</h1>\n",
    },
    { do: "stash", message: "late hours" },
  ];

  it("orders entries newest-first, like stash@{n}", async () => {
    const engine = await seeded(TWO);
    expect(engine.stash.map((e) => e.label)).toEqual([
      "On main: late hours",
      "On main: new prices",
    ]);
  });

  it("pops a specific entry and leaves the other shelved", async () => {
    const engine = await seeded(TWO);
    await engine.stashPop(1);

    expect(await engine.readFile("prices.html")).toBe(
      "<p>Greek coffee 2.20</p>\n",
    );
    expect(await engine.readFile("index.html")).toBe("<h1>Central Café</h1>\n");
    expect(engine.stash.map((e) => e.label)).toEqual(["On main: late hours"]);
  });

  it("apply keeps the entry, drop removes it, clear empties the stack", async () => {
    const engine = await seeded(TWO);
    await engine.stashApply(0);
    expect(engine.stash).toHaveLength(2);
    expect(await engine.readFile("index.html")).toBe(
      "<h1>Central Café - open late</h1>\n",
    );

    const dropped = engine.stashDrop(0);
    expect(dropped.label).toBe("On main: late hours");
    expect(engine.stash).toHaveLength(1);

    engine.stashClear();
    expect(engine.stash).toHaveLength(0);
  });

  it("refuses to clobber local changes to a stashed path", async () => {
    const engine = await seeded(TWO);
    await engine.writeFile("prices.html", "<p>Greek coffee 9.99</p>\n");
    await expect(engine.stashApply(1)).rejects.toThrow(
      /would be overwritten by merge/,
    );
    expect(await engine.readFile("prices.html")).toBe(
      "<p>Greek coffee 9.99</p>\n",
    );
  });

  it("rejects an out-of-range entry", async () => {
    const engine = await seeded(TWO);
    await expect(engine.stashApply(5)).rejects.toThrow(
      "error: refs/stash@{5} is not a valid reference",
    );
  });

  it("setup stashes are reproducible across identical setups", async () => {
    const a = await seeded(TWO);
    const b = await seeded(TWO);
    expect(a.stash.map((e) => e.oid)).toEqual(b.stash.map((e) => e.oid));
    expect(a.stash.map((e) => e.label)).toEqual(b.stash.map((e) => e.label));
  });

  it("does not touch the HEAD reflog", async () => {
    const before = (await seeded(BASE)).reflog.length;
    const engine = await seeded(TWO);
    expect(engine.reflog).toHaveLength(before);
  });
});

import { describe, it, expect } from "vitest";
import { createMemFs } from "./fs";
import { GitEngine } from "./engine";
import { runSetup, type SetupStep } from "./setup";

function fresh(): GitEngine {
  return new GitEngine(createMemFs());
}

async function seeded(steps: SetupStep[]): Promise<GitEngine> {
  const engine = fresh();
  await runSetup(engine, steps);
  return engine;
}

const PUBLISHED: SetupStep[] = [
  { do: "file", path: "index.html", content: "<h1>Central Café</h1>\n" },
  { do: "init" },
  { do: "add", paths: "*" },
  { do: "commit", message: "Initial version of the site" },
  { do: "publish" },
];

/** origin one commit ahead of the local clone */
const BEHIND: SetupStep[] = [
  ...PUBLISHED,
  {
    do: "onRemote",
    steps: [
      { do: "file", path: "orario.html", content: "<h2>Hours</h2>\n" },
      { do: "add", paths: ["orario.html"] },
      { do: "commit", message: "Opening hours page" },
    ],
  },
];

/** both sides moved, same file → pull conflicts */
const DIVERGED_CONFLICT: SetupStep[] = [
  { do: "file", path: "menu.html", content: "<h2>Menu</h2>\n<p>Greek coffee 1.80</p>\n" },
  { do: "init" },
  { do: "add", paths: "*" },
  { do: "commit", message: "Initial menu" },
  { do: "publish" },
  { do: "file", path: "menu.html", content: "<h2>Menu</h2>\n<p>Greek coffee 2.00</p>\n" },
  { do: "add", paths: ["menu.html"] },
  { do: "commit", message: "New price from the till" },
  {
    do: "onRemote",
    steps: [
      { do: "file", path: "menu.html", content: "<h2>Menu</h2>\n<p>Greek coffee 1.90</p>\n" },
      { do: "add", paths: ["menu.html"] },
      { do: "commit", message: "Adjust coffee price" },
    ],
  },
];

describe("publish / onRemote setup steps", () => {
  it("publish mirrors the branch and wires tracking", async () => {
    const engine = await seeded(PUBLISHED);
    expect(engine.remote).not.toBeNull();
    expect(await engine.exists("/origin/.git")).toBe(true);

    const s = await engine.snapshot();
    expect(s.remote).not.toBeNull();
    expect(s.remote!.branches).toEqual([{ name: "main", oid: s.head.oid }]);
    expect(s.remote!.tracking).toEqual([{ name: "main", oid: s.head.oid }]);
    expect(s.remote!.ahead).toBe(0);
    expect(s.remote!.behind).toBe(0);
    // the tracking label decorates the tip commit
    expect(s.commits[0].refs).toContain("origin/main");
  });

  it("onRemote advances origin while local tracking stays stale", async () => {
    const engine = await seeded(BEHIND);
    const s = await engine.snapshot();
    const origin = s.remote!.branches.find((b) => b.name === "main")!;
    const tracking = s.remote!.tracking.find((t) => t.name === "main")!;
    expect(origin.oid).not.toBe(tracking.oid);
    expect(tracking.oid).toBe(s.head.oid); // still where we published
    expect(s.remote!.ahead).toBe(0);
    expect(s.remote!.behind).toBe(0); // behind ONLY vs tracking, which hasn't moved
    // Maria's commit is not walkable locally yet
    expect(s.commits.some((c) => c.message === "Opening hours page")).toBe(false);
  });

  it("deterministic: same remote setup twice → identical oids in BOTH repos", async () => {
    const heads: string[] = [];
    const originHeads: string[] = [];
    for (let i = 0; i < 2; i++) {
      const engine = await seeded(DIVERGED_CONFLICT);
      heads.push((await engine.snapshot()).head.oid!);
      originHeads.push((await engine.snapshot()).remote!.branches[0].oid);
    }
    expect(heads[0]).toBe(heads[1]);
    expect(originHeads[0]).toBe(originHeads[1]);
    expect(heads[0]).not.toBe(originHeads[0]); // genuinely diverged
  });
});

describe("fetch", () => {
  it("updates tracking, copies objects, leaves workdir + local branch alone", async () => {
    const engine = await seeded(BEHIND);
    const updates = await engine.fetch();
    expect(updates).toHaveLength(1);
    expect(updates[0].branch).toBe("main");
    expect(updates[0].old).not.toBeNull();

    const s = await engine.snapshot();
    expect(s.remote!.tracking[0].oid).toBe(s.remote!.branches[0].oid);
    expect(s.remote!.behind).toBe(1);
    expect(s.remote!.ahead).toBe(0);
    // Maria's commit is now walkable (graph) but NOT on local main…
    expect(s.commits.some((c) => c.message === "Opening hours page")).toBe(true);
    expect(s.branches.find((b) => b.name === "main")!.oid).toBe(s.head.oid);
    // …and her file is not in the working tree
    expect(await engine.exists("/repo/orario.html")).toBe(false);
    expect(s.status.every((f) => !f.staged && !f.unstaged && !f.untracked)).toBe(true);
  });

  it("second fetch is a no-op", async () => {
    const engine = await seeded(BEHIND);
    await engine.fetch();
    expect(await engine.fetch()).toEqual([]);
  });

  it("origin/main resolves through revparse after publish", async () => {
    const engine = await seeded(BEHIND);
    const s = await engine.snapshot();
    expect(await engine.resolve("origin/main")).toBe(s.remote!.tracking[0].oid);
    await engine.fetch();
    const s2 = await engine.snapshot();
    expect(await engine.resolve("origin/main")).toBe(s2.remote!.branches[0].oid);
    expect(await engine.resolve("origin/main~1")).toBe(s.head.oid);
    await expect(engine.resolve("origin/nope")).rejects.toThrow();
  });
});

describe("push", () => {
  const AHEAD: SetupStep[] = [
    ...PUBLISHED,
    { do: "file", path: "events.html", content: "<h2>Events</h2>\n" },
    { do: "add", paths: ["events.html"] },
    { do: "commit", message: "Events page" },
  ];

  it("fast-forwards origin and the tracking ref", async () => {
    const engine = await seeded(AHEAD);
    const r = await engine.push("main");
    expect(r.kind).toBe("ok");
    const s = await engine.snapshot();
    expect(s.remote!.branches[0].oid).toBe(s.head.oid);
    expect(s.remote!.tracking[0].oid).toBe(s.head.oid);
    expect(s.remote!.ahead).toBe(0);
    // pushed again → nothing to do
    expect((await engine.push("main")).kind).toBe("up-to-date");
  });

  it("rejects a non-fast-forward and touches nothing", async () => {
    const engine = await seeded(DIVERGED_CONFLICT);
    const before = await engine.snapshot();
    const r = await engine.push("main");
    expect(r.kind).toBe("rejected");
    const after = await engine.snapshot();
    expect(after.remote!.branches[0].oid).toBe(before.remote!.branches[0].oid);
    expect(after.remote!.tracking[0].oid).toBe(before.remote!.tracking[0].oid);
  });

  it("pushes a branch origin has never seen", async () => {
    const engine = await seeded([
      ...PUBLISHED,
      { do: "branch", name: "feature/site" },
      { do: "switch", ref: "feature/site" },
      { do: "file", path: "site.css", content: "body {}\n" },
      { do: "add", paths: ["site.css"] },
      { do: "commit", message: "Styles" },
    ]);
    const r = await engine.push("feature/site");
    expect(r.kind).toBe("new-branch");
    const s = await engine.snapshot();
    expect(s.remote!.branches.map((b) => b.name).sort()).toEqual(["feature/site", "main"]);
  });
});

describe("pull (fetch + merge composition)", () => {
  it("conflicted pull reuses the merge machinery; abort keeps the fetch", async () => {
    const engine = await seeded(DIVERGED_CONFLICT);
    await engine.fetch();
    const outcome = await engine.merge("origin/main", {
      message: "Merge remote-tracking branch 'origin/main'",
    });
    expect(outcome.kind).toBe("conflict");
    expect(await engine.exists("/repo/.git/MERGE_HEAD")).toBe(true);
    expect(await engine.readFile("menu.html")).toContain("<<<<<<<");

    await engine.abortMerge();
    const s = await engine.snapshot();
    expect(s.merge.inProgress).toBe(false);
    expect(await engine.readFile("menu.html")).toContain("2.00");
    // the fetch half of the pull persists after the abort (real git behavior)
    expect(s.remote!.tracking[0].oid).toBe(s.remote!.branches[0].oid);
  });

  it("resolved pull-merge can be pushed", async () => {
    const engine = await seeded(DIVERGED_CONFLICT);
    await engine.fetch();
    await engine.merge("origin/main", { message: "Merge remote-tracking branch 'origin/main'" });
    await engine.writeFile("menu.html", "<h2>Menu</h2>\n<p>Greek coffee 2.00</p>\n");
    await engine.add("menu.html");
    const oid = await engine.commit({ message: "" });
    const s = await engine.snapshot();
    expect(s.commits.find((c) => c.oid === oid)!.message).toContain(
      "Merge remote-tracking branch 'origin/main'",
    );

    expect((await engine.push("main")).kind).toBe("ok");
    const s2 = await engine.snapshot();
    expect(s2.remote!.branches[0].oid).toBe(s2.head.oid);
  });
});

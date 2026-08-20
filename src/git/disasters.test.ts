import { describe, it, expect } from "vitest";
import * as git from "isomorphic-git";
import { createMemFs } from "./fs";
import { GitEngine } from "./engine";
import { runSetup, type SetupStep } from "./setup";
import { GitOpError } from "./errors";

async function seeded(steps: SetupStep[]): Promise<GitEngine> {
  const engine = new GitEngine(createMemFs());
  await runSetup(engine, steps);
  return engine;
}

const THREE_COMMITS: SetupStep[] = [
  { do: "file", path: "a.txt", content: "a\n" },
  { do: "init" },
  { do: "add", paths: "*" },
  { do: "commit", message: "first" },
  { do: "file", path: "b.txt", content: "b\n" },
  { do: "add", paths: "*" },
  { do: "commit", message: "second" },
  { do: "file", path: "c.txt", content: "c\n" },
  { do: "add", paths: "*" },
  { do: "commit", message: "third" },
];

describe("reflog", () => {
  it("records commits, reset, switch; HEAD@{n} resolves", async () => {
    const engine = await seeded([...THREE_COMMITS, { do: "reset", mode: "hard", target: "HEAD~2" }]);
    const actions = engine.reflog.map((e) => e.action);
    expect(actions[0]).toBe("reset: moving to HEAD~2");
    expect(actions[1]).toBe("commit: third");
    expect(actions[2]).toBe("commit: second");
    expect(actions[3]).toBe("commit: first");

    // lost tip is recoverable via HEAD@{1}
    const lostTip = engine.reflog[1].oid;
    expect(await engine.resolve("HEAD@{1}")).toBe(lostTip);
    await engine.reset("hard", "HEAD@{1}");
    const s = await engine.snapshot();
    expect(s.head.oid).toBe(lostTip);
    expect(s.headFiles).toContain("c.txt");
  });

  it("reflog oids are deterministic across identical setups", async () => {
    const steps: SetupStep[] = [...THREE_COMMITS, { do: "reset", mode: "hard", target: "HEAD~2" }];
    const a = await seeded(steps);
    const b = await seeded(steps);
    expect(a.reflog.map((e) => e.oid)).toEqual(b.reflog.map((e) => e.oid));
  });
});

describe("cherry-pick", () => {
  const PICKABLE: SetupStep[] = [
    { do: "file", path: "footer.html", content: "<footer>v1</footer>\n" },
    { do: "init" },
    { do: "add", paths: "*" },
    { do: "commit", message: "base" },
    { do: "branch", name: "feature/experiment" },
    { do: "switch", ref: "feature/experiment" },
    { do: "file", path: "exp.css", content: "disco\n" },
    { do: "add", paths: "*" },
    { do: "commit", message: "Experiment" },
    { do: "file", path: "footer.html", content: "<footer>v2 fixed</footer>\n" },
    { do: "add", paths: "*" },
    { do: "commit", message: "Fix footer" },
    { do: "switch", ref: "main" },
  ];

  it("applies a single commit from another branch", async () => {
    const engine = await seeded(PICKABLE);
    const oid = await engine.cherryPick("feature/experiment");
    const s = await engine.snapshot();
    expect(s.head.oid).toBe(oid);
    expect(s.commits[0].message).toContain("Fix footer");
    expect(await engine.readFile("footer.html")).toBe("<footer>v2 fixed</footer>\n");
    // the experiment did NOT come along
    expect(s.headFiles).not.toContain("exp.css");
    expect(s.status.every((f) => !f.staged && !f.unstaged && !f.untracked)).toBe(true);
  });

  it("refuses when HEAD diverges from the commit's base", async () => {
    const engine = await seeded([
      ...PICKABLE,
      { do: "file", path: "footer.html", content: "<footer>changed on main</footer>\n" },
      { do: "add", paths: "*" },
      { do: "commit", message: "main edit" },
    ]);
    await expect(engine.cherryPick("feature/experiment")).rejects.toThrow(/could not apply/);
  });
});

describe("rebase", () => {
  const DIVERGED: SetupStep[] = [
    { do: "file", path: "index.html", content: "<h1>Cafe</h1>\n" },
    { do: "init" },
    { do: "add", paths: "*" },
    { do: "commit", message: "base" },
    { do: "publish" },
    { do: "file", path: "events.html", content: "events\n" },
    { do: "add", paths: ["events.html"] },
    { do: "commit", message: "local events" },
    {
      do: "onRemote",
      steps: [
        { do: "file", path: "hours.html", content: "hours\n" },
        { do: "add", paths: ["hours.html"] },
        { do: "commit", message: "remote hours" },
      ],
    },
  ];

  it("replays unpublished local commits on top of a fetched upstream", async () => {
    const engine = await seeded(DIVERGED);
    const oldLocal = await engine.resolve("HEAD");
    await engine.fetch();
    const upstream = await engine.resolve("origin/main");

    const outcome = await engine.rebase("origin/main");
    expect(outcome.kind).toBe("rebased");
    const head = await engine.resolve("HEAD");
    expect(head).not.toBe(oldLocal);
    expect((await git.readCommit({ fs: engine.fsp.fs, dir: engine.dir, oid: head })).commit.parent).toEqual([
      upstream,
    ]);
    expect(await engine.readFile("events.html")).toBe("events\n");
    expect(await engine.readFile("hours.html")).toBe("hours\n");
    expect(engine.reflog[0].action).toBe("rebase (finish): main onto origin/main");
  });

  it("restores the original branch and files when a replay would conflict", async () => {
    const engine = await seeded([
      { do: "file", path: "menu.html", content: "price: 1\n" },
      { do: "init" },
      { do: "add", paths: "*" },
      { do: "commit", message: "base" },
      { do: "publish" },
      { do: "file", path: "menu.html", content: "price: 2\n" },
      { do: "add", paths: ["menu.html"] },
      { do: "commit", message: "local price" },
      {
        do: "onRemote",
        steps: [
          { do: "file", path: "menu.html", content: "price: 3\n" },
          { do: "add", paths: ["menu.html"] },
          { do: "commit", message: "remote price" },
        ],
      },
    ]);
    await engine.fetch();
    const original = await engine.resolve("HEAD");
    const reflog = [...engine.reflog];

    await expect(engine.rebase("origin/main")).rejects.toThrow(/rebase failed/);
    expect(await engine.resolve("HEAD")).toBe(original);
    expect(await engine.readFile("menu.html")).toBe("price: 2\n");
    expect(engine.reflog).toEqual(reflog);
  });
});

describe("detached HEAD", () => {
  it("detach → look around → switch back", async () => {
    const engine = await seeded([...THREE_COMMITS, { do: "detach", back: 2 }]);
    const s = await engine.snapshot();
    expect(s.head.ref).toBeNull();
    expect(s.head.oid).not.toBeNull();
    // workdir matches the old commit
    expect(await engine.exists("/repo/c.txt")).toBe(false);
    expect(await engine.readFile("a.txt")).toBe("a\n");
    // commits still visible via branch tip in the graph data
    expect(s.commits).toHaveLength(3);

    await engine.switchTo("main");
    const s2 = await engine.snapshot();
    expect(s2.head.ref).toBe("main");
    expect(await engine.exists("/repo/c.txt")).toBe(true);
  });

  it("switch -c from detached keeps the position on a new branch", async () => {
    const engine = await seeded([...THREE_COMMITS, { do: "detach", back: 1 }]);
    const at = (await engine.snapshot()).head.oid;
    await engine.switchTo("rescue", { create: true });
    const s = await engine.snapshot();
    expect(s.head.ref).toBe("rescue");
    expect(s.head.oid).toBe(at);
  });

  it("commit while detached is refused with guidance", async () => {
    const engine = await seeded([...THREE_COMMITS, { do: "detach", back: 1 }]);
    await engine.writeFile("x.txt", "x\n");
    await engine.add("x.txt");
    await expect(engine.commit({ message: "nope" })).rejects.toThrow(GitOpError);
    await expect(engine.commit({ message: "nope" })).rejects.toThrow(/detached HEAD/);
  });
});

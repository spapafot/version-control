import { describe, it, expect } from "vitest";
import { createMemFs } from "@/git/fs";
import { GitEngine } from "@/git/engine";
import { runSetup, type SetupStep } from "@/git/setup";
import { Shell } from "./shell";
import { tokenize } from "./tokenizer";

async function shellWith(steps: SetupStep[] = []): Promise<Shell> {
  const engine = new GitEngine(createMemFs());
  await runSetup(engine, steps);
  return new Shell(engine);
}

async function run(shell: Shell, line: string) {
  let out = "";
  let err = "";
  const code = await shell.execute(line, {
    stdout: (t) => (out += t + "\n"),
    stderr: (t) => (err += t + "\n"),
  });
  return { out, err, code };
}

const BASIC: SetupStep[] = [
  { do: "file", path: "README.md", content: "# hello\n" },
  { do: "init" },
  { do: "add", paths: ["README.md"] },
  { do: "commit", message: "Initial commit" },
];

describe("tokenizer", () => {
  it("splits words and strips quotes", () => {
    expect(tokenize(`git commit -m "First commit"`).argv).toEqual([
      "git",
      "commit",
      "-m",
      "First commit",
    ]);
    expect(tokenize(`echo 'a  b'`).argv).toEqual(["echo", "a  b"]);
  });

  it("parses redirection", () => {
    expect(tokenize("echo hi > f.txt")).toEqual({
      argv: ["echo", "hi"],
      redirect: { op: ">", target: "f.txt" },
    });
    expect(tokenize("echo hi>>f.txt").redirect).toEqual({ op: ">>", target: "f.txt" });
  });

  it("rejects unsupported shell syntax", () => {
    expect(() => tokenize("ls | grep x")).toThrow(/unexpected token/);
    expect(() => tokenize('echo "unclosed')).toThrow(/unclosed quote/);
  });
});

describe("git basics through the shell", () => {
  it("git init", async () => {
    const shell = await shellWith();
    const r = await run(shell, "git init");
    expect(r.out).toContain("Initialized empty Git repository");
    expect(r.code).toBe(0);
  });

  it("commands before init fail like git", async () => {
    const shell = await shellWith();
    const r = await run(shell, "git status");
    expect(r.err).toContain("not a git repository");
    expect(r.code).toBe(128);
  });

  it("full first-commit flow with real git output", async () => {
    const shell = await shellWith();
    await run(shell, "git init");
    await run(shell, "echo '# My project' > README.md");

    let r = await run(shell, "git status");
    expect(r.out).toContain("No commits yet");
    expect(r.out).toContain("Untracked files:");
    expect(r.out).toContain("README.md");

    r = await run(shell, "git add README.md");
    expect(r.code).toBe(0);

    r = await run(shell, "git status");
    expect(r.out).toContain("Changes to be committed:");
    expect(r.out).toContain("new file:   README.md");

    r = await run(shell, 'git commit -m "My first commit"');
    expect(r.out).toMatch(/\[main \(root-commit\) [0-9a-f]{7}\] My first commit/);
    expect(r.out).toContain("1 file changed, 1 insertion(+)");

    r = await run(shell, "git status");
    expect(r.out).toContain("nothing to commit, working tree clean");
  });

  it("git log --oneline shows decorations", async () => {
    const shell = await shellWith(BASIC);
    const r = await run(shell, "git log --oneline");
    expect(r.out).toMatch(/^[0-9a-f]{7} \(HEAD -> main\) Initial commit\n$/);
  });

  it("git log full format", async () => {
    const shell = await shellWith(BASIC);
    const r = await run(shell, "git log");
    expect(r.out).toContain("commit ");
    expect(r.out).toContain("Author: Alex <alex@versioncontrol.gr>");
    expect(r.out).toContain("Date:   ");
    expect(r.out).toContain("    Initial commit");
  });

  it("commit without staged changes prints status and fails", async () => {
    const shell = await shellWith(BASIC);
    const r = await run(shell, 'git commit -m "nothing"');
    expect(r.out).toContain("nothing to commit, working tree clean");
    expect(r.code).toBe(1);
  });

  it("commit -am stages tracked changes only", async () => {
    const shell = await shellWith(BASIC);
    await run(shell, "echo changed > README.md");
    await run(shell, "echo new > new.txt");
    const r = await run(shell, 'git commit -am "update readme"');
    expect(r.out).toContain("1 file changed");
    const st = await run(shell, "git status");
    expect(st.out).toContain("Untracked files:");
    expect(st.out).toContain("new.txt");
  });
});

describe("branching through the shell", () => {
  const TWO_BRANCH: SetupStep[] = [
    ...BASIC,
    { do: "branch", name: "feature" },
    { do: "switch", ref: "feature" },
    { do: "file", path: "feature.txt", content: "f\n" },
    { do: "add", paths: ["feature.txt"] },
    { do: "commit", message: "Add feature" },
    { do: "switch", ref: "main" },
  ];

  it("branch list marks current", async () => {
    const shell = await shellWith(TWO_BRANCH);
    const r = await run(shell, "git branch");
    expect(r.out).toBe("  feature\n* main\n");
  });

  it("switch and checkout", async () => {
    const shell = await shellWith(TWO_BRANCH);
    let r = await run(shell, "git switch feature");
    expect(r.out).toBe("Switched to branch 'feature'\n");
    r = await run(shell, "git checkout main");
    expect(r.out).toBe("Switched to branch 'main'\n");
    r = await run(shell, "git switch -c hotfix");
    expect(r.out).toBe("Switched to a new branch 'hotfix'\n");
    r = await run(shell, "git branch");
    expect(r.out).toContain("* hotfix");
  });

  it("switch to unknown branch errors", async () => {
    const shell = await shellWith(TWO_BRANCH);
    const r = await run(shell, "git switch ghost");
    expect(r.err).toContain("fatal: invalid reference: ghost");
    expect(r.code).toBe(128);
  });

  it("fast-forward merge output", async () => {
    const shell = await shellWith(TWO_BRANCH);
    const r = await run(shell, "git merge feature");
    expect(r.out).toMatch(/Updating [0-9a-f]{7}\.\.[0-9a-f]{7}\nFast-forward/);
  });

  it("branch -d refuses unmerged, allows merged", async () => {
    const shell = await shellWith(TWO_BRANCH);
    let r = await run(shell, "git branch -d feature");
    expect(r.err).toContain("not fully merged");
    await run(shell, "git merge feature");
    r = await run(shell, "git branch -d feature");
    expect(r.out).toMatch(/Deleted branch feature \(was [0-9a-f]{7}\)\./);
  });
});

describe("merge conflict through the shell", () => {
  const CONFLICT: SetupStep[] = [
    { do: "file", path: "app.js", content: "console.log('v1');\n" },
    { do: "init" },
    { do: "add", paths: "*" },
    { do: "commit", message: "base" },
    { do: "branch", name: "feature" },
    { do: "file", path: "app.js", content: "console.log('main');\n" },
    { do: "add", paths: "*" },
    { do: "commit", message: "main edit" },
    { do: "switch", ref: "feature" },
    { do: "file", path: "app.js", content: "console.log('feature');\n" },
    { do: "add", paths: "*" },
    { do: "commit", message: "feature edit" },
    { do: "switch", ref: "main" },
  ];

  it("conflict → status → resolve → commit", async () => {
    const shell = await shellWith(CONFLICT);

    let r = await run(shell, "git merge feature");
    expect(r.out).toContain("CONFLICT (content): Merge conflict in app.js");
    expect(r.out).toContain("Automatic merge failed");
    expect(r.code).toBe(1);

    r = await run(shell, "git status");
    expect(r.out).toContain("You have unmerged paths.");
    expect(r.out).toContain("both modified:   app.js");

    r = await run(shell, "cat app.js");
    expect(r.out).toContain("<<<<<<<");

    r = await run(shell, "echo \"console.log('merged');\" > app.js");
    await run(shell, "git add app.js");

    r = await run(shell, "git status");
    expect(r.out).toContain("All conflicts fixed but you are still merging.");

    r = await run(shell, "git commit");
    expect(r.out).toContain("Merge branch 'feature'");

    r = await run(shell, "git log --oneline");
    expect(r.out).toContain("Merge branch 'feature'");
  });

  it("merge --abort through shell", async () => {
    const shell = await shellWith(CONFLICT);
    await run(shell, "git merge feature");
    const r = await run(shell, "git merge --abort");
    expect(r.code).toBe(0);
    const st = await run(shell, "git status");
    expect(st.out).toContain("nothing to commit, working tree clean");
  });
});

describe("undo commands through the shell", () => {
  it("restore --staged then restore", async () => {
    const shell = await shellWith(BASIC);
    await run(shell, "echo changed > README.md");
    await run(shell, "git add README.md");
    let r = await run(shell, "git restore --staged README.md");
    expect(r.code).toBe(0);
    r = await run(shell, "git status");
    expect(r.out).toContain("Changes not staged for commit:");
    await run(shell, "git restore README.md");
    r = await run(shell, "git status");
    expect(r.out).toContain("nothing to commit, working tree clean");
  });

  it("reset --hard prints new HEAD", async () => {
    const shell = await shellWith([
      ...BASIC,
      { do: "file", path: "second.txt", content: "2\n" },
      { do: "add", paths: "*" },
      { do: "commit", message: "Second commit" },
    ]);
    const r = await run(shell, "git reset --hard HEAD~1");
    expect(r.out).toMatch(/HEAD is now at [0-9a-f]{7} Initial commit/);
  });

  it("revert prints commit summary", async () => {
    const shell = await shellWith([
      ...BASIC,
      { do: "file", path: "bug.js", content: "broken\n" },
      { do: "add", paths: "*" },
      { do: "commit", message: "Break prod" },
    ]);
    const r = await run(shell, "git revert HEAD");
    expect(r.out).toMatch(/\[main [0-9a-f]{7}\] Revert "Break prod"/);
  });

  it("git diff shows unstaged changes", async () => {
    const shell = await shellWith(BASIC);
    await run(shell, "echo changed > README.md");
    const r = await run(shell, "git diff");
    expect(r.out).toContain("diff --git a/README.md b/README.md");
    expect(r.out).toContain("-# hello");
    expect(r.out).toContain("+changed");
  });
});

describe("git stash through the shell", () => {
  it("push, list, pop", async () => {
    const shell = await shellWith(BASIC);
    await run(shell, "echo changed > README.md");

    let r = await run(shell, "git stash");
    expect(r.out).toMatch(
      /^Saved working directory and index state WIP on main: [0-9a-f]{7} Initial commit\n$/,
    );
    expect(r.code).toBe(0);

    r = await run(shell, "git status");
    expect(r.out).toContain("nothing to commit, working tree clean");

    r = await run(shell, "git stash list");
    expect(r.out).toMatch(/^stash@\{0\}: WIP on main: [0-9a-f]{7} Initial commit\n$/);

    r = await run(shell, "git stash pop");
    expect(r.out).toContain("Changes not staged for commit:");
    expect(r.out).toMatch(/Dropped refs\/stash@\{0\} \([0-9a-f]{40}\)/);
    r = await run(shell, "git stash list");
    expect(r.out).toBe("");
  });

  it("push -m labels the entry, and -u takes untracked files", async () => {
    const shell = await shellWith(BASIC);
    await run(shell, "echo changed > README.md");
    await run(shell, "echo new > extra.txt");

    let r = await run(shell, 'git stash push -m "work in progress"');
    expect(r.out).toBe("Saved working directory and index state On main: work in progress\n");
    r = await run(shell, "ls");
    expect(r.out).toContain("extra.txt"); // untracked files stay behind

    r = await run(shell, "git stash -u");
    expect(r.out).toContain("Saved working directory and index state WIP on main:");
    r = await run(shell, "ls");
    expect(r.out).not.toContain("extra.txt");

    r = await run(shell, "git stash list");
    expect(r.out).toMatch(/^stash@\{0\}: WIP on main: .*\nstash@\{1\}: On main: work in progress\n$/);
  });

  it("apply keeps the entry, drop removes it, clear empties the stack", async () => {
    const shell = await shellWith(BASIC);
    await run(shell, "echo changed > README.md");
    await run(shell, "git stash");

    let r = await run(shell, "git stash apply");
    expect(r.out).toContain("Changes not staged for commit:");
    expect(r.out).not.toContain("Dropped");
    r = await run(shell, "git stash list");
    expect(r.out).toContain("stash@{0}:");

    await run(shell, "git restore README.md");
    r = await run(shell, "git stash drop stash@{0}");
    expect(r.out).toMatch(/^Dropped stash@\{0\} \([0-9a-f]{40}\)\n$/);

    await run(shell, "echo changed > README.md");
    await run(shell, "git stash");
    await run(shell, "git stash clear");
    r = await run(shell, "git stash list");
    expect(r.out).toBe("");
  });

  it("pops a specific entry by stash@{n}", async () => {
    const shell = await shellWith(BASIC);
    await run(shell, "echo first > README.md");
    await run(shell, 'git stash push -m "first try"');
    await run(shell, "echo second > README.md");
    await run(shell, 'git stash push -m "second try"');

    const r = await run(shell, "git stash pop stash@{1}");
    expect(r.out).toMatch(/Dropped stash@\{1\} \([0-9a-f]{40}\)/);
    expect(await run(shell, "cat README.md")).toMatchObject({ out: "first\n" });
    expect((await run(shell, "git stash list")).out).toBe(
      "stash@{0}: On main: second try\n",
    );
  });

  it("reports an empty stash and an unknown subcommand", async () => {
    const shell = await shellWith(BASIC);
    let r = await run(shell, "git stash");
    expect(r.out).toBe("No local changes to save\n");
    expect(r.code).toBe(0);

    r = await run(shell, "git stash pop");
    expect(r.err).toBe("No stash entries found.\n");
    expect(r.code).toBe(1);

    await run(shell, "echo changed > README.md");
    await run(shell, "git stash");
    r = await run(shell, "git stash pop stash@{7}");
    expect(r.err).toContain("error: refs/stash@{7} is not a valid reference");

    r = await run(shell, "git stash show");
    expect(r.err).toContain("error: unknown subcommand: `show'");
    expect(r.code).toBe(129);
  });

  it("git switch refuses a dirty tree and points at stash", async () => {
    // the premise of the stash-and-switch challenge
    const shell = await shellWith([
      ...BASIC,
      { do: "branch", name: "feature/x" },
      { do: "switch", ref: "feature/x" },
      { do: "file", path: "README.md", content: "# branch version\n" },
      { do: "add", paths: "*" },
      { do: "commit", message: "Branch edit" },
    ]);
    await run(shell, "echo work in progress > README.md");

    let r = await run(shell, "git switch main");
    expect(r.err).toContain("Please commit your changes or stash them before you switch branches");
    expect(r.code).toBe(1);

    await run(shell, "git stash");
    r = await run(shell, "git switch main");
    expect(r.code).toBe(0);
  });
});

describe("plain shell commands", () => {
  it("ls, cat, touch, rm, echo redirection", async () => {
    const shell = await shellWith(BASIC);
    let r = await run(shell, "ls");
    expect(r.out).toBe("README.md\n");

    await run(shell, "touch notes.txt");
    r = await run(shell, "ls");
    expect(r.out).toBe("README.md  notes.txt\n");

    await run(shell, "echo héllo wörld > unicode.txt");
    r = await run(shell, "cat unicode.txt");
    expect(r.out).toBe("héllo wörld\n");

    await run(shell, "echo again >> unicode.txt");
    r = await run(shell, "cat unicode.txt");
    expect(r.out).toBe("héllo wörld\nagain\n");

    await run(shell, "rm notes.txt");
    r = await run(shell, "ls");
    expect(r.out).toBe("README.md  unicode.txt\n");
  });

  it("unknown commands", async () => {
    const shell = await shellWith();
    let r = await run(shell, "npm install");
    expect(r.err).toContain("npm: command not found");
    expect(r.code).toBe(127);
    r = await run(shell, "git push");
    expect(r.err).toContain("'push' is not a git command");
  });
});

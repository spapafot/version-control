import { describe, it, expect } from "vitest";
import { createMemFs } from "@/git/fs";
import { GitEngine } from "@/git/engine";
import { runSetup, type SetupStep } from "@/git/setup";
import { Shell } from "./shell";
import { tokenize } from "./tokenizer";
import { renderPrompt } from "./format/prompt";
import { LineEditor } from "./readline";

async function shellWith(steps: SetupStep[] = []): Promise<Shell> {
  const engine = new GitEngine(createMemFs());
  await runSetup(engine, steps);
  return new Shell(engine);
}

/* eslint-disable no-control-regex */
const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * `out`/`err` come back decoloured so the wording assertions stay about the
 * wording; `raw` keeps the escape codes for the colour tests at the bottom.
 */
async function run(shell: Shell, line: string) {
  let raw = "";
  let err = "";
  const code = await shell.execute(line, {
    stdout: (t) => (raw += t + "\n"),
    stderr: (t) => (err += t + "\n"),
  });
  return { out: raw.replace(ANSI, ""), err: err.replace(ANSI, ""), raw, code };
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
    r = await run(shell, "git rebase");
    expect(r.err).toContain("'rebase' is not a git command");
  });
});

describe("folders in the shell", () => {
  it("mkdir creates a folder ls can see", async () => {
    const shell = await shellWith(BASIC);
    let r = await run(shell, "mkdir docs");
    expect(r.code).toBe(0);
    r = await run(shell, "ls");
    expect(r.out).toBe("README.md  docs/\n");

    r = await run(shell, "mkdir docs");
    expect(r.err).toBe("mkdir: cannot create directory 'docs': File exists\n");
    expect(r.code).toBe(1);

    r = await run(shell, "mkdir a/b");
    expect(r.err).toBe("mkdir: cannot create directory 'a/b': No such file or directory\n");
    expect(r.code).toBe(1);

    r = await run(shell, "mkdir -p a/b");
    expect(r.code).toBe(0);
    r = await run(shell, "ls a");
    expect(r.out).toBe("b/\n");
  });

  it("ls takes a path", async () => {
    const shell = await shellWith([
      { do: "file", path: "docs/notes.txt", content: "x\n" },
      { do: "file", path: "docs/plan.txt", content: "y\n" },
    ]);
    let r = await run(shell, "ls docs");
    expect(r.out).toBe("notes.txt  plan.txt\n");
    r = await run(shell, "ls docs/");
    expect(r.out).toBe("notes.txt  plan.txt\n");
    r = await run(shell, "ls docs/notes.txt");
    expect(r.out).toBe("docs/notes.txt\n");
    r = await run(shell, "ls nope");
    expect(r.err).toBe("ls: cannot access 'nope': No such file or directory\n");
    expect(r.code).toBe(2);
  });

  it("rm refuses folders without -r", async () => {
    const shell = await shellWith([{ do: "file", path: "tmp/a.txt", content: "a\n" }]);
    let r = await run(shell, "rm tmp");
    expect(r.err).toBe("rm: cannot remove 'tmp': Is a directory\n");
    expect(r.code).toBe(1);
    r = await run(shell, "rm -r tmp");
    expect(r.code).toBe(0);
    r = await run(shell, "ls");
    expect(r.out).toBe("");
  });

  it("mv renames and moves into folders", async () => {
    const shell = await shellWith([
      { do: "file", path: "notes.txt", content: "n\n" },
      { do: "file", path: "docs/keep.txt", content: "k\n" },
    ]);
    let r = await run(shell, "mv notes.txt docs/");
    expect(r.code).toBe(0);
    r = await run(shell, "cat docs/notes.txt");
    expect(r.out).toBe("n\n");
    r = await run(shell, "ls");
    expect(r.out).toBe("docs/\n");

    r = await run(shell, "mv docs/keep.txt renamed.txt");
    expect(r.code).toBe(0);
    r = await run(shell, "ls");
    expect(r.out).toBe("docs/  renamed.txt\n");

    r = await run(shell, "mv ghost.txt docs/");
    expect(r.err).toBe("mv: cannot stat 'ghost.txt': No such file or directory\n");
    expect(r.code).toBe(1);

    r = await run(shell, "mv renamed.txt renamed.txt");
    expect(r.err).toBe("mv: 'renamed.txt' and 'renamed.txt' are the same file\n");
    expect(r.code).toBe(1);
  });

  it("mv renames whole folders", async () => {
    const shell = await shellWith([{ do: "file", path: "docs/deep/plan.txt", content: "p\n" }]);
    let r = await run(shell, "mv docs archive");
    expect(r.code).toBe(0);
    r = await run(shell, "cat archive/deep/plan.txt");
    expect(r.out).toBe("p\n");
    r = await run(shell, "ls");
    expect(r.out).toBe("archive/\n");

    r = await run(shell, "mv archive archive/");
    expect(r.err).toBe("mv: cannot move 'archive' to a subdirectory of itself, 'archive/archive'\n");
    expect(r.code).toBe(1);
  });

  it("cp copies files and refuses folders", async () => {
    const shell = await shellWith([
      { do: "file", path: "index.html", content: "<h1>hi</h1>\n" },
      { do: "file", path: "docs/keep.txt", content: "k\n" },
    ]);
    let r = await run(shell, "cp index.html index.html.bak");
    expect(r.code).toBe(0);
    r = await run(shell, "cat index.html.bak");
    expect(r.out).toBe("<h1>hi</h1>\n");
    r = await run(shell, "ls");
    expect(r.out).toBe("docs/  index.html  index.html.bak\n");

    r = await run(shell, "cp docs backup");
    expect(r.err).toBe("cp: -r not specified; omitting directory 'docs'\n");
    expect(r.code).toBe(1);

    r = await run(shell, "cp index.html index.html");
    expect(r.err).toBe("cp: 'index.html' and 'index.html' are the same file\n");
    expect(r.code).toBe(1);
  });

  it("cat names the mistake when given a folder", async () => {
    const shell = await shellWith([{ do: "file", path: "docs/keep.txt", content: "k\n" }]);
    const r = await run(shell, "cat docs");
    expect(r.err).toBe("cat: docs: Is a directory\n");
    expect(r.code).toBe(1);
  });

  it("folders reach the snapshot for validators and the file panel", async () => {
    const shell = await shellWith();
    await run(shell, "mkdir docs");
    let state = await shell.engine.snapshot();
    expect(state.dirs).toEqual(["docs"]);
    await run(shell, "rm -r docs");
    state = await shell.engine.snapshot();
    expect(state.dirs).toEqual([]);
  });
});

describe("remotes through the shell", () => {
  const PUBLISHED: SetupStep[] = [...BASIC, { do: "publish" }];
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

  it("git remote -v lists origin; silent without a remote", async () => {
    const shell = await shellWith(PUBLISHED);
    let r = await run(shell, "git remote -v");
    expect(r.out).toBe("origin\t/origin (fetch)\norigin\t/origin (push)\n");
    r = await run(shell, "git remote");
    expect(r.out).toBe("origin\n");

    const bare = await shellWith(BASIC); // no publish → playground-like
    r = await run(bare, "git remote -v");
    expect(r.out).toBe("");
    expect(r.code).toBe(0);
  });

  it("fetch prints update lines, then goes silent", async () => {
    const shell = await shellWith(BEHIND);
    let r = await run(shell, "git fetch");
    expect(r.out).toContain("From /origin");
    expect(r.out).toMatch(/ {3}[0-9a-f]{7}\.\.[0-9a-f]{7} {2}main {1}-> origin\/main/);
    expect(r.code).toBe(0);
    r = await run(shell, "git fetch");
    expect(r.out).toBe("");
    expect(r.code).toBe(0);
  });

  it("status shows the tracking line in all its moods", async () => {
    const shell = await shellWith(PUBLISHED);
    let r = await run(shell, "git status");
    expect(r.out).toContain("Your branch is up to date with 'origin/main'.");
    expect(r.out).toContain("nothing to commit, working tree clean");

    // ahead
    await run(shell, "echo x > events.html");
    await run(shell, "git add events.html");
    await run(shell, 'git commit -m "Events"');
    r = await run(shell, "git status");
    expect(r.out).toContain("Your branch is ahead of 'origin/main' by 1 commit.");

    // behind (fresh repo, Maria pushed, we fetched)
    const behind = await shellWith(BEHIND);
    await run(behind, "git fetch");
    r = await run(behind, "git status");
    expect(r.out).toContain(
      "Your branch is behind 'origin/main' by 1 commit, and can be fast-forwarded.",
    );
  });

  it("push: up-to-date, ok, and the rejected block", async () => {
    const shell = await shellWith(PUBLISHED);
    let r = await run(shell, "git push");
    expect(r.out).toBe("Everything up-to-date\n");

    await run(shell, "echo x > events.html");
    await run(shell, "git add events.html");
    await run(shell, 'git commit -m "Events"');
    r = await run(shell, "git push");
    expect(r.out).toContain("To /origin");
    expect(r.out).toMatch(/ {3}[0-9a-f]{7}\.\.[0-9a-f]{7} {2}main -> main/);

    // diverge: Maria pushed meanwhile → rejected
    const diverged = await shellWith([
      ...BEHIND,
      { do: "file", path: "gallery.html", content: "<h2>Gallery</h2>\n" },
      { do: "add", paths: ["gallery.html"] },
      { do: "commit", message: "Photo gallery" },
    ]);
    r = await run(diverged, "git push");
    expect(r.err).toContain("! [rejected]        main -> main (fetch first)");
    expect(r.err).toContain("error: failed to push some refs to '/origin'");
    expect(r.err).toContain("hint: Updates were rejected because the remote contains work");
    expect(r.code).toBe(1);

    // the taught recovery: pull (merge), push again
    r = await run(diverged, "git pull");
    expect(r.out).toContain("Merge made by the 'ort' strategy.");
    r = await run(diverged, "git push");
    expect(r.out).toContain("main -> main");
    expect(r.code).toBe(0);
  });

  it("pull fast-forwards when local hasn't moved", async () => {
    const shell = await shellWith(BEHIND);
    const r = await run(shell, "git pull");
    expect(r.out).toContain("From /origin");
    expect(r.out).toContain("Fast-forward");
    expect(r.code).toBe(0);
    const r2 = await run(shell, "git pull");
    expect(r2.out).toBe("Already up to date.\n");
  });

  it("no remote configured: real fatals, no crash", async () => {
    const shell = await shellWith(BASIC); // playground-like
    let r = await run(shell, "git fetch");
    expect(r.err).toContain("fatal: No remote repository specified.");
    expect(r.code).toBe(128);
    r = await run(shell, "git push");
    expect(r.err).toContain("fatal: No configured push destination.");
    expect(r.code).toBe(128);
    r = await run(shell, "git pull");
    expect(r.err).toContain("fatal: No remote repository specified.");
    expect(r.code).toBe(128);
  });

  it("push to a branch with no upstream explains --set-upstream", async () => {
    const shell = await shellWith([...PUBLISHED, { do: "branch", name: "feature/x" }, { do: "switch", ref: "feature/x" }]);
    let r = await run(shell, "git push");
    expect(r.err).toContain("fatal: The current branch feature/x has no upstream branch.");
    expect(r.err).toContain("git push --set-upstream origin feature/x");
    expect(r.code).toBe(128);

    r = await run(shell, "git push -u origin feature/x");
    expect(r.out).toContain(" * [new branch]      feature/x -> feature/x");
    expect(r.out).toContain("branch 'feature/x' set up to track 'origin/feature/x'.");
    expect(r.code).toBe(0);
  });
});

describe("colour, following git's own defaults", () => {
  const GREEN = "\x1b[32m";
  const RED = "\x1b[31m";
  const CYAN = "\x1b[36m";
  const YELLOW = "\x1b[33m";
  const BOLD = "\x1b[1m";

  it("git status: staged green, unstaged and untracked red", async () => {
    const shell = await shellWith(BASIC);
    await run(shell, "echo changed > README.md");
    await run(shell, "echo fresh > notes.txt");
    await run(shell, "git add notes.txt");

    const r = await run(shell, "git status");
    expect(r.raw).toContain(`\t${GREEN}new file:   notes.txt\x1b[0m`);
    expect(r.raw).toContain(`\t${RED}modified:   README.md\x1b[0m`);
    // headers and hints stay uncoloured, as in git
    expect(r.raw).toContain("\nChanges to be committed:\n");
  });

  it("git status: untracked files are red", async () => {
    const shell = await shellWith(BASIC);
    await run(shell, "echo fresh > notes.txt");
    const r = await run(shell, "git status");
    expect(r.raw).toContain(`\t${RED}notes.txt\x1b[0m`);
  });

  it("no colour once stdout is redirected into a file", async () => {
    const shell = await shellWith(BASIC);
    await run(shell, "echo fresh > notes.txt");
    await run(shell, "git status > report.txt");
    const r = await run(shell, "cat report.txt");
    expect(r.raw).not.toMatch(ANSI);
    expect(r.raw).toContain("\tnotes.txt");
  });

  it("git diff: meta bold, hunk header cyan, + green and - red", async () => {
    const shell = await shellWith(BASIC);
    await run(shell, "echo changed > README.md");
    const r = await run(shell, "git diff");
    expect(r.raw).toContain(`${BOLD}diff --git a/README.md b/README.md\x1b[0m`);
    expect(r.raw).toContain(`${CYAN}@@ -1,1 +1,1 @@\x1b[0m`);
    expect(r.raw).toContain(`${GREEN}+changed\x1b[0m`);
    expect(r.raw).toContain(`${RED}-# hello\x1b[0m`);
  });

  it("git log: yellow commit line, HEAD cyan, branch green", async () => {
    const shell = await shellWith(BASIC);
    const r = await run(shell, "git log --oneline");
    expect(r.raw).toMatch(/^\x1b\[33m[0-9a-f]{7}\x1b\[0m/);
    expect(r.raw).toContain(`${CYAN}HEAD\x1b[0m${YELLOW} -> \x1b[0m${GREEN}main\x1b[0m`);
    expect(r.out).toMatch(/^[0-9a-f]{7} \(HEAD -> main\) Initial commit\n$/);
  });

  it("git log: remote-tracking branches are red", async () => {
    const shell = await shellWith([...BASIC, { do: "publish" }]);
    const r = await run(shell, "git log --oneline");
    expect(r.raw).toContain(`${RED}origin/main\x1b[0m`);
    // a local branch with a slash is still a local branch
    await run(shell, "git switch -c feature/menu");
    const r2 = await run(shell, "git log --oneline");
    expect(r2.raw).toContain(`${GREEN}feature/menu\x1b[0m`);
  });

  it("git branch: the checked-out branch is green, the marker is not", async () => {
    const shell = await shellWith(BASIC);
    const r = await run(shell, "git branch");
    expect(r.raw).toBe(`* ${GREEN}main\x1b[0m\n`);
  });
});

describe("the prompt", () => {
  const CYAN = "\x1b[36m";
  const GREEN = "\x1b[32m";

  it("carries the current branch, in cyan", async () => {
    const shell = await shellWith(BASIC);
    expect(renderPrompt(await shell.engine.snapshot())).toBe(
      `${CYAN}(main)\x1b[0m ${GREEN}$\x1b[0m `,
    );
  });

  it("follows git switch", async () => {
    const shell = await shellWith(BASIC);
    await run(shell, "git switch -c feature/footer");
    expect(renderPrompt(await shell.engine.snapshot())).toContain("(feature/footer)");
  });

  it("shows a detached HEAD the way Git Bash does", async () => {
    const shell = await shellWith(BASIC);
    const oid = (await shell.engine.snapshot()).head.oid!;
    await run(shell, `git checkout ${oid.slice(0, 7)}`);
    expect(renderPrompt(await shell.engine.snapshot())).toContain(`((${oid.slice(0, 7)}...))`);
  });

  it("drops the branch segment before git init, where it would be a lie", async () => {
    const shell = await shellWith();
    expect(renderPrompt(await shell.engine.snapshot())).toBe(`${GREEN}$\x1b[0m `);
    expect(renderPrompt(null)).toBe(`${GREEN}$\x1b[0m `);
  });
});

describe("LineEditor", () => {
  /** dumb sink standing in for xterm */
  function editorWith(prompt: string | (() => string)) {
    let written = "";
    const editor = new LineEditor({
      term: { write: (d) => (written += d) },
      prompt,
      onLine: () => {},
    });
    return { editor, read: () => written, clear: () => (written = "") };
  }

  it("re-reads a function prompt on every draw", async () => {
    let branch = "main";
    const { editor, read, clear } = editorWith(() => `(${branch}) $ `);
    editor.start();
    expect(read()).toBe("(main) $ ");

    branch = "feature/footer";
    clear();
    editor.handleData("ls\r");
    await Promise.resolve();
    // the prompt drawn after the command reflects the new branch
    expect(read()).toContain("(feature/footer) $ ");
  });

  it("still accepts a plain string prompt", () => {
    const { editor, read } = editorWith("$ ");
    editor.start();
    expect(read()).toBe("$ ");
  });
});

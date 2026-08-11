/**
 * The Git command reference behind /cheatsheet/.
 *
 * Every command and flag here is one the in-browser engine actually implements
 * (see `gitCommands` and each command's `spec.flags` in
 * src/terminal/commands/git/). cheatsheet.test.ts asserts the two lists match,
 * so this page cannot end up promising a command the terminal rejects.
 *
 * `mission` is the challenge slug where the command is taught, which is what
 * turns the page into an internal-linking hub rather than a dead reference.
 */
export interface CheatsheetEntry {
  command: string;
  /** the git subcommand name, matching the key in `gitCommands` */
  name: string;
  summary: string;
  examples: { code: string; note: string }[];
  mission: string;
}

export interface CheatsheetGroup {
  id: string;
  title: string;
  intro: string;
  entries: CheatsheetEntry[];
}

export const CHEATSHEET: CheatsheetGroup[] = [
  {
    id: "starting-out",
    title: "Starting out",
    intro:
      "Creating a repository, seeing what changed, and recording it. These six cover most of what you do on an ordinary day.",
    entries: [
      {
        command: "git init",
        name: "init",
        summary: "Turns the folder you are in into a Git repository.",
        examples: [{ code: "git init", note: "creates an empty repository on a branch called main" }],
        mission: "first-repository",
      },
      {
        command: "git status",
        name: "status",
        summary:
          "Shows what has changed, what is staged, and which files Git has never seen. The command to run when you are unsure of anything.",
        examples: [{ code: "git status", note: "the working tree and the staging area" }],
        mission: "check-status",
      },
      {
        command: "git add",
        name: "add",
        summary: "Moves changes into the staging area, ready for the next commit.",
        examples: [
          { code: "git add index.html", note: "one file" },
          { code: "git add .", note: "everything changed or new below the current folder" },
          { code: "git add -A", note: "everything in the repository, deletions included" },
        ],
        mission: "first-stage",
      },
      {
        command: "git commit",
        name: "commit",
        summary: "Records whatever is staged as a permanent snapshot in the history.",
        examples: [
          { code: 'git commit -m "Add the contact page"', note: "commit what is staged" },
          {
            code: 'git commit -am "Fix the phone number"',
            note: "stage tracked changes and commit in one step, though it ignores untracked files",
          },
        ],
        mission: "your-first-commit",
      },
      {
        command: "git log",
        name: "log",
        summary: "Reads the history, newest commit first.",
        examples: [
          { code: "git log", note: "full entries with author and date" },
          { code: "git log --oneline", note: "one line per commit, far easier to scan" },
        ],
        mission: "explore-the-log",
      },
      {
        command: "git diff",
        name: "diff",
        summary:
          "Shows the actual lines that changed. Worth running before every commit you care about.",
        examples: [
          { code: "git diff", note: "changes you have not staged yet" },
          { code: "git diff --staged", note: "what the next commit will contain" },
        ],
        mission: "see-the-difference",
      },
    ],
  },
  {
    id: "branching",
    title: "Branching and merging",
    intro:
      "A branch is a movable pointer at a commit, which is why creating one is instant. Merging brings two of them back together.",
    entries: [
      {
        command: "git branch",
        name: "branch",
        summary: "Lists, creates and deletes branches.",
        examples: [
          { code: "git branch", note: "list them, with a star on the current one" },
          { code: "git branch feature/menu", note: "create a branch without switching to it" },
          { code: "git branch menu/classic HEAD~2", note: "create one at an older commit" },
          { code: "git branch -d feature/menu", note: "delete a branch that is already merged" },
          { code: "git branch -D feature/menu", note: "delete it even if the work is not merged" },
        ],
        mission: "first-branch",
      },
      {
        command: "git switch",
        name: "switch",
        summary: "Moves you onto another branch. The modern, narrower alternative to checkout.",
        examples: [
          { code: "git switch main", note: "move to an existing branch" },
          { code: "git switch -c feature/footer", note: "create a branch and move onto it" },
          { code: "git switch -d HEAD~1", note: "look at an old commit in detached HEAD" },
        ],
        mission: "switch-branch",
      },
      {
        command: "git checkout",
        name: "checkout",
        summary:
          "The older command that both switches branches and restores files. You will meet it in every tutorial written before 2019.",
        examples: [
          { code: "git checkout main", note: "switch branch, the old way" },
          { code: "git checkout -b feature/experiments", note: "create a branch and switch to it" },
        ],
        mission: "the-old-way",
      },
      {
        command: "git merge",
        name: "merge",
        summary:
          "Brings another branch's work into the one you are on. Fast-forwards when it can, otherwise writes a merge commit.",
        examples: [
          { code: "git merge feature/header", note: "merge that branch into the current one" },
          { code: "git merge --abort", note: "back out of a merge that hit conflicts" },
        ],
        mission: "first-merge",
      },
    ],
  },
  {
    id: "undoing",
    title: "Undoing things",
    intro:
      "Three commands that sound interchangeable and are not. Which one is right depends on whether the mistake is in your files, in your local history, or already pushed.",
    entries: [
      {
        command: "git restore",
        name: "restore",
        summary: "Throws away changes to files. Never touches the commit history.",
        examples: [
          { code: "git restore config.json", note: "discard edits and take the committed version back" },
          { code: "git restore --staged config.json", note: "unstage it but keep the edits" },
        ],
        mission: "restore-a-file",
      },
      {
        command: "git reset",
        name: "reset",
        summary:
          "Moves the branch pointer, rewriting local history. Safe on your own machine, disruptive once the commits are shared.",
        examples: [
          { code: "git reset HEAD~1", note: "drop the last commit, leave the changes staged or not" },
          { code: "git reset --soft HEAD~1", note: "drop the commit but keep everything staged" },
          { code: "git reset --hard HEAD~1", note: "drop the commit and the changes with it" },
        ],
        mission: "undo-a-local-commit",
      },
      {
        command: "git revert",
        name: "revert",
        summary:
          "Undoes a commit by writing a new one that reverses it. The right choice for anything already pushed, because it rewrites nothing.",
        examples: [
          { code: "git revert HEAD", note: "reverse the most recent commit" },
          { code: "git revert --no-edit <commit>", note: "reverse an older commit without opening an editor" },
        ],
        mission: "undo-a-published-commit",
      },
    ],
  },
  {
    id: "stash",
    title: "Shelving work",
    intro:
      "Somewhere to park changes you are not ready to commit, so you can deal with an interruption and come back.",
    entries: [
      {
        command: "git stash",
        name: "stash",
        summary: "Puts uncommitted changes on a shelf and gives you a clean working tree.",
        examples: [
          { code: "git stash", note: "shelve tracked changes" },
          { code: "git stash -u", note: "include untracked files" },
          { code: 'git stash push -m "half-done prices"', note: "shelve with a label you will recognise" },
          { code: "git stash list", note: "see what is on the shelf" },
          { code: "git stash pop", note: "restore the newest entry and remove it from the shelf" },
          { code: "git stash apply stash@{1}", note: "restore a specific entry and keep it as a copy" },
          { code: "git stash drop stash@{0}", note: "delete one entry" },
          { code: "git stash clear", note: "empty the shelf completely" },
        ],
        mission: "stash-and-switch",
      },
    ],
  },
  {
    id: "rescue",
    title: "When it goes wrong",
    intro:
      "Commits are much harder to lose than people think. These two get work back that looks gone.",
    entries: [
      {
        command: "git reflog",
        name: "reflog",
        summary:
          "Every position HEAD has held, including commits no branch points at any more. This is how lost work is found.",
        examples: [{ code: "git reflog", note: "recent HEAD movements, newest first" }],
        mission: "lost-commits",
      },
      {
        command: "git cherry-pick",
        name: "cherry-pick",
        summary: "Copies one commit from somewhere else onto your current branch.",
        examples: [{ code: "git cherry-pick <commit>", note: "take that commit and nothing else" }],
        mission: "just-one-commit",
      },
    ],
  },
  {
    id: "remote",
    title: "Working with a remote",
    intro:
      "A remote is another copy of the repository, usually on a server. These four are where your work meets everyone else's.",
    entries: [
      {
        command: "git remote",
        name: "remote",
        summary: "Shows the remotes this repository is linked to.",
        examples: [
          { code: "git remote", note: "just the names, usually origin" },
          { code: "git remote -v", note: "names with their URLs" },
        ],
        mission: "meet-the-remote",
      },
      {
        command: "git fetch",
        name: "fetch",
        summary:
          "Downloads what the remote has without touching your branch or your files. Updates origin/* only.",
        examples: [{ code: "git fetch", note: "see what changed on the server, change nothing locally" }],
        mission: "fetch-the-news",
      },
      {
        command: "git pull",
        name: "pull",
        summary: "A fetch followed by a merge into the branch you are on. Can raise conflicts.",
        examples: [{ code: "git pull", note: "bring the remote's work into your branch" }],
        mission: "pull-it-in",
      },
      {
        command: "git push",
        name: "push",
        summary:
          "Sends your commits to the remote. Rejected when the remote has commits you do not, in which case pull first.",
        examples: [
          { code: "git push", note: "publish commits on the current branch" },
          { code: "git push -u origin main", note: "publish and set the upstream at the same time" },
        ],
        mission: "push-your-work",
      },
    ],
  },
];

/** Shell helpers the sandbox also understands, listed for completeness. */
export const SHELL_HELPERS = [
  { code: "ls", note: "list files" },
  { code: "cat <file>", note: "print a file" },
  { code: "touch <file>", note: "create an empty file" },
  { code: 'echo "text" > <file>', note: "write text to a file, replacing what was there" },
  { code: "rm <file>", note: "delete a file" },
  { code: "help", note: "every command available in the terminal" },
  { code: "clear", note: "clear the screen" },
];

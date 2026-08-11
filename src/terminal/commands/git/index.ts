import type { ShellCommand } from "../types";
import { add, commit, init, log, status } from "./basics";
import { branch, checkout, merge, switchCmd } from "./branching";
import { reset, restore, revert } from "./undo";
import { diff } from "./diff";
import { cherryPick, reflog } from "./history";
import { stash } from "./stash";
import { fetch, pull, push, remote } from "./remotes";

export const gitCommands: Record<string, ShellCommand> = {
  init,
  status,
  add,
  commit,
  log,
  branch,
  switch: switchCmd,
  checkout,
  merge,
  restore,
  reset,
  revert,
  diff,
  stash,
  reflog,
  "cherry-pick": cherryPick,
  remote,
  fetch,
  pull,
  push,
};

export const GIT_USAGE = [
  "usage: git <command> [<args>]",
  "",
  "Available commands in this environment:",
  "",
  "   init       Create a new repository",
  "   status     Working tree and staging area status",
  "   add        Add changes to the staging area",
  "   commit     Save staged changes to the history",
  "   log        View commit history",
  "   branch     Manage branches",
  "   switch     Switch branch",
  "   checkout   Switch branch or restore files",
  "   merge      Merge branches",
  "   restore    Restore files",
  "   reset      Move HEAD and the branch",
  "   revert     Safely undo a commit with a new commit",
  "   diff       View changes",
  "   stash      Shelve uncommitted changes and pick them up later",
  "   reflog     History of HEAD's movements; finds \"lost\" commits",
  "   cherry-pick  Apply a single commit from another branch",
  "   remote     Show the linked remote repositories",
  "   fetch      Download the remote's news (updates origin/* only)",
  "   pull       Fetch + merge the remote's work into your branch",
  "   push       Upload your commits to the remote",
].join("\n");

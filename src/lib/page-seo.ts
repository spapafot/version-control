/**
 * Search metadata for the top-level pages, in one place so the pages and the
 * generated keyword map read from the same source.
 *
 * Unlike the mission pages, these titles keep the site-name suffix from the
 * layout's title template, so they are written short enough to leave room for it.
 */
export interface PageSeo {
  keyword: string;
  secondary: string[];
  title: string;
  description: string;
}

export const PAGE_SEO = {
  "/": {
    keyword: "learn git by doing",
    secondary: ["interactive git course", "free git course", "practice git in browser"],
    title: "Learn Git, using Git: a free interactive course",
    description:
      "A free Git course you work through by running real commands in a browser terminal. 77 missions, a live commit graph, an optional free certificate.",
  },
  "/stages/": {
    keyword: "git learning path",
    secondary: ["git course curriculum", "git topics for beginners", "git syllabus"],
    title: "Git learning path: all 77 missions",
    description:
      "The full course map, from your first commit through merge conflicts, the reflog and remotes. Pick the topic you need or work straight through in order.",
  },
  "/playground/": {
    keyword: "online git sandbox",
    secondary: ["practice git commands online", "try git in browser", "git simulator"],
    title: "Online Git sandbox: practice in-browser",
    description:
      "An empty repository, a real terminal and a commit graph that redraws as you type. Try any Git command you like, with nothing at stake if it goes wrong.",
  },
  "/quiz/": {
    keyword: "git quiz",
    secondary: ["git interview questions", "git multiple choice questions", "test git knowledge"],
    title: "Git quiz: timed multiple choice",
    description:
      "A timed Git quiz built from real scenarios, four answers each. Race the clock for three minutes or take a set of twenty, then compare on the leaderboard.",
  },
  "/cheatsheet/": {
    keyword: "git commands cheat sheet",
    secondary: ["git command list", "git commands with examples", "git reference"],
    title: "Git commands cheat sheet you can try",
    description:
      "Every Git command worth knowing, what it does, and a link to the mission where you run it yourself. Written for people who keep forgetting the syntax.",
  },
  "/account/": {
    keyword: "free git certificate",
    secondary: ["git certification online", "git course certificate", "sync git progress"],
    title: "Your account and free Git certificate",
    description:
      "Create a free account to sync your mission progress across devices and issue a shareable Git certificate with a permanent verification link.",
  },
  "/verify/": {
    keyword: "verify git certificate",
    secondary: ["certificate verification", "open badges 3.0 verification", "credential check"],
    title: "Verify a Git certificate",
    description:
      "Check that a VersionControl.gr certificate is genuine. Enter a credential ID to see who earned it, when it was issued and the skills it covers.",
  },
  "/privacy/": {
    keyword: "privacy policy",
    secondary: ["cookie policy", "analytics consent"],
    title: "Privacy & Cookies",
    description:
      "What VersionControl.gr stores, what it never collects, and how analytics consent works. Accounts are optional, and nothing tracks you without consent.",
  },
  "/terms/": {
    keyword: "terms of use",
    secondary: ["terms and conditions"],
    title: "Terms of Use",
    description:
      "The terms for using the free VersionControl.gr Git course, including what the in-browser Git engine is for and where it stops standing in for real Git.",
  },
} as const satisfies Record<string, PageSeo>;

export type PagePath = keyof typeof PAGE_SEO;

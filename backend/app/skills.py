"""Ordered mapping from course section id to the human-readable skill it certifies."""

SECTION_SKILLS = {
    "terminal": "Command-line basics",
    "basics": "Git fundamentals",
    "commits": "Staging & committing",
    "branches": "Branching",
    "merge": "Merging",
    "conflicts": "Conflict resolution",
    "remotes": "Remote collaboration (fetch, pull, push)",
    "undo": "History manipulation & undo",
    "stash": "Stashing work in progress",
    "final": "Applied Git workflows",
    "disasters": "Recovery techniques (reflog, cherry-pick)",
}

SKILLS = list(SECTION_SKILLS.values())

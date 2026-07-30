---
name: sync-upstream
description: "Bring this fork up to date with claude-code-best/claude-code. Use whenever the user asks to sync with upstream, pull in upstream changes, check whether the fork is behind, update from claude-code-best, or merge the latest from the original repo."
---

This repo was **cloned** from `claude-code-best/claude-code`, not forked, so GitHub
offers no sync button and nothing tracks the drift. Full history was preserved, so
`git merge-base` finds a real shared commit rather than an approximation — everything
below relies on that.

Work through the phases in order. Report findings before acting; stop and hand over
rather than guessing.

## 1. Refuse on a dirty tree

```bash
git status --porcelain
```

Must be empty. A merge into uncommitted work is how people lose work — say so and stop.
Offer to commit or stash, but do not do it unasked.

## 2. Fetch

The `upstream` remote should already exist. Add it if it does not:

```bash
git remote get-url upstream 2>/dev/null || git remote add upstream git@github.com:claude-code-best/claude-code.git
git fetch upstream
```

## 3. Survey before touching anything

```bash
BASE=$(git merge-base HEAD upstream/main)
git rev-list --left-right --count HEAD...upstream/main      # ours <TAB> theirs
git log --oneline --no-merges "$BASE"..upstream/main
```

If they are 0 ahead, say "already up to date" and stop. Do not create an empty merge.

Then compute the number that actually predicts how the merge will go — **the overlap**:

```bash
git diff --name-only "$BASE"..HEAD           | sort > /tmp/sync-ours.txt
git diff --name-only "$BASE"..upstream/main  | sort > /tmp/sync-theirs.txt
comm -12 /tmp/sync-ours.txt /tmp/sync-theirs.txt
```

Files neither side shares cannot conflict, so this list is the whole risk surface. For
each entry, look at both patches and say whether they touch the same region. Report the
commit list and the overlap, then ask to proceed.

## 4. Merge — never rebase, never cherry-pick

```bash
git merge upstream/main --no-edit
```

Both alternatives are worse, and the reasons do not change between syncs:

- **Rebase** replays our commits on top and rewrites every one of them. They are already
  pushed to `origin`, so it needs a force-push.
- **Cherry-pick** avoids the force-push but leaves `merge-base` pinned at the old commit
  forever, so the next sync re-offers everything already applied and the drift compounds.

A merge keeps upstream's commits at their original SHAs, rewrites nothing, and moves the
merge-base — which is the whole reason the next sync is cheap.

## 5. Conflicts

Generated artefacts — resolve to upstream without asking, they carry no decisions:

```
contributors.svg   bun.lock   *.lock
```

```bash
git checkout --theirs <file> && git add <file>
```

`contributors.svg` conflicts on most syncs because the same workflow regenerates it in
both repos. That is expected and means nothing.

**Anything else — stop.** Show both sides and what each was trying to do. Do not resolve
source conflicts unattended, and do not take one side because it is shorter. If a source
file conflicts, the overlap survey in phase 3 predicted it; if it did not, say so, because
that means the survey was wrong and is worth understanding.

Commit with `git commit --no-edit` once clean. The pre-commit hook runs biome over the
merged files, which is expected.

## 6. Verify

```bash
bun run precheck
```

**Compare against known failures, not a pass count** — the count rises whenever upstream
adds tests. As of the 2026-07-30 sync the only failures are three pre-existing
skill-search tests, out of scope and unrelated to any merge:

```
skill search prefetch > auto-loads high-confidence project skill content
skill search prefetch > records a pending skill gap on the first unmatched prompt
skillLearning smoke > ingests corrections, evolves a learned skill, and skill search finds it
```

Any other failure is caused by the merge. Investigate it rather than reporting a number.

Then exercise the fork's own subsystem, since it is what a merge is most likely to break
silently:

```bash
bun test src/themes/ src/commands/theme/ src/scene/
```

If upstream touched `src/utils/sideQuery.ts`, `src/services/api/`, or
`packages/@ant/model-provider/`, read those patches: the theme generation and refinement
flow (`src/themes/generate/call.ts`) depends on how `sideQuery` flattens messages for the
OpenAI and Gemini adapters. It keeps only `type: 'text'` blocks, which is exactly why
theme refinement sends one user turn instead of holding a conversation. If that behaviour
ever changes, `call.ts`'s header comment is wrong and the design can be revisited.

## 7. Stop before pushing

Report what came in, what conflicted and how it was resolved, and the test delta. Let the
user decide whether to push.

---

## This fork's permanent divergences

These are intentional. A future sync should recognise them rather than "fixing" them
back toward upstream:

- **`package.json`** — the binaries are renamed `ccb` → `cct` (`cct`, `cct-bun`). Upstream
  edits `version` on the line above; the two have never collided but they are close.
- **`~/.claude/cct`** is the themes directory (upstream has no equivalent), with a
  one-time migration from the old `cc-themes` name in `src/themes/migrate.ts`.
- **The theme and scene subsystem is ours alone** — `src/themes/`, `src/scene/`,
  `src/commands/theme/`, `src/components/ThemeGrid/`, `docs/features/theme-scenes.md`.
  Upstream has none of it, so it can never conflict, but it does depend on upstream code:
  `sideQuery`, `StructuredDiff`, `packages/@ant/ink`'s `ThemeProvider`, and
  `packages/color-diff-napi`.
- **`packages/@ant/ink/src/theme/ThemeProvider.tsx`** carries a local fix: the theme
  registry version is folded into the context memo so re-registering a theme under the
  same name repaints. Without it, live theme-file reload and in-place theme refinement
  both silently do nothing. If upstream ever edits this file, keep that change.

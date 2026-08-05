---
name: Bug report
about: Something does not work the way it should
title: ''
labels: bug
assignees: ''
---

## What happened

<!-- What you did, and what happened instead of what you expected. -->

## Steps to reproduce

1.
2.
3.

## If it is a theme or animation problem

Skip this section if it isn't.

- **Theme name:**
- **Is the animation visible at all?** (matrix, sakura and winter animate; a
  theme with `"scene": {"kind": "none"}` is meant to be still)
- **Does `/tui status` say enabled?** Scenes only paint in the alternate
  screen buffer. It is on by default; `/tui on` turns it back on, and the
  change takes effect on the next start.
- **Attach the theme file** if you designed it — `~/.claude/ccs/<name>.json`.

## Environment

| | |
|---|---|
| Version (`ccs --version`) | |
| Install method | npm / built from source |
| OS | |
| Terminal | e.g. iTerm2, Windows Terminal, Ghostty, tmux |
| Node version | |
| Model provider | Anthropic / OpenAI-compatible / Gemini / other |

## Logs or screenshots

<!--
For an animation problem a screen recording is worth far more than a
description. For a crash, paste the full error.
-->

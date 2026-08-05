<div align="center">

# claude-code-scenes

**Animated themes for the Claude Code terminal.**
Three ship with it. The rest you design by describing them.

[Website](https://rezathepure.github.io/claude-code-scenes/) ·
[Theme format](docs/features/theme-scenes.md) ·
[Notice & licensing](NOTICE.md)

</div>

<div align="center">
  <img src="assets/scenes/matrix.svg" alt="The matrix theme: green katakana falling in columns down a dark terminal" width="720">
</div>

---

## What this is

A fork of [claude-code-best/claude-code](https://github.com/claude-code-best/claude-code)
that adds one thing: **animations that paint behind your conversation**, and a
way to invent new ones by describing what you want.

The animation lives entirely in the theme's JSON file — no code ships for it.
That is what lets a binary you installed from npm produce an animation nobody
wrote into it.

## Install

```sh
npm i -g claude-code-scenes
ccs
```

Then `/theme` to pick one, or `/theme create "a vibe"` to design your own.

> Bring your own API credentials — Anthropic, or any compatible provider via
> `/login`. This ships no API access and you pay for your own usage.

## The three starters

| | |
|---|---|
| **matrix** · rain | Phosphor-green terminal. One hue with discipline. |
| **sakura** · petals | A cherry-blossom night. Sakura pink leads, honey pays the bills. |
| **winter** · snowfall | Snow past a lantern-lit yard. Icy blue leads, one warm ember. |

They are written to `~/.claude/ccs/` the first time you run it, as ordinary
files. Edit one in place and it hot-reloads. Delete one and it stays deleted.

## Designing one

```
/theme create "cyberpunk thunderstorm"
```

One generation, then a loop. You get two views of the draft — the backdrop
animating at full size, and a scripted session exercising about fifteen colour
slots — and either accepts a change in plain language: *"slower"*, *"add
drifting embers"*, *"calmer warnings"*. Refinements return a delta, so anything
you did not mention stays as it was, and you can undo. Nothing is written to
disk until you keep it.

## Notes

**Animations need the alternate screen buffer**, which is on by default. If you
prefer inline rendering, `/tui off` turns it off permanently — themes still
apply their colours, they just stop moving.

**Theme files are meant to be shared, so nothing in one is ever executed.**
Shader expressions go through a hand-written lexer and parser — no `eval`, no
`Function` constructor, no property access — under hard caps, with a fuzz test.
Details in [docs/features/theme-scenes.md](docs/features/theme-scenes.md).

**Install-time behaviour.** `postinstall` downloads a ripgrep binary from
GitHub releases for the search tools. `CLAUDE_CODE_SKIP_POSTINSTALL=1` skips
it; `RIPGREP_DOWNLOAD_BASE` points it elsewhere. Chrome integration is opt-in
via `CLAUDE_CODE_SETUP_CHROME_MCP=1` and does nothing otherwise.

## Building from source

Needs [Bun](https://bun.sh) ≥ 1.3.11.

```sh
bun install
bun run dev          # run it
bun run precheck     # typecheck + lint + test
bun run capture:scenes   # regenerate the demo assets from the engine
```

## Credits and legal

Not affiliated with, endorsed by, or sponsored by Anthropic. "Claude", "Claude
Code" and "Anthropic" belong to [Anthropic PBC](https://www.anthropic.com/),
and all rights in Claude Code and the Claude models are theirs. If you want the
supported, official tool, use
[Anthropic's Claude Code](https://docs.anthropic.com/en/docs/claude-code).

This is a fork of [claude-code-best/claude-code](https://github.com/claude-code-best/claude-code),
an independent reverse-engineered reproduction that is **not** Anthropic's
official distribution. The animated-theme work is what this fork adds; it is
MIT-licensed under [LICENSE-SCENES](LICENSE-SCENES), scoped by explicit path
list. There is deliberately no repository-wide licence — the reasoning is in
[NOTICE.md](NOTICE.md), which you should read before forking or redistributing.

Provided as-is, with no warranty.

# Notice, attribution and licensing

Read this before installing, forking or redistributing this project.

## Not affiliated with Anthropic

This project is **not affiliated with, endorsed by, sponsored by, or connected
to Anthropic** in any way. It is an independent community project.

"Claude", "Claude Code" and "Anthropic" are the property of
[Anthropic PBC](https://www.anthropic.com/). All rights in Claude Code, in the
Claude models, and in Anthropic's trademarks belong to Anthropic. Nothing here
claims any right in them, and no part of this project should be read as
speaking for Anthropic.

If you want a supported, officially maintained tool, use
[Anthropic's Claude Code](https://docs.anthropic.com/en/docs/claude-code).
That is the real thing; this is not a substitute for it.

## What this project is, precisely

This repository is a fork of
[`claude-code-best/claude-code`](https://github.com/claude-code-best/claude-code)
("CCB"). CCB describes itself as a reverse-engineered reproduction of
Anthropic's Claude Code CLI. It is **not** Anthropic's official distribution
and was not produced or sanctioned by Anthropic.

This fork exists to add one thing on top of CCB: **animated themes for the
terminal UI, and a flow for designing new ones by describing them**. That work
— the scene engine, the theme format, the picker and the generation flow — is
original to this fork. Essentially everything else is inherited from CCB, and
through CCB derives from Anthropic's work.

Being clear about that split is the point of this file. Please do not
represent this project as an Anthropic product, and please do not represent
the inherited parts as this project's own work.

## Licensing

**There is no repository-wide open-source licence, and this is deliberate.**

The majority of this codebase derives from Anthropic's proprietary Claude Code.
Those rights are not this project's to license, so attaching an MIT or Apache
licence at the root would be claiming to grant permissions the maintainers do
not hold. Publishing no grant at all is the honest position: it leaves
Anthropic's rights exactly where they are.

In practical terms:

- **No warranty.** Provided as-is, with no guarantee of fitness, correctness,
  availability or continued operation.
- **Use at your own risk**, for personal, research and educational purposes.
- **You are responsible for your own compliance** with Anthropic's
  [Terms of Service](https://www.anthropic.com/legal/consumer-terms) and
  [Usage Policy](https://www.anthropic.com/legal/aup), and with the terms of
  whichever API provider you configure.
- **Redistribution** of the inherited parts is not something this project can
  authorise.

### The one part that is licensed

The animated-theme work original to this fork is offered under the MIT licence,
scoped explicitly and only to these paths:

```
src/scene/                    the scene engine (fields, sprites, shaders, expression parser)
src/themes/                   the theme file format, loading, validation, generation
src/components/ThemeGrid/     the grid picker
src/components/SceneBridge.tsx
scripts/capture-scene.ts      the asset capture pipeline
scripts/render-scene-svg.ts
scripts/lib/scene-svg.ts
assets/scenes/                the generated demo assets
```

See [`LICENSE-SCENES`](./LICENSE-SCENES) for the grant. It covers those paths
and nothing else — in particular it does not extend to the rest of this
repository, and it grants no rights in anything owned by Anthropic.

## Credentials and cost

This project ships no API access. You bring your own Anthropic account or a
compatible provider, and you pay for your own usage. Designing a theme with
`/theme create` makes a model call and costs whatever your provider charges
for it.

## Contact

If you are Anthropic and want something on this page changed or this project
taken down, please open an issue on the repository or contact the maintainer
through GitHub, and it will be actioned.

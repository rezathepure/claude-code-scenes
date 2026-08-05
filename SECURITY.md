# Security Policy

## Supported versions

This project is pre-1.0. Only the latest published version receives fixes.

| Version | Supported |
| ------- | --------- |
| latest `0.x` | ✅ |
| anything older | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through GitHub:
[Security → Report a vulnerability](https://github.com/rezathepure/claude-code-scenes/security/advisories/new)

What to expect:

- **Acknowledgement** within 7 days.
- **An assessment** — accepted, already known, or not applicable, with reasoning — within 14 days.
- **A fix released** for accepted reports, credited to you unless you'd rather not be.

If you get no response in 14 days, please open a public issue saying only that
you sent a private report and heard nothing. Don't include the details.

## Scope worth knowing about

Two parts of this project have a wider blast radius than the rest, and reports
about them are especially welcome:

- **`postinstall`** downloads a ripgrep binary from GitHub releases and marks
  it executable. There is no checksum verification. Setting
  `RIPGREP_DOWNLOAD_BASE` redirects that download, and
  `CLAUDE_CODE_SKIP_POSTINSTALL=1` disables it entirely.
- **Theme files are meant to be shared**, so nothing in one is ever executed.
  Shader expressions are parsed by a hand-written lexer and parser with no
  `eval`, no `Function` constructor and no property access, under hard caps.
  If you find a theme file that escapes that, it is a real vulnerability —
  please report it. See `docs/features/theme-scenes.md`.

## Out of scope

This project is a fork of
[claude-code-best/claude-code](https://github.com/claude-code-best/claude-code),
which is itself an independent reproduction of Anthropic's Claude Code. It is
not affiliated with Anthropic — see [NOTICE.md](./NOTICE.md).

- Vulnerabilities in **Anthropic's** Claude Code should go to Anthropic.
- Vulnerabilities in **inherited upstream code** that this fork has not
  touched are best reported upstream as well, though we'd still like to know.
- Vulnerabilities in the **theme and scene layer**, the packaging, or anything
  this fork added are ours. Send those here.

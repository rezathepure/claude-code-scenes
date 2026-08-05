# To be filled later

Everything still waiting on a decision or a value from you.

**Status as of 2026-08-05:** repo public, 9 commits pushed, CI green (now with a
smoke test that runs the built binary), Pages live at
https://rezathepure.github.io/claude-code-scenes/ with the three themes.
Package is publish-ready and verified end to end — **not yet published**.

---

## 1 · GitHub repo settings — ✅ DONE

Description, website and topics are all set. Nothing outstanding.

> ⚠️ **The repo went private at some point today**, which silently switched off
> Pages (`has_pages: false`) and would have broken `npm publish --provenance`.
> It is public again and Pages has been re-enabled and redeployed. Worth knowing
> the failure mode: Pages on a private repo needs a paid plan, and it does not
> turn itself back on when you go public again.

---

## 2 · Decisions — ✅ ALL RESOLVED

- **2a · Starter themes** → three: `matrix`, `sakura`, `winter`. `parchment`
  and `voltage` still ship as worked examples but are never installed
  (`WORKED_EXAMPLES` in `src/themes/bundled/index.ts`). `parchment` is in fact
  tree-shaken out of the bundle entirely; `voltage` stays because
  `generate/prompt.ts` quotes it to the model.
- **2b · Duplicate winter** → `winter-vibe-snowballs.json` deleted, `winter.json`
  kept. The two differed only by a `$schema` line and the `author` field.
- **2c · Version** → own SemVer from `0.1.0`, with
  `"upstreamBase": "claude-code-best@2.8.4"` recording the fork point.

---

## 3 · npm publishing — ⏸ BLOCKED ON YOU

Everything on the repo side is done. What's left needs your device.

### Your npm account, for the record

|  |  |
|---|---|
| User account | `claude-code-scenes` (alireza1377eftekhari@gmail.com) |
| Organization | `rezathepure` — 0 packages, reserves the `@rezathepure` scope |
| Package will be | `claude-code-scenes`, unscoped, user-owned |
| 2FA | **not enabled** — you chose to enable it before publishing |
| CLI auth | dead (`401`) — needs a fresh `npm login` |

This is the shape of an npm user→org conversion: your old username became the
org and your personal account was renamed. **npm has no rename feature** — the
only "fix" is a new account with a different email, and it is not worth it.
Usernames and package names are separate namespaces, so nothing about this
blocks the package name.

### The sequence

```sh
# 1. Enable 2FA at npmjs.com → Account → Two-Factor Authentication
#    SAVE THE RECOVERY CODES. Without them, a lost phone locks you out.

# 2. Re-authenticate the CLI (needs a real terminal — I cannot do this for you)
npm logout
npm login

# 3. Publish
npm publish --access public --otp=<6-digit code>
```

`prepublishOnly` rebuilds with Vite first. That path is verified: build runs,
`--version` prints `0.1.0`, a clean-room install into an isolated prefix works,
5.9 MB packed.

> **`0.1.0` is permanent once published.** npm allows unpublish only within 72
> hours, and the version number can never be reused afterwards.

### After the first publish

- [ ] **Set up trusted publishing** — npmjs.com → package settings → Trusted
      Publisher → GitHub Actions. `publish-npm.yml` already has
      `id-token: write` and `--provenance`, so after this CI publishes with
      **no `NPM_TOKEN` secret at all**.
- [ ] **Do not create a bypass-2FA token.** Superseding earlier advice: npm is
      deprecating them — sensitive actions blocked as of Aug 2026, direct
      publishing gone around Jan 2027. Trusted publishing is the replacement.
- [ ] Tag future releases: `git tag vX.Y.Z && git push --tags`

---

## 4 · README — the last real piece of work

`README.md` is now a short, honest English page — enough to publish behind, not
the designed one. The full rewrite is still yours to direct.

**Tone / what it should feel like:**

______________________________________________

**Must say:**

______________________________________________

**Must NOT say:**

______________________________________________

**Sections you want, in order:**

1. ______________
2. ______________
3. ______________
4. ______________

**Anything to lift from the landing page** (`site/index.html`):

______________________________________________

---

## 5 · Live test you still have not done

Verified mechanically and against a clean-room install, but you have not seen
it. Alt-screen is on by default now, so this is the whole test:

```
cct
/theme
```

- [ ] Three themes listed: matrix, sakura, winter
- [ ] `winter` shows snowfall **and** the snowman sprite moving across
- [ ] `ls ~/.claude/cct/` shows the three `.json` files plus `.seeded`
- [ ] `/theme delete matrix` removes the real file, and it stays gone after restart
- [ ] `/theme restore matrix` brings it back
- [ ] `/theme create "a vibe"` produces something usable

Anything wrong: ______________________________________________

> Your `~/.claude/cct/` still has `parchment.json` and `voltage.json` from an
> earlier build. Seeding never deletes, so they linger. Remove them by hand for
> a true view of what a new user sees.

---

## 6 · Parked / maybe never

- [ ] **ArtifactTool** — now requires `CLAUDE_ARTIFACTS_URL` and no longer
      defaults to upstream's server. There is **no official Anthropic artifacts
      endpoint** to point it at: the Files API returns no public URL and is
      session-scoped, and artifact publishing is a claude.ai UI feature with no
      public API. Either self-host `packages/cloud-artifacts/`, or drop the tool
      from this fork — it is unrelated to themes and is extra surface area.
      Decision: ____________
- [ ] **`originator: 'claude-code-best'`** sent to OpenAI-compatible endpoints
      (`responsesAdapter.ts`). Left alone deliberately: some providers validate
      that string and there is no way to test the change safely.
- [ ] **Attribution emails** — nine `@claude-code-best.win` addresses in
      `src/utils/attributionEmail.ts` land in commit trailers when using
      non-Claude models. You chose not to touch these. Revisit? ____________
- [ ] Chinese README translation (`README.zh-CN.md`).
- [ ] Mintlify docs (`docs.json`, `mint.json`) still upstream's, pointing at
      `ccb.agent-aura.top`. Repoint or delete.
- [ ] `sakura` and `winter` are faint in the gallery by design. Can be captured
      at a smaller grid so glyphs sit larger in marketing shots. Want that?
      ____________

# Theme scenes

A theme can carry an **animation**, drawn faintly behind the conversation. It
is described entirely in the theme's JSON file — no code ships for it — which
is what lets `/theme create "<vibe>"` design a new animation at runtime on a
binary installed from a package manager.

## Why it works this way

The animation used to be a two-value enum: `rain` or `petals`. The generation
prompt mapped moods onto those names, so asking for "cyberpunk" reliably
produced matrix's rain in a different colour. Every animated theme collapsed
into one of two looks.

The fix was not more primitives — a bigger enum still ships in a release, and
users on `brew`/`npm` can never get anything that was not pre-authored. The
expressiveness had to move into the **data**. The renderer ships once; the
model ships content.

## The format

```jsonc
"scene": {
  "kind": "custom",
  "label": "neon drizzle",     // shown beside the theme in /theme
  "fields":  [ /* ≤4 particle layers */ ],
  "sprites": [ /* ≤3 drawn subjects */ ],
  "shaders": [ /* ≤2 expression layers */ ]
}
```

`{"kind": "none"}` is still, and `{"kind": "rain"}` / `{"kind": "petals"}`
remain as shorthands for the two shipped presets — they desugar into ordinary
field layers at build time (`src/scene/presets.ts`), so they are not special
cases beside the grammar but points inside it. `src/scene/__tests__/golden.test.ts`
pins the exact frames they produce.

If any layer array is non-empty the scene is treated as custom regardless of
`kind`.

### Fields — texture

Particles. `motion` picks one of `fall rise drift stream scan orbit twinkle`;
`glyphs` names a catalog (`src/scene/glyphs.ts`); `color` names a palette slot
the ramp is derived from, so the animation always matches the theme.
`fall` is the old rain and `drift` is the old petals.

### Sprites — a subject

Model-drawn ASCII frames plus a motion path. A space is **transparent**, so a
sprite has a silhouette rather than a rectangle. `trailChar` draws the path
already travelled — on a `descend` path that line is the silk a spider hangs
from.

Characters are restricted to an explicit code-point allow-list
(`src/scene/frames.ts`) whose every member is asserted width-1 by a test; one
wide glyph would desync the terminal cell buffer.

### Shaders — a rhythm

One arithmetic expression evaluated per cell, giving a brightness:

```jsonc
{ "expr": "sin(u*11 + t/13) * sin(v*6 - t/21)", "threshold": 0.74, "levels": 4 }
```

Prefer `u`/`v` (normalised 0–1) over `x`/`y` so the look does not change with
terminal size.

## Safety

Theme files are meant to be shared, so nothing in one is ever executed.

- Fields and sprites are inert data — names, bounded numbers and characters
  from a fixed allow-list.
- The shader expression is parsed by a hand-written lexer and precedence
  parser (`src/scene/expr/`) and compiled to a closure tree. There is **no
  `eval`, no `Function` constructor, no property access, no strings**. The
  lexer is a character whitelist; function and variable tables are `Map`s, not
  object literals, so `constructor` and `__proto__` resolve to nothing.
- Caps are enforced during parsing, not after: 120 characters, 96 tokens, 128
  nodes, 24 levels of nesting.
- `src/scene/__tests__/expr.test.ts` carries the adversarial suite and a
  10,000-string fuzz test asserting the parser never throws and anything it
  accepts is safe to evaluate.

## Budgets

`ScenePass` paints at most `min(600, w*h*0.15)` cells per frame, truncating by
array prefix, and only into cells no UI component has written. The compositor
(`src/scene/composite.ts`) therefore orders layers by `priority` — array order
is both paint order and z-order — reserves sprites their natural size first,
and divides the rest by `weight`.

Style IDs are packed into 15 bits and never evicted, so all interning happens
once per theme activation in `src/scene/compile.ts`; a shader quantises to
`levels` (2–7) pre-interned styles and never sees the interner.

Per-layer `intensity` is additive. A scene spending more than 1.6 across its
layers is scaled down proportionally at compile time, preserving the balance
between layers.

## Seeing it

Scenes only paint in alt-screen. External users are inline by default:

```bash
CLAUDE_CODE_NO_FLICKER=1 FEATURE_SCENE_LAYER=1 bun run dev
```

The 26×4 tile in `/theme` renders through the same compiler, and for anyone not
running alt-screen it is the only place a scene is visible — so it is treated
as a first-class target and every preset is tested at that size. The create
flow shows a larger box of the same thing (`BackdropPreview`), paired with a
prose summary from `describeScene`: sparse scenes genuinely put three or four
characters in a panel-sized box, and the words are what you can act on.

## Designing one

`/theme` → **Create your own** → describe a vibe. One generation, then a loop:

- **Backdrop** — the animation, and a box to describe changes to it.
- **Text colours** — a scripted session exercising fifteen slots.

Either view accepts a change in plain language ("slower", "add drifting
embers", "calmer warnings"), applies it to the same draft, and can be undone.
Both are peers — Keep works from either.

Three rules hold that together, and changing any of them breaks it:

1. **Omission means unchanged.** `refine_theme` returns a colour *delta*, and
   an absent `scene` leaves the animation alone. Enforced in `mergeRefinement`
   (`src/themes/generate/refine.ts`), never by narrowing the tool schema — a
   scene-only tool would have to answer "brighter greens" with a shrug.
   `mergeRefinement` must never call `resolveThemeColors`: that fills from the
   *built-in* palette and would silently reset every slot not mentioned.
2. **One user turn, never a conversation.** The OpenAI and Gemini adapters in
   `sideQuery` keep only text blocks, so an assistant turn that is a lone
   `tool_use` vanishes on three of four providers. The current theme is
   embedded in the user turn instead. See `src/themes/generate/call.ts`.
3. **Re-registering the same name must repaint.** `ThemeProvider` folds the
   theme registry version into its context value, and the creator calls
   `sceneController.refresh()` after each re-register because `SceneBridge`
   syncs on the theme *name*, which has not changed. Without both, every
   refinement is invisible.

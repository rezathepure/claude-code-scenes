#!/usr/bin/env bun
/**
 * Runs a script with the MACRO defines and feature flags the app expects.
 *
 * The capture scripts mount real app components, which reach for MACRO.VERSION
 * and `feature()` gates during render — without these, `VoiceContext.Provider`
 * is undefined and the render dies inside React. Same mechanism as
 * `scripts/dev.ts`, pointed at an arbitrary target instead of the CLI.
 *
 * FORCE_COLOR is forced on for a reason worth remembering: `renderToAnsiString`
 * emits no escape codes at all when stdout is not a TTY, so every glyph comes
 * back the default foreground and the captured frames are monochrome.
 *
 *   bun run scripts/render-with-defines.ts scripts/capture-demo.tsx
 */

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_BUILD_FEATURES, getMacroDefines } from './defines.ts'

const target = process.argv[2]
if (target === undefined) {
  console.error(
    'usage: bun run scripts/render-with-defines.ts <script> [args...]',
  )
  process.exit(1)
}

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const defines = {
  ...getMacroDefines(),
  'process.env.NODE_ENV': JSON.stringify('production'),
}

const result = Bun.spawnSync(
  [
    'bun',
    'run',
    ...Object.entries(defines).flatMap(([k, v]) => ['-d', `${k}:${v}`]),
    ...DEFAULT_BUILD_FEATURES.flatMap(name => ['--feature', name]),
    resolve(projectRoot, target),
    ...process.argv.slice(3),
  ],
  {
    stdio: ['inherit', 'inherit', 'inherit'],
    cwd: projectRoot,
    env: { ...process.env, FORCE_COLOR: '3' },
  },
)

process.exit(result.exitCode ?? 0)

/**
 * Scene controller — the app-side owner of the animation.
 *
 * Decides WHETHER anything animates (settings toggle, reduced motion, TTY,
 * the active theme's scene config, degrade state), builds the model with
 * theme-derived styles, and runs the ticker. The ink ScenePass owns the
 * painting; this owns the policy and the clock.
 *
 * The ticker calls model.tick() then ink.onRender() — a full synchronous
 * frame outside the React throttle. Scene state advances ONLY here, so React
 * renders between ticks repaint the identical frame (A0 measured a tick at
 * ~1ms p50 on a 2800-row transcript; 10fps ≈ 1-2% of a core).
 */

import { instances, type SceneModel } from '@anthropic/ink'
import { registerCleanup } from '../utils/cleanupRegistry.js'
import { getGlobalConfig } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import { isFullscreenActive } from '../utils/fullscreen.js'
import { getTheme } from '../utils/theme.js'
import { derivePetalStyles, deriveRainStyles } from './colors.js'
import { createPetalsModel } from './petals.js'
import { createRainModel } from './rain.js'
import { getSceneConfig } from './registry.js'
import { mulberry32 } from './rng.js'

/** The slice of Ink the controller talks to (structural — Ink isn't exported). */
type InkLike = {
  setSceneModel(model: SceneModel | null): void
  internSceneStyle(color: string): number
  onRender(): void
}

/**
 * Tick cadences the degrade ladder steps through. 10fps is the A0-validated
 * default; each escalation halves toward the floor, then disables.
 */
const TICK_LADDER_MS = [100, 200, 250] as const

/** A tick above this, sustained for a full window, triggers escalation. */
const DEGRADE_THRESHOLD_MS = 12
const DEGRADE_WINDOW = 30

/**
 * Watches tick durations and says when to slow down or give up. Pure, so the
 * ladder is unit-testable without timers: feed durations, read verdicts.
 */
export class DegradeTracker {
  private samples: number[] = []
  private level = 0

  /** Current index into TICK_LADDER_MS. */
  get ladderLevel(): number {
    return this.level
  }

  /**
   * Record one tick. Returns 'ok', 'slow' (drop to the next ladder step) or
   * 'disable' (already at the floor and still too slow).
   */
  record(durationMs: number): 'ok' | 'slow' | 'disable' {
    this.samples.push(durationMs)
    if (this.samples.length < DEGRADE_WINDOW) return 'ok'

    const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length
    this.samples = []
    if (mean <= DEGRADE_THRESHOLD_MS) return 'ok'

    if (this.level < TICK_LADDER_MS.length - 1) {
      this.level++
      return 'slow'
    }
    return 'disable'
  }
}

export type ScenePolicyInput = {
  themeName: string
  reducedMotion: boolean
}

class SceneController {
  private timer: ReturnType<typeof setInterval> | undefined
  private ink: InkLike | null = null
  private model: SceneModel | null = null
  private tracker = new DegradeTracker()
  /** Disabled for the rest of the session after the ladder bottomed out. */
  private disabledByDegrade = false
  private lastPolicy: ScenePolicyInput | null = null
  private cleanupRegistered = false

  /**
   * Re-evaluate everything and start/stop/rebuild accordingly. Called by the
   * SceneBridge on theme or reduced-motion changes, and by refresh() when the
   * settings toggle flips.
   */
  syncPolicy(input: ScenePolicyInput): void {
    this.lastPolicy = input

    const scene = getSceneConfig(input.themeName)
    const enabled =
      scene.kind !== 'none' &&
      !input.reducedMotion &&
      !this.disabledByDegrade &&
      getGlobalConfig().sceneAnimationsEnabled !== false &&
      process.stdout.isTTY === true &&
      // Scenes are alt-screen-only (ScenePass is gated on altScreenActive):
      // inline mode has no sky to paint and its diffs land in scrollback.
      // Without this check the ticker would burn a no-op onRender() at 10fps
      // for users in the default inline layout.
      isFullscreenActive()

    if (!enabled) {
      this.stop()
      return
    }

    const ink = instances.get(process.stdout) as unknown as InkLike | undefined
    if (!ink) {
      this.stop()
      return
    }

    // Rebuild from scratch on every (re)activation: models are cheap, and a
    // theme switch changes the derived styles anyway.
    this.teardownModel()
    this.ink = ink

    const theme = getTheme(input.themeName) as unknown as Record<string, string>
    const seed = Date.now() >>> 0
    if (scene.kind === 'rain') {
      this.model = createRainModel(
        scene.params,
        deriveRainStyles(theme, ink),
        mulberry32(seed),
      )
    } else {
      this.model = createPetalsModel(
        scene.params,
        derivePetalStyles(theme, ink),
        mulberry32(seed),
      )
    }

    ink.setSceneModel(this.model)
    this.startTicker()

    if (!this.cleanupRegistered) {
      this.cleanupRegistered = true
      registerCleanup(async () => {
        this.stop()
      })
    }
  }

  /** Re-run the last policy — for the /config toggle taking effect live. */
  refresh(): void {
    if (this.lastPolicy) {
      this.syncPolicy(this.lastPolicy)
    }
  }

  /** Stop animating and erase the scene from screen. */
  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    this.teardownModel()
  }

  private teardownModel(): void {
    if (this.model !== null) {
      this.model = null
      // Triggers the final erasing sweep inside the pass.
      this.ink?.setSceneModel(null)
    }
  }

  private startTicker(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer)
    }
    const interval = TICK_LADDER_MS[this.tracker.ladderLevel] ?? 100
    this.timer = setInterval(() => {
      const ink = this.ink
      const model = this.model
      if (!ink || !model) return

      const start = performance.now()
      model.tick()
      ink.onRender()
      const verdict = this.tracker.record(performance.now() - start)

      if (verdict === 'slow') {
        logForDebugging(
          `[scene] Ticks running hot; slowing to ${TICK_LADDER_MS[this.tracker.ladderLevel]}ms`,
          { level: 'warn' },
        )
        this.startTicker() // restart at the new cadence
      } else if (verdict === 'disable') {
        logForDebugging(
          '[scene] Ticks still too slow at minimum cadence; disabling scene animations for this session',
          { level: 'warn' },
        )
        this.disabledByDegrade = true
        this.stop()
      }
    }, interval)
    // Never keep the process alive just to animate.
    this.timer.unref?.()
  }
}

export const sceneController = new SceneController()

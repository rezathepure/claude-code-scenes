import { afterEach, describe, expect, test } from 'bun:test'
import { DegradeTracker, sceneController } from '../controller.js'
import { clearSceneRegistry, registerScene } from '../registry.js'

afterEach(() => {
  sceneController.stop()
  clearSceneRegistry()
})

describe('DegradeTracker', () => {
  test('stays quiet while ticks are fast', () => {
    const t = new DegradeTracker()
    for (let i = 0; i < 100; i++) {
      expect(t.record(2)).toBe('ok')
    }
    expect(t.ladderLevel).toBe(0)
  })

  test('one slow spike inside a fast window does not escalate', () => {
    // The mean over the window decides, not a single outlier — a GC pause
    // must not slow the animation for the rest of the session.
    const t = new DegradeTracker()
    let verdicts: string[] = []
    for (let i = 0; i < 30; i++) {
      verdicts.push(t.record(i === 5 ? 80 : 2))
    }
    expect(verdicts.every(v => v === 'ok')).toBe(true)
  })

  test('a sustained slow window steps down the ladder once', () => {
    const t = new DegradeTracker()
    const verdicts: string[] = []
    for (let i = 0; i < 30; i++) verdicts.push(t.record(20))

    expect(verdicts.filter(v => v === 'slow')).toHaveLength(1)
    expect(t.ladderLevel).toBe(1)
  })

  test('keeps stepping down, then disables at the floor', () => {
    const t = new DegradeTracker()
    const all: string[] = []
    // Three consecutive hot windows: slow, slow, disable.
    for (let w = 0; w < 3; w++) {
      for (let i = 0; i < 30; i++) all.push(t.record(20))
    }

    expect(all.filter(v => v === 'slow')).toHaveLength(2)
    expect(all.filter(v => v === 'disable')).toHaveLength(1)
  })

  test('recovering after a step-down does not disable', () => {
    const t = new DegradeTracker()
    for (let i = 0; i < 30; i++) t.record(20) // → slow
    const verdicts: string[] = []
    for (let i = 0; i < 60; i++) verdicts.push(t.record(2)) // healthy again

    expect(verdicts.includes('disable')).toBe(false)
    expect(t.ladderLevel).toBe(1) // slowed, but stable
  })
})

describe('sceneController policy', () => {
  // Full activation needs a live Ink instance on a TTY; under bun test
  // process.stdout.isTTY is false, so these exercise the *disabled* paths —
  // which are exactly the ones that must never crash in odd environments.

  test('a theme without a scene never throws', () => {
    expect(() =>
      sceneController.syncPolicy({
        themeName: 'test-only-plain',
        reducedMotion: false,
      }),
    ).not.toThrow()
  })

  test('reduced motion always wins, scene or not', () => {
    registerScene('test-only-rainy', {
      kind: 'rain',
      params: {
        density: 0.33,
        speedMin: 0.3,
        speedMax: 1.2,
        trailMin: 6,
        trailMax: 26,
        mutateRate: 0.01,
      },
    })
    expect(() =>
      sceneController.syncPolicy({
        themeName: 'test-only-rainy',
        reducedMotion: true,
      }),
    ).not.toThrow()
  })

  test('stop() is idempotent', () => {
    sceneController.stop()
    expect(() => sceneController.stop()).not.toThrow()
  })
})

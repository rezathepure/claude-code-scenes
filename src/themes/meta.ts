/**
 * Where a theme came from and what it fundamentally is.
 *
 * Origin drives policy that colours alone cannot: `/theme delete` refuses
 * bundled and official themes (with different explanations), the grid picker
 * groups its bands by origin, and `/theme export` needs the true mode rather
 * than guessing it from the name (the old `name.includes('light')` heuristic
 * exported a dark theme called `moonlight` as light).
 *
 * Same shape as src/scene/registry.ts and maintained through the same choke
 * point (src/themes/register.ts): a theme is registered into palette, traits,
 * scene and meta together, and unregistered from all four together.
 */

import { THEME_NAMES } from '../utils/theme.js'

export type ThemeOrigin = 'builtin' | 'bundled' | 'cc' | 'official'

export type ThemeMeta = {
  origin: ThemeOrigin
  mode: 'dark' | 'light'
  description?: string
}

const META = new Map<string, ThemeMeta>()

export function setThemeMeta(name: string, meta: ThemeMeta): void {
  META.set(name, meta)
}

export function deleteThemeMeta(name: string): void {
  META.delete(name)
}

export function getThemeMeta(name: string): ThemeMeta | undefined {
  return META.get(name)
}

/**
 * Origin with sensible fallbacks: the six shipped names are always builtin,
 * anything else unregistered is treated as cc (ours) — the conservative
 * default for policy decisions.
 */
export function getThemeOrigin(name: string): ThemeOrigin {
  const meta = META.get(name)
  if (meta) return meta.origin
  return (THEME_NAMES as readonly string[]).includes(name) ? 'builtin' : 'cc'
}

/** Test seam. */
export function clearThemeMetaRegistry(): void {
  META.clear()
}

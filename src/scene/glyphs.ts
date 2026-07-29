/**
 * Named glyph alphabets a scene layer can draw from.
 *
 * Themes name a catalog; they never supply characters. That is the same rule
 * the two hardcoded models already followed (`types.ts`: "glyph alphabets are
 * fixed constants, never parameters") and it exists because ScenePass writes
 * every cell as width-1 without checking: one wide glyph desyncs the cell
 * buffer for the rest of the row. Sprites relax this — they carry drawn
 * characters — but they pay for it with an explicit code-point allow-list.
 *
 * Every glyph here is asserted width-1 by a test. Adding a catalog without
 * adding it to that test is not possible: the test iterates this map.
 */

/** Catalog name → the characters it draws from. */
const CATALOGS = new Map<string, string>([
  // The matrix alphabet, kept byte-identical so the rain preset is unchanged.
  ['katakana', 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789'],
  ['petals', '❀✿⁕·'],
  ['blocks', '█▓▒░▄▀▐▌'],
  ['binary', '01'],
  ['circuit', '─│┌┐└┘├┤┬┴┼╌╎╱╲'],
  ['rules', '─━═╌┄┈╍'],
  ['stars', '✦✧✩✪⋆∗·˙'],
  ['sparks', '·˙•∘○◦'],
  ['embers', '▴▵^*·'],
  ['snow', '❄❅❆*·˙'],
  ['web', '╱╲╳┼·'],
  ['waves', '~≈∽∿'],
  ['arrows', '↑↓←→↕↖↗↘'],
  ['geometric', '◆◇○●□■△▽'],
  ['ascii', '.:-=+*#%@'],
  // Dense and expressive, but blank in fonts without a Braille face. The
  // prompt says so; it is not a default.
  ['braille', '⠁⠂⠄⠈⠐⠠⡀⢀⠿⣿'],
])

/** Every catalog name, sorted — the enum offered to the model and the editor. */
export const GLYPH_CATALOG_NAMES: readonly string[] = [
  ...CATALOGS.keys(),
].sort()

/**
 * The characters of a catalog, or null when the name is unknown.
 *
 * A Map, not an object literal, deliberately: these names come from a model,
 * and `CATALOGS['__proto__']` on a literal is truthy.
 */
export function glyphCatalog(name: string): string | null {
  return CATALOGS.get(name) ?? null
}

/** Iterable view for the width-1 test. */
export function allGlyphCatalogs(): ReadonlyMap<string, string> {
  return CATALOGS
}

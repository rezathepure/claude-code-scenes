import { Box, type Color, Text } from '@anthropic/ink';
import * as React from 'react';
import { getSceneConfig } from '../../scene/registry.js';
import { getTheme } from '../../utils/theme.js';
import type { GridEntry } from './layout.js';
import { TILE_INNER_WIDTH, TILE_WIDTH } from './layout.js';
import { TileScene } from './TileScene.js';

/**
 * One theme preview tile, painted in ITS OWN palette while the app renders in
 * the current one.
 *
 * HARD RULES for everything inside a tile (verified against ThemedText /
 * ThemedBox resolution):
 *  - every colour is an explicit `rgb(...)` string from this tile's palette —
 *    raw values pass the resolver's prefix sniff, theme KEYS would resolve
 *    against the CURRENT theme and leak it into the tile;
 *  - never `<Text backgroundColor>` — that prop is theme-key-typed only;
 *  - never `dimColor` — it maps to the CURRENT theme's `inactive`.
 */
/**
 * Ring colours are chrome and deliberately FIXED, not taken from the tile's
 * palette. Every tile paints in its own colours, so a palette-derived focus
 * ring changed hue on every keypress — green on matrix, pink on sakura — and
 * read as noise rather than "you are here". One colour, everywhere, always.
 */
const FOCUS_PULSE = [
  'rgb(168,90,64)', // dim Claude Orange
  'rgb(215,119,87)', // Claude Orange #D77757
  'rgb(255,168,130)', // bright
  'rgb(215,119,87)',
] as const;
const FOCUS_PULSE_MS = 350;
/** Fixed green for the current theme's ring and checkmark, readable in both modes. */
const SELECTED_COLOR = 'rgb(46,160,67)';
/**
 * Fixed neutral for every resting tile. Taking this from the tile's palette
 * (t.subtle) gave each tile its own border colour — near-white on the ANSI
 * themes, amber on yellowish — and the one ring that MEANS something (the
 * selected green) disappeared in the crowd. Quiet on dark, visible on the
 * light-tile fill.
 */
const RESTING_BORDER = 'rgb(96,96,96)';

/**
 * Pulses the focus ring through the orange shades while active. Raw
 * setInterval like TileScene: the shared-clock useInterval is non-keepAlive,
 * and the picker idles with no spinner driving that clock.
 */
function useFocusPulse(active: boolean): string {
  const [frame, setFrame] = React.useState(1);
  React.useEffect(() => {
    if (!active) return;
    setFrame(1);
    const timer = setInterval(() => setFrame(f => (f + 1) % FOCUS_PULSE.length), FOCUS_PULSE_MS);
    return () => clearInterval(timer);
  }, [active]);
  return FOCUS_PULSE[frame] ?? FOCUS_PULSE[1];
}

/**
 * The scene name shown beside a theme, shortened to whatever the header line
 * has left.
 *
 * The name used to be the primitive's — always "rain" or "petals", always
 * short. A model-authored label can be sixteen columns, and the theme's own
 * name has first claim on the line: losing "cyberpunk-thunderstorm" to make
 * room for "neon drizzle" would be exactly backwards.
 */
function sceneChip(entry: GridEntry): string {
  const label = entry.sceneLabel ?? '';
  // "● " + name + " ✦ " + chip, inside the tile's inner width.
  const room = TILE_INNER_WIDTH - entry.label.length - 5;
  if (room >= label.length) return label;
  return room >= 4 ? `${label.slice(0, room - 1)}…` : '';
}

/**
 * A description shortened to the two rows the tile gives it.
 *
 * The Box clips anyway, but clipping alone stops mid-word with no sign that
 * anything was cut. Trimming to the last whole word and adding an ellipsis
 * reads as a summary rather than damage.
 */
function fitDescription(text: string): string {
  const room = TILE_INNER_WIDTH * 2;
  if (text.length <= room) return text;
  const cut = text.slice(0, room - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > room / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** The create tile's fixed chrome: Claude Orange on neutral greys. */
const CREATE_ACCENT = 'rgb(215,119,87)';
const CREATE_ACCENT_BRIGHT = 'rgb(255,168,130)';
const CREATE_TEXT = 'rgb(200,200,200)';
const CREATE_DIM = 'rgb(150,150,150)';

/**
 * The "design your own" promo tile. Deliberately the only resting tile with a
 * coloured (orange) border: the grid's other rings are grey/green chrome, so
 * this one reads as the invitation. When focused it behaves like any tile —
 * double border, pulsing ring.
 */
function CreateTile({
  focused,
  focusRing,
  width,
}: {
  focused: boolean;
  focusRing: string;
  /** Full grid width — the banner spans every column. */
  width: number;
}): React.ReactNode {
  return (
    <Box
      width={width}
      height={7}
      flexDirection="column"
      flexShrink={0}
      borderStyle={focused ? 'double' : 'round'}
      borderColor={(focused ? focusRing : CREATE_ACCENT) as Color}
      paddingX={0}
    >
      <Box height={1}>
        <Text wrap="truncate-end">
          <Text color={CREATE_ACCENT as Color} bold>
            ✦ Create your own
          </Text>
        </Text>
      </Box>
      <Box height={1}>
        <Text wrap="truncate-end">
          <Text color={CREATE_ACCENT_BRIGHT as Color} italic>
            “neon tokyo rainstorm”
          </Text>
          <Text color={CREATE_DIM as Color}> · </Text>
          <Text color={CREATE_ACCENT_BRIGHT as Color} italic>
            “a spider on a silk thread”
          </Text>
          <Text color={CREATE_DIM as Color}> · </Text>
          <Text color={CREATE_ACCENT_BRIGHT as Color} italic>
            “autumn library at dusk”
          </Text>
        </Text>
      </Box>
      <Box height={1}>
        <Text wrap="truncate-end">
          <Text color={CREATE_TEXT as Color}>
            Describe anything. Claude designs the palette and the animation to match.
          </Text>
        </Text>
      </Box>
      <Box height={1}>
        <Text color={CREATE_DIM as Color}>Enter to start</Text>
      </Box>
    </Box>
  );
}

function ThemeTileInner({
  entry,
  focused,
  selected,
  confirming,
  bannerWidth,
}: {
  entry: GridEntry;
  focused: boolean;
  selected: boolean;
  /** Set while `d` has been pressed on this tile; `blocked` explains a refusal. */
  confirming?: { blocked: string | null };
  /** Width for the full-width create banner; ignored by theme tiles. */
  bannerWidth?: number;
}): React.ReactNode {
  // Double assertion per house style: palette values are rgb() strings, which
  // satisfy Color at runtime via the resolver's raw-value passthrough.
  const t = getTheme(entry.paletteName) as unknown as Record<string, Color>;
  const focusRing = useFocusPulse(focused);

  if (entry.special === 'create') {
    return <CreateTile focused={focused} focusRing={focusRing} width={bannerWidth ?? TILE_WIDTH} />;
  }
  const sceneConfig = getSceneConfig(entry.paletteName);
  const scene = sceneConfig.kind === 'none' ? null : sceneConfig;

  return (
    <Box
      width={TILE_WIDTH}
      height={7}
      flexDirection="column"
      flexShrink={0}
      borderStyle={focused ? 'double' : 'round'}
      borderColor={(focused ? focusRing : selected ? SELECTED_COLOR : RESTING_BORDER) as Color}
      backgroundColor={entry.mode === 'light' ? 'rgb(245,245,245)' : undefined}
      paddingX={0}
    >
      <Box height={1}>
        <Text wrap="truncate-end">
          <Text color={t.claude} bold={focused}>
            ●{' '}
          </Text>
          {selected && (
            <Text color={SELECTED_COLOR as Color} bold>
              ✓{' '}
            </Text>
          )}
          <Text color={t.claude} bold={focused}>
            {entry.label}
          </Text>
          {entry.sceneLabel !== null && <Text color={t.claudeShimmer}> ✦ {sceneChip(entry)}</Text>}
        </Text>
      </Box>
      {confirming !== undefined ? (
        <DeleteConfirm entry={entry} blocked={confirming.blocked} palette={t} />
      ) : focused && scene !== null ? (
        <TileScene sceneConfig={scene} palette={t} width={TILE_INNER_WIDTH} height={4} />
      ) : (
        <>
          {/* Swatches first so every tile has something under its title —
              the built-ins carry no description, and two blank rows below a
              heading reads as a broken tile. Then the theme's own
              description, which is the one genuinely useful thing a tile can
              say. The mock session these replaced ("Read src/app.ts",
              "12k tokens") described work that was not happening and told you
              nothing about the theme. */}
          <Box height={1}>
            <Swatches palette={t} />
          </Box>
          {/* overflow=hidden: a long description wraps to three lines and
              would otherwise spill over the mode footer below it. */}
          <Box height={2} overflow="hidden">
            <Text wrap="wrap" color={t.inactive}>
              {entry.description === undefined ? '' : fitDescription(entry.description)}
            </Text>
          </Box>
          <Box height={1}>
            <Text color={t.inactive}>{entry.mode}</Text>
            {selected && <Text color={SELECTED_COLOR as Color}> · current</Text>}
          </Box>
        </>
      )}
    </Box>
  );
}

/**
 * The palette itself, in one row.
 *
 * Six slots chosen because they are what a theme is judged on: the signature
 * accent, its shimmer twin, the tool accent, and the three semantic states
 * that must stay tellable apart. Solid blocks rather than dots — a block
 * shows the colour, a dot shows mostly background.
 */
function Swatches({ palette }: { palette: Record<string, Color> }): React.ReactNode {
  const slots = ['claude', 'claudeShimmer', 'permission', 'success', 'warning', 'error'];
  return (
    <Text wrap="truncate-end">
      {slots.map(slot => (
        <Text key={slot} color={palette[slot]}>
          ███{' '}
        </Text>
      ))}
    </Text>
  );
}

/**
 * The confirmation, drawn inside the tile it is about.
 *
 * Deliberately in place rather than in a bar below the grid: the thing being
 * destroyed should be the thing you are looking at while you decide. A theme
 * that cannot be deleted says why instead of asking, so `d` always does
 * something explicable.
 */
function DeleteConfirm({
  entry,
  blocked,
  palette,
}: {
  entry: GridEntry;
  blocked: string | null;
  palette: Record<string, Color>;
}): React.ReactNode {
  if (blocked !== null) {
    return (
      <>
        <Box height={1}>
          <Text wrap="truncate-end" color={palette.warning}>
            Cannot delete
          </Text>
        </Box>
        <Box height={3}>
          {/* Wrapped, not truncated: a refusal that stops mid-sentence tells
              the user nothing about what to do instead. */}
          <Text wrap="wrap" color={palette.inactive}>
            {blocked}
          </Text>
        </Box>
      </>
    );
  }

  return (
    <>
      {/* The tile header directly above already shows the name; repeating it
          here only bought a second truncated copy of it. */}
      <Box height={1}>
        <Text wrap="truncate-end" color={palette.error}>
          Delete this theme?
        </Text>
      </Box>
      <Box height={1}>
        <Text wrap="truncate-end" color={palette.inactive}>
          Its file is removed.
        </Text>
      </Box>
      <Box height={1}>
        <Text wrap="truncate-end" color={palette.error}>
          d
        </Text>
        <Text wrap="truncate-end" color={palette.inactive}>
          {' '}
          again to delete
        </Text>
      </Box>
      <Box height={1}>
        <Text wrap="truncate-end" color={palette.inactive}>
          Esc to keep it
        </Text>
      </Box>
    </>
  );
}

export const ThemeTile = React.memo(ThemeTileInner);

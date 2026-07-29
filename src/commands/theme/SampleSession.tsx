import { Box, Text } from '@anthropic/ink';
import * as React from 'react';
import { StructuredDiff } from '../../components/StructuredDiff.js';
import { BLACK_CIRCLE } from '../../constants/figures.js';

/**
 * A scripted Claude Code session, rendered in the theme being designed.
 *
 * The review used to show three lines of diff, which lit up almost none of the
 * palette the model had just authored — you could not tell whether errors were
 * distinguishable from warnings, or whether tool output receded far enough to
 * read past. This exercises the slots a session actually spends its time in.
 *
 * The copy does a second job. Every line is about theme work, and the two that
 * never drop are the ones that teach how to phrase a refinement: name a slot or
 * an element, change one thing at a time. Someone reading the preview to judge
 * the colours learns the vocabulary without being taught it separately.
 *
 * This renders in the app's own theme — the draft is previewed app-wide while
 * the creator is open — so ordinary theme keys are correct here. The raw-rgb
 * HARD RULES in ThemeGrid/ThemeTile.tsx apply only where a component paints a
 * theme OTHER than the one the app is wearing.
 *
 * Three things are deliberately absent. Fenced code blocks: `cli-highlight`
 * has its own palette and would demonstrate nothing. Spinners and tool-use
 * loaders: they run animation clocks, which makes the whole component
 * untestable through renderToString. And any pretend work — the mock session
 * that once filled the picker tiles ("Read src/app.ts", "12k tokens") was
 * removed because it described work that was not happening, and this must not
 * quietly bring it back.
 */

export type SampleLine = {
  id: string;
  /** Slots this line exists to show. Asserted against the live palette. */
  slots: readonly string[];
  /** Rows it occupies. The renderer clips to this, so the budget is exact. */
  rows: number;
  /**
   * Higher survives longer. Lines sharing a tier drop together — the failing
   * Bash call and its reason are nonsense apart.
   */
  priority: number;
  render: (ctx: { width: number; skipHighlighting: boolean }) => React.ReactNode;
};

/** The edit the scripted session makes. Real work on a real theme. */
const SAMPLE_PATCH = {
  oldStart: 1,
  newStart: 1,
  oldLines: 3,
  newLines: 3,
  lines: [
    "  export const error = 'rgb(190,60,60)'",
    "- export const warning = 'rgb(190,90,60)'",
    "+ export const warning = 'rgb(230,160,60)'",
  ],
};

/** Inline code, coloured exactly as `src/utils/markdown.ts` colours backticks. */
function Code({ children }: { children: string }): React.ReactNode {
  return <Text color="permission">{children}</Text>;
}

/** The `⎿` gutter, matching messages/MessageResponse.tsx. */
function Gutter({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <Text wrap="truncate-end">
      <Text dimColor>{'  ⎿  '}</Text>
      {children}
    </Text>
  );
}

export const SAMPLE_LINES: readonly SampleLine[] = [
  {
    id: 'prompt',
    slots: ['subtle', 'text'],
    rows: 1,
    priority: 10,
    render: () => (
      <Text wrap="truncate-end">
        <Text color="subtle">❯ </Text>
        <Text color="text">make errors louder and tool output quieter</Text>
      </Text>
    ),
  },
  {
    id: 'teach-slots',
    slots: ['text', 'permission'],
    rows: 2,
    priority: 10,
    render: () => (
      <Text wrap="wrap">
        <Text color="text">{BLACK_CIRCLE} </Text>
        Name a <Text bold>slot</Text> or an element, not a mood — <Code>error</Code>, <Code>subtle</Code>, “the diff”.
        Moods design a theme; slots refine one.
      </Text>
    ),
  },
  {
    id: 'edit',
    slots: ['success'],
    rows: 1,
    priority: 9,
    render: () => (
      <Text wrap="truncate-end">
        <Text color="success">{BLACK_CIRCLE} </Text>
        <Text bold>Update</Text>(theme.ts)
      </Text>
    ),
  },
  {
    id: 'diff',
    slots: ['diffAdded', 'diffRemoved'],
    rows: 3,
    priority: 9,
    render: ({ width, skipHighlighting }) => (
      <StructuredDiff
        patch={SAMPLE_PATCH}
        dim={false}
        filePath="theme.ts"
        firstLine={null}
        width={width}
        skipHighlighting={skipHighlighting}
      />
    ),
  },
  {
    id: 'edit-result',
    slots: ['inactive', 'diffAddedWord', 'diffRemovedWord'],
    rows: 1,
    priority: 8,
    render: () => (
      <Gutter>
        <Text dimColor>Updated theme.ts with </Text>
        <Text color="diffAddedWord">1 addition</Text>
        <Text dimColor> and </Text>
        <Text color="diffRemovedWord">1 removal</Text>
      </Gutter>
    ),
  },
  {
    id: 'check',
    slots: ['error'],
    rows: 1,
    priority: 7,
    render: () => (
      <Text wrap="truncate-end">
        <Text color="error">{BLACK_CIRCLE} </Text>
        <Text bold>Bash</Text>(bun run precheck)
      </Text>
    ),
  },
  {
    id: 'check-result',
    slots: ['inactive', 'error', 'permission'],
    rows: 1,
    priority: 7,
    render: () => (
      <Gutter>
        <Text color="error">Error: </Text>
        <Code>error</Code>
        <Text dimColor> and </Text>
        <Code>warning</Code>
        <Text dimColor> read the same</Text>
      </Gutter>
    ),
  },
  {
    id: 'contrast',
    slots: ['warning', 'permission'],
    rows: 1,
    priority: 6,
    render: () => (
      <Text wrap="truncate-end">
        {'     '}
        <Text color="warning">Warning: </Text>
        <Code>subtle</Code>
        <Text dimColor> is under 4.5:1 — say “lift the subtle text”</Text>
      </Text>
    ),
  },
  {
    id: 'bash',
    slots: ['bashBorder', 'text'],
    rows: 1,
    priority: 5,
    render: () => (
      <Text wrap="truncate-end">
        <Text color="bashBorder">! </Text>
        <Text color="text">cat ~/.claude/cct/{'{name}'}.json</Text>
      </Text>
    ),
  },
  {
    id: 'teach-scope',
    slots: ['suggestion'],
    rows: 1,
    priority: 4,
    render: () => (
      <Text wrap="truncate-end" color="suggestion">
        {'  '}⧉ One change at a time — everything you don’t mention is kept.
      </Text>
    ),
  },
  {
    id: 'memory',
    slots: ['remember', 'memoryBackgroundColor', 'text'],
    rows: 1,
    priority: 3,
    render: () => (
      <Text wrap="truncate-end">
        <Text color="remember" backgroundColor="memoryBackgroundColor">
          #
        </Text>
        <Text backgroundColor="memoryBackgroundColor" color="text">
          {' '}
          keep contrast high — I read this in daylight{' '}
        </Text>
      </Text>
    ),
  },
  {
    id: 'background',
    slots: ['background'],
    rows: 1,
    priority: 2,
    render: () => (
      <Text wrap="truncate-end" color="background">
        {'  '}2 background tasks
      </Text>
    ),
  },
];

/**
 * The lines that fit, in script order.
 *
 * Whole priority tiers are kept or dropped, which is what pairs the failing
 * Bash call with its reason. Stopping at the first tier that does not fit
 * (rather than skipping to a cheaper one) keeps the result monotonic in the
 * budget: growing the terminal can only ever add lines.
 */
export function sampleLinesForRows(budget: number): SampleLine[] {
  const tiers = [...new Set(SAMPLE_LINES.map(l => l.priority))].sort((a, b) => b - a);
  const kept = new Set<number>();
  let used = 0;
  for (const tier of tiers) {
    const cost = SAMPLE_LINES.filter(l => l.priority === tier).reduce((n, l) => n + l.rows, 0);
    if (used + cost > budget) break;
    used += cost;
    kept.add(tier);
  }
  return SAMPLE_LINES.filter(l => kept.has(l.priority));
}

export function SampleSession({
  width,
  rows,
  skipHighlighting,
}: {
  width: number;
  rows: number;
  /** The user's real syntax-highlighting setting, so the diff is not a lie. */
  skipHighlighting: boolean;
}): React.ReactNode {
  const lines = sampleLinesForRows(rows);
  return (
    <Box flexDirection="column">
      {lines.map(line => (
        // Fixed width AND height per line: the width makes wrapping match what
        // the row counts assume, and the height makes the budget exact rather
        // than a guess about how the terminal will wrap.
        <Box key={line.id} width={width} height={line.rows} overflow="hidden" flexShrink={0}>
          {line.render({ width, skipHighlighting })}
        </Box>
      ))}
    </Box>
  );
}

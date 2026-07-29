import { Box, Text, usePreviewTheme, useTheme, useThemeSetting } from '@anthropic/ink';
import * as React from 'react';
import { Select } from '../../components/CustomSelect/index.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { StructuredDiff } from '../../components/StructuredDiff.js';
import { Spinner } from '../../components/Spinner.js';
import { canvasThemeFor } from '../../themes/canvas.js';
import { generateTheme } from '../../themes/generate/generate.js';
import { registerThemeWithTraits, unregisterThemeWithTraits } from '../../themes/register.js';
import { findAvailableThemeName, saveGeneratedTheme } from '../../themes/save.js';
import type { ThemeWarning } from '../../themes/schema.js';
import { sceneLabelOf } from '../../scene/label.js';
import type { SceneConfig } from '../../scene/types.js';
import type { Theme } from '../../utils/theme.js';
import { themeNameFromDescription } from './parseArgs.js';

type Props = {
  description: string;
  onDone: (result?: string) => void;
};

type Phase =
  | { kind: 'generating' }
  | {
      kind: 'review';
      name: string;
      mode: 'dark' | 'light';
      themeDescription?: string;
      colors: Record<string, string>;
      scene?: SceneConfig;
      authoredSlotCount: number;
      warnings: ThemeWarning[];
    }
  | { kind: 'failed'; error: string };

/** Sample shown under the preview, so the theme is judged on real output. */
const SAMPLE_PATCH = {
  oldStart: 1,
  newStart: 1,
  oldLines: 3,
  newLines: 3,
  lines: ['  const theme = load()', '- return theme.dark', '+ return theme.resolved'],
};

/**
 * Generates a theme, applies it live for review, and keeps it only if the user
 * says so.
 *
 * The theme is registered and previewed *before* being written to disk. A
 * palette cannot be judged from hex values — it has to be seen — and writing
 * first would litter ~/.claude/themes with rejected attempts.
 */
export function ThemeCreator({ description, onDone }: Props): React.ReactNode {
  const [phase, setPhase] = React.useState<Phase>({ kind: 'generating' });
  const { columns } = useTerminalSize();
  const [, setTheme] = useTheme();
  const themeSetting = useThemeSetting();
  const { setPreviewTheme, savePreview, cancelPreview } = usePreviewTheme();

  // Resolved once, at mount: the canvas describes the theme you arrived with,
  // and recomputing it after `keep` (which changes themeSetting) would put a
  // moving value in the generation effect's deps.
  const [canvas] = React.useState(() => canvasThemeFor(themeSetting));

  // ThemeProvider builds its context value with useMemo(..., [previewTheme,
  // …]), so every one of these functions gets a fresh identity each time the
  // preview changes. An effect that both depends on setPreviewTheme AND calls
  // it re-runs itself: the generation effect previewed its own result and was
  // immediately torn down and restarted, spending a second design call on
  // every attempt. Reading them through a ref keeps the effect keyed to the
  // things that actually change what gets generated.
  const previewRef = React.useRef({ setPreviewTheme, cancelPreview });
  previewRef.current = { setPreviewTheme, cancelPreview };

  // Name is chosen once so retries and the final save agree.
  const nameRef = React.useRef<string | null>(null);

  // Set once the user says keep, so the unmount cleanup below leaves the
  // preview alone — by then it is a choice rather than a preview.
  const keptRef = React.useRef(false);

  React.useEffect(
    () => () => {
      // Anything that unmounts this panel without a decision — Esc, another
      // command taking the slot — would otherwise leave the app wearing the
      // canvas or a half-judged attempt. Neither is what the user chose.
      if (!keptRef.current) previewRef.current.cancelPreview();
    },
    [],
  );

  // Bumped to ask for another attempt. Each generation is independent, so a
  // retry is a fresh design rather than a refinement of the last one.
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    // Design on the canvas, not on the theme being replaced. "Designing a
    // theme for cyberpunk…" over matrix's rain reads as though it is already
    // done; against a neutral palette the reveal actually lands.
    previewRef.current.setPreviewTheme(canvas);

    void (async () => {
      const name = nameRef.current ?? findAvailableThemeName(themeNameFromDescription(description));
      nameRef.current = name;

      const result = await generateTheme({ vibe: description, name }, controller.signal);
      if (cancelled) return;

      if (!result.ok) {
        setPhase({ kind: 'failed', error: result.error });
        return;
      }

      // Register and preview so the user sees the theme rather than a list of
      // numbers — scene included, so in fullscreen the backdrop animates
      // during review too. Unregistered again if they decline.
      registerThemeWithTraits(name, result.colors as unknown as Theme, result.mode, result.scene);
      previewRef.current.setPreviewTheme(name);

      setPhase({
        kind: 'review',
        name,
        mode: result.mode,
        themeDescription: result.description,
        colors: result.colors,
        ...(result.scene !== undefined ? { scene: result.scene } : {}),
        authoredSlotCount: result.authoredSlotCount,
        warnings: result.warnings,
      });
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [description, attempt, canvas]);

  if (phase.kind === 'generating') {
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1}>
          <Spinner />
          <Text>Designing a theme for “{description}”…</Text>
        </Box>
        <Text dimColor>This takes a few seconds.</Text>
      </Box>
    );
  }

  if (phase.kind === 'failed') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="error">Could not create a theme.</Text>
        <Text dimColor>{phase.error}</Text>
      </Box>
    );
  }

  const repairs = phase.warnings.filter(w => w.message.includes('brightened'));
  const problems = phase.warnings.filter(w => w.severity === 'error');

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text bold color="claude">
          {phase.name}
          {sceneLabelOf(phase.scene) !== null && <Text color="claudeShimmer"> ✦ {sceneLabelOf(phase.scene)}</Text>}
        </Text>
        {phase.themeDescription !== undefined && <Text dimColor>{phase.themeDescription}</Text>}
      </Box>

      <Box flexDirection="column">
        <StructuredDiff patch={SAMPLE_PATCH} dim={false} filePath="demo.ts" firstLine={null} width={columns} />
      </Box>

      <Box flexDirection="column">
        <Text dimColor>
          {phase.authoredSlotCount} colours chosen; the rest inherit from the built-in {phase.mode} theme.
        </Text>
        {repairs.length > 0 && (
          <Text dimColor>
            {repairs.length} colour{repairs.length === 1 ? ' was' : 's were'} brightened to stay readable.
          </Text>
        )}
        {problems.map(w => (
          <Text key={w.message} color="warning">
            {w.message}
          </Text>
        ))}
      </Box>

      <Select
        options={[
          { label: 'Keep this theme', value: 'keep' },
          { label: 'Try again', value: 'retry' },
          { label: 'Discard it', value: 'discard' },
        ]}
        onChange={(choice: string) => {
          if (choice === 'retry') {
            // Drop the rejected attempt before asking for another, so the
            // preview does not keep showing a theme that no longer exists.
            cancelPreview();
            unregisterThemeWithTraits(phase.name);
            setPhase({ kind: 'generating' });
            setAttempt(n => n + 1);
            return;
          }
          if (choice === 'keep') {
            keptRef.current = true;
            void (async () => {
              const saved = await saveGeneratedTheme(phase.name, {
                mode: phase.mode,
                description: phase.themeDescription,
                colors: phase.colors,
                ...(phase.scene !== undefined ? { scene: phase.scene } : {}),
              });
              savePreview();
              setTheme(phase.name);
              onDone(
                saved.ok
                  ? `Theme “${phase.name}” saved to ${saved.path} and applied. Edit that file to fine-tune it.`
                  : `Theme “${phase.name}” applied, but could not be saved: ${saved.error}`,
              );
            })();
          } else {
            cancelPreview();
            unregisterThemeWithTraits(phase.name);
            onDone('Theme discarded.');
          }
        }}
      />
    </Box>
  );
}

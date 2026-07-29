import { Box, Text, usePreviewTheme, useTheme, useThemeSetting } from '@anthropic/ink';
import * as React from 'react';
import { Select } from '../../components/CustomSelect/index.js';
import { useModalOrTerminalSize } from '../../context/modalContext.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Spinner } from '../../components/Spinner.js';
import { useAppState } from '../../state/AppState.js';
import { canvasThemeFor } from '../../themes/canvas.js';
import { generateTheme } from '../../themes/generate/generate.js';
import { registerThemeWithTraits, unregisterThemeWithTraits } from '../../themes/register.js';
import { findAvailableThemeName, saveGeneratedTheme } from '../../themes/save.js';
import type { ThemeWarning } from '../../themes/schema.js';
import { sceneLabelOf } from '../../scene/label.js';
import type { SceneConfig } from '../../scene/types.js';
import type { Theme } from '../../utils/theme.js';
import { themeNameFromDescription } from './parseArgs.js';
import { SampleSession } from './SampleSession.js';

type Props = {
  description: string;
  onDone: (result?: string) => void;
};

/**
 * Rows the review spends on everything that is not the sample: the theme name,
 * its description, the slot count, the three-option menu, the diff caveat and
 * the gaps between them. Warnings are counted separately, at the call site.
 */
const CHROME_ROWS = 11;

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
  // The modal slot, not the terminal. In fullscreen a local-jsx panel gets
  // `columns - 4`, and Pane adds a further paddingX=1 each side — a sample
  // rendered at raw terminal width overran the frame by six columns.
  const modal = useModalOrTerminalSize(useTerminalSize());
  const width = Math.max(24, modal.columns - 2);
  const syntaxHighlightingDisabled = useAppState(s => s.settings.syntaxHighlightingDisabled) ?? false;
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

  // The name currently in the theme registry, or null. Distinct from nameRef,
  // which is claimed before generation and survives a retry.
  const registeredRef = React.useRef<string | null>(null);

  /**
   * Drops the preview and any draft we put in the registry. Idempotent.
   *
   * The unregister half used to be missing from every path except an explicit
   * Discard, so a draft abandoned any other way stayed in the registry and
   * showed up as a real theme in the picker — one that had never been written
   * to disk and would vanish on restart.
   */
  const releaseDraft = React.useCallback(() => {
    previewRef.current.cancelPreview();
    if (registeredRef.current !== null) {
      unregisterThemeWithTraits(registeredRef.current);
      registeredRef.current = null;
    }
  }, []);

  React.useEffect(
    () => () => {
      // Anything that unmounts this panel without a decision — Esc, another
      // command taking the slot — would otherwise leave the app wearing the
      // canvas or a half-judged attempt. Neither is what the user chose.
      if (!keptRef.current) releaseDraft();
    },
    [releaseDraft],
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
      registeredRef.current = name;
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

  const giveUp = (): void => {
    releaseDraft();
    onDone('No theme created.');
  };

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
        {/* Without these there is no way out at all: the panel binds no Esc of
            its own, and the REPL's chat:cancel is gated off while a local-jsx
            panel is mounted. A failed generation stranded the user on this
            screen until Ctrl+C. */}
        <Select
          options={[
            { label: 'Try again', value: 'retry' },
            { label: 'Give up', value: 'discard' },
          ]}
          onCancel={giveUp}
          onChange={(choice: string) => {
            if (choice === 'retry') {
              setPhase({ kind: 'generating' });
              setAttempt(n => n + 1);
              return;
            }
            giveUp();
          }}
        />
        <Text dimColor italic>
          Enter to choose · Esc to close
        </Text>
      </Box>
    );
  }

  const repairs = phase.warnings.filter(w => w.message.includes('brightened'));
  const problems = phase.warnings.filter(w => w.severity === 'error');

  // Rows left for the sample once everything else has taken theirs. Warnings
  // are counted rather than assumed: the modal clips at the bottom, so a theme
  // that came back with four complaints would otherwise push the menu off the
  // screen and strand the user with nothing to press.
  const sampleRows = Math.max(0, modal.rows - CHROME_ROWS - problems.length - (repairs.length > 0 ? 1 : 0));

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
        <SampleSession width={width} rows={sampleRows} skipHighlighting={syntaxHighlightingDisabled} />
        {/* The napi diff renderer picks its fills from the theme's traits, not
            its slots, so with highlighting on "make the added lines greener"
            does nothing and there is no way to tell why. */}
        {!syntaxHighlightingDisabled && (
          <Text dimColor italic>
            Diff fills come from your syntax palette; the theme’s own diff colours apply with highlighting off.
          </Text>
        )}
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
            releaseDraft();
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
            releaseDraft();
            onDone('Theme discarded.');
          }
        }}
      />
    </Box>
  );
}

import { Box, Text, usePreviewTheme, useTheme, useThemeSetting } from '@anthropic/ink';
import * as React from 'react';
import { Select } from '../../components/CustomSelect/index.js';
import { Spinner } from '../../components/Spinner.js';
import { useModalOrTerminalSize } from '../../context/modalContext.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import { sceneLabelOf } from '../../scene/label.js';
import { sceneController } from '../../scene/controller.js';
import { useAppState } from '../../state/AppState.js';
import { canvasThemeFor } from '../../themes/canvas.js';
import { generateTheme } from '../../themes/generate/generate.js';
import { refineTheme, type ThemeDraft } from '../../themes/generate/refine.js';
import { registerThemeWithTraits, unregisterThemeWithTraits } from '../../themes/register.js';
import { findAvailableThemeName, saveGeneratedTheme } from '../../themes/save.js';
import { isFullscreenActive } from '../../utils/fullscreen.js';
import type { Theme } from '../../utils/theme.js';
import { BackdropPreview } from './BackdropPreview.js';
import { canUndo, creatorReducer, currentDraft, initialCreatorState, type Stage } from './creatorState.js';
import { themeNameFromDescription } from './parseArgs.js';
import { SampleSession } from './SampleSession.js';

type Props = {
  description: string;
  onDone: (result?: string) => void;
};

/**
 * Rows the review spends on everything that is not the preview: the theme name
 * and description, the change line, the refine input, the menu, the footer hint
 * and the gaps between them. Warnings are counted separately, at the call site.
 */
const CHROME_ROWS = 13;

/**
 * Designs a theme, applies it live, and lets the user talk it into shape.
 *
 * The theme is registered and previewed *before* being written to disk — a
 * palette cannot be judged from hex values, it has to be seen — and every
 * refinement re-registers under the SAME name, which is what makes the whole
 * app repaint around the change. (That only works because ThemeProvider folds
 * the registry version into its context value; before that fix a same-name
 * re-registration was invisible.)
 *
 * All the state bookkeeping lives in creatorState.ts. What is left here is the
 * things a reducer cannot own: the model calls, the registry, and the preview.
 */
export function ThemeCreator({ description, onDone }: Props): React.ReactNode {
  const [state, dispatch] = React.useReducer(creatorReducer, initialCreatorState);
  const modal = useModalOrTerminalSize(useTerminalSize());
  // The modal slot, not the terminal. In fullscreen a local-jsx panel gets
  // `columns - 4`, and Pane adds a further paddingX=1 each side — a sample
  // rendered at raw terminal width overran the frame by six columns.
  const width = Math.max(24, modal.columns - 2);
  const [, setTheme] = useTheme();
  const themeSetting = useThemeSetting();
  const { setPreviewTheme, savePreview, cancelPreview } = usePreviewTheme();
  const syntaxHighlightingDisabled = useAppState(s => s.settings.syntaxHighlightingDisabled) ?? false;

  // Resolved once, at mount: the canvas describes the theme you arrived with,
  // and recomputing it after `keep` (which changes themeSetting) would put a
  // moving value in the generation effect's deps.
  const [canvas] = React.useState(() => canvasThemeFor(themeSetting));

  // ThemeProvider builds its context value with useMemo(..., [previewTheme,
  // registryVersion, …]), so every one of these functions gets a fresh
  // identity each time the preview OR the registry changes — and refining does
  // both, several times. An effect that depended on them AND called them would
  // re-run itself; the generation effect used to, and spent a second design
  // call on every attempt. Reading them through a ref keeps effects keyed to
  // the things that actually change what gets generated.
  const previewRef = React.useRef({ setPreviewTheme, cancelPreview });
  previewRef.current = { setPreviewTheme, cancelPreview };

  // Name is chosen once so retries, refinements and the final save agree.
  const nameRef = React.useRef<string | null>(null);
  // Set once the user says keep, so the unmount cleanup leaves the preview
  // alone — by then it is a choice rather than a preview.
  const keptRef = React.useRef(false);
  // The name currently in the theme registry, or null.
  const registeredRef = React.useRef<string | null>(null);
  // The refinement in flight, so Esc and the next request can abort it.
  const refineAbortRef = React.useRef<AbortController | null>(null);
  // The refine box's live text. Deliberately not state: Select's input option
  // fires onChange per keystroke, and re-rendering the animation, the sample
  // and the diff on every character would make typing crawl.
  const instructionRef = React.useRef('');

  const draft = currentDraft(state);
  const busy = state.phase.kind === 'refining';

  /**
   * Puts a draft on screen. The only place the registry is written.
   *
   * One key for the whole session — refinements replace it, they never mint a
   * new name — so there is never a stray draft theme to clean up.
   */
  const applyDraft = React.useCallback((next: ThemeDraft) => {
    registerThemeWithTraits(next.name, next.colors as unknown as Theme, next.mode, next.scene);
    registeredRef.current = next.name;
    previewRef.current.setPreviewTheme(next.name);
    // SceneBridge syncs on the theme NAME, which has not changed — without
    // this the full-screen backdrop keeps animating the previous scene against
    // the previous palette.
    sceneController.refresh();
  }, []);

  /** Drops the preview and any draft we put in the registry. Idempotent. */
  const releaseDraft = React.useCallback(() => {
    refineAbortRef.current?.abort();
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
      // canvas or a half-judged attempt, and a theme in the picker that was
      // never written to disk.
      if (!keptRef.current) releaseDraft();
    },
    [releaseDraft],
  );

  // Bumped to ask for another design from scratch.
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
        dispatch({ type: 'generateFailed', error: result.error });
        return;
      }

      const next: ThemeDraft = {
        name,
        mode: result.mode,
        colors: result.colors,
        warnings: result.warnings,
        ...(result.description !== undefined ? { description: result.description } : {}),
        ...(result.scene !== undefined ? { scene: result.scene } : {}),
      };
      applyDraft(next);
      dispatch({ type: 'generated', draft: next });
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [description, attempt, canvas, applyDraft]);

  /**
   * Esc while a change is in flight abandons the change, not the theme.
   *
   * It needs its own binding because the Select is disabled while busy, so its
   * own `select:cancel` is unregistered — which leaves exactly one owner for
   * the key in this phase, the way every phase here has exactly one. It also
   * has to dispatch the cancellation itself: the in-flight handler bails out
   * on an aborted signal without touching state, by design.
   */
  const cancelRefinement = (): void => {
    refineAbortRef.current?.abort();
    refineAbortRef.current = null;
    dispatch({ type: 'refineCancelled' });
  };
  useKeybinding('select:cancel', cancelRefinement, { context: 'Select', isActive: busy });

  const submitRefinement = (instruction: string): void => {
    const trimmed = instruction.trim();
    const from = currentDraft(state);
    if (trimmed === '' || from === null) return;

    refineAbortRef.current?.abort();
    const controller = new AbortController();
    refineAbortRef.current = controller;
    instructionRef.current = '';
    dispatch({ type: 'refineStarted', instruction: trimmed });

    void (async () => {
      const result = await refineTheme(
        {
          draft: from,
          instruction: trimmed,
          history: state.instructions,
          stage: stageOf(state) === 'backdrop' ? 'backdrop' : 'palette',
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;

      if (!result.ok) {
        // An abort surfaces as a cancellation, not a failure — the user asked
        // for it and the draft is untouched.
        dispatch(
          result.error === 'Cancelled.' ? { type: 'refineCancelled' } : { type: 'refineFailed', error: result.error },
        );
        return;
      }
      if (result.change.noop) {
        dispatch({ type: 'refineNoop', change: result.change });
        return;
      }
      applyDraft(result.draft);
      dispatch({ type: 'refined', draft: result.draft, change: result.change });
    })();
  };

  const keep = (): void => {
    if (draft === null) return;
    keptRef.current = true;
    void (async () => {
      const saved = await saveGeneratedTheme(draft.name, {
        mode: draft.mode,
        description: draft.description,
        colors: draft.colors,
        ...(draft.scene !== undefined ? { scene: draft.scene } : {}),
      });
      savePreview();
      setTheme(draft.name);
      onDone(
        saved.ok
          ? `Theme “${draft.name}” saved to ${saved.path} and applied. Edit that file to fine-tune it.`
          : `Theme “${draft.name}” applied, but could not be saved: ${saved.error}`,
      );
    })();
  };

  const discard = (): void => {
    releaseDraft();
    onDone(draft === null ? 'No theme created.' : 'Theme discarded.');
  };

  if (state.phase.kind === 'generating') {
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

  if (state.phase.kind === 'failed') {
    const recoverable = state.phase.from === 'refine' && draft !== null;
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="error">{recoverable ? 'That change did not go through.' : 'Could not create a theme.'}</Text>
        <Text dimColor>{state.phase.error}</Text>
        {recoverable && <Text dimColor>Your theme is untouched.</Text>}
        {/* Without these there is no way out at all: the panel binds no Esc of
            its own, and the REPL's chat:cancel is gated off while a local-jsx
            panel is mounted. A failed generation stranded the user here. */}
        <Select
          options={[
            { label: recoverable ? 'Back to the theme' : 'Try again', value: 'retry' },
            { label: recoverable ? 'Discard the theme' : 'Give up', value: 'discard' },
          ]}
          onCancel={discard}
          onChange={(choice: string) => {
            if (choice !== 'retry') {
              discard();
              return;
            }
            dispatch({ type: 'retry' });
            if (!recoverable) setAttempt(n => n + 1);
          }}
        />
        <Text dimColor italic>
          Enter to choose · Esc to close
        </Text>
      </Box>
    );
  }

  if (draft === null) return null;

  const stage = stageOf(state);
  const problems = draft.warnings.filter(w => w.severity === 'error');
  // Rows left for the preview once everything else has taken theirs. Warnings
  // are counted rather than assumed: the modal clips at the bottom, so a theme
  // that came back with four complaints would otherwise push the menu off the
  // screen and strand the user with nothing to press.
  const bodyRows = Math.max(3, modal.rows - CHROME_ROWS - problems.length);

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text bold color="claude">
          {draft.name}
          {sceneLabelOf(draft.scene) !== null && <Text color="claudeShimmer"> ✦ {sceneLabelOf(draft.scene)}</Text>}
        </Text>
        {draft.description !== undefined && <Text dimColor>{draft.description}</Text>}
      </Box>

      <Box flexDirection="column">
        {stage === 'backdrop' ? (
          <BackdropPreview
            themeName={draft.name}
            scene={draft.scene}
            width={width}
            height={Math.min(12, Math.max(4, bodyRows - 3))}
            fullscreen={isFullscreenActive()}
          />
        ) : (
          <>
            <SampleSession width={width} rows={bodyRows} skipHighlighting={syntaxHighlightingDisabled} />
            {/* The napi diff renderer picks its fills from the theme's traits,
                not its slots, so with highlighting on "make the added lines
                greener" does nothing and there is no way to tell why. */}
            {!syntaxHighlightingDisabled && (
              <Text dimColor italic>
                Diff fills come from your syntax palette; the theme’s own diff colours apply with highlighting off.
              </Text>
            )}
          </>
        )}
      </Box>

      <Box flexDirection="column">
        <ChangeLine state={state} busy={busy} />
        {problems.map(w => (
          <Text key={w.message} color="warning">
            {w.message}
          </Text>
        ))}
      </Box>

      <Select
        // Remounted per stage so the placeholder matches what you are looking
        // at, and per landed draft so the box empties once your instruction has
        // been applied. Without the draft half, submitRefinement cleared its
        // own ref but the text stayed on screen — so the box read as though it
        // still held an instruction that had in fact already been used, and
        // pressing Enter again did nothing.
        //
        // drafts only grows on 'refined' and shrinks on 'undo', never on
        // 'refineStarted', so this cannot remount mid-request. A refinement
        // that failed or changed nothing deliberately keeps your text, which
        // is what you want to edit and retry.
        key={`${stage}:${state.drafts.length}`}
        isDisabled={busy}
        hideIndexes
        defaultFocusValue="refine"
        visibleOptionCount={5}
        onCancel={discard}
        options={[
          {
            type: 'input' as const,
            value: 'refine',
            label: 'Change',
            placeholder:
              stage === 'backdrop'
                ? 'slower · add drifting embers · sparser · brighter'
                : 'louder errors · calmer warnings · quieter tool output',
            // Empty Enter would otherwise reach onCancel and DISCARD the
            // theme. With this it reaches onChange, where we no-op.
            allowEmptySubmitToCancel: true,
            onChange: (value: string) => {
              instructionRef.current = value;
            },
          },
          stage === 'backdrop'
            ? { value: 'text', label: 'Text colours →' }
            : { value: 'backdrop', label: '← Backdrop' },
          ...(canUndo(state) ? [{ value: 'undo', label: `Undo “${lastInstruction(state)}”` }] : []),
          { value: 'keep', label: 'Keep this theme' },
          { value: 'discard', label: 'Discard' },
        ]}
        onChange={(choice: string) => {
          switch (choice) {
            case 'refine':
              submitRefinement(instructionRef.current);
              return;
            case 'text':
            case 'backdrop':
              dispatch({ type: 'gotoStage', stage: choice });
              return;
            case 'undo': {
              const previous = state.drafts[state.drafts.length - 2];
              if (previous !== undefined) applyDraft(previous);
              dispatch({ type: 'undo' });
              return;
            }
            case 'keep':
              keep();
              return;
            default:
              discard();
          }
        }}
      />

      <Text dimColor italic>
        {busy ? 'Esc to cancel this change' : 'Describe a change and press Enter · ↑↓ to choose · Esc to discard'}
      </Text>
    </Box>
  );
}

function stageOf(state: { phase: { kind: string; stage?: Stage } }): Stage {
  return state.phase.stage ?? 'backdrop';
}

/** The most recent instruction that actually landed. */
function lastInstruction(state: { instructions: string[] }): string {
  const text = state.instructions[state.instructions.length - 1] ?? 'that';
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}

/**
 * One line about what just happened.
 *
 * Naming the slots that moved is what makes an unbounded refinement safe: the
 * model may touch as much as it judges necessary, and the user always sees how
 * much that was, with undo one row below.
 */
function ChangeLine({
  state,
  busy,
}: {
  state: { lastChange: import('../../themes/generate/refine.js').RefineChange | null };
  busy: boolean;
}): React.ReactNode {
  if (busy) {
    return (
      <Box flexDirection="row" gap={1}>
        <Spinner />
        <Text dimColor>Making that change…</Text>
      </Box>
    );
  }

  const change = state.lastChange;
  if (change === null) return <Text> </Text>;

  if (change.noop) {
    return (
      <Text color="warning" wrap="truncate-end">
        Nothing changed. Try naming a slot or an element — “error”, “subtle”, “the diff”.
      </Text>
    );
  }

  const parts = [
    ...(change.sceneChanged ? ['the animation'] : []),
    ...(change.changedSlots.length > 0 ? [change.changedSlots.join(', ')] : []),
  ];
  return (
    <Text wrap="truncate-end">
      <Text color="success">✓ </Text>
      <Text>{change.note}</Text>
      {parts.length > 0 && <Text dimColor> · {parts.join(' · ')}</Text>}
    </Text>
  );
}

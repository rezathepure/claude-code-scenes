import * as React from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import { Box, Pane, Text } from '@anthropic/ink';
import { ThemePicker } from '../../components/ThemePicker.js';
import { useTheme } from '@anthropic/ink';
import TextInput from '../../components/TextInput.js';
import { useModalOrTerminalSize } from '../../context/modalContext.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { getTheme, isKnownTheme, isReservedThemeName } from '../../utils/theme.js';
import { getThemeMeta, getThemeOrigin } from '../../themes/meta.js';
import { hiddenThemeNames, removeTheme, restoreTheme } from '../../themes/remove.js';
import { exportTheme } from '../../themes/save.js';
import { parseThemeArgs } from './parseArgs.js';
import { ThemeCreator } from './ThemeCreator.js';

type Props = {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
};

/**
 * A few real vibes to spark ideas — not lifted from the shipped themes, so
 * anyone reading them recognises they are examples, not options to pick.
 */
const VIBE_EXAMPLES = [
  'cyberpunk thunderstorm',
  'moody vampire castle',
  'autumn library at dusk',
  'sakura in moonlight',
  'phosphor terminal, 1984',
  'sunlit sea glass',
];

/**
 * The vibe prompt behind the grid's "Create your own" tile.
 *
 * Deliberately spread out to fill the pane. The first draft was five short
 * lines, which the modal slot dutifully shrunk down to a tiny bar at the
 * bottom of the screen — the pane sizes itself to its content. Now it reads
 * as an intentional design canvas: title, invitation, framed input, ideas
 * you can borrow, footer hints.
 *
 * Esc goes back to the grid rather than closing the command — abandoning the
 * idea should not cost the user the picker they came from. The Settings
 * context handles Esc via confirm:no; the letters it also binds (j/k/r//)
 * are ignored here because this hook only registers confirm:no, so typed
 * characters fall through to TextInput's own useInput (verified against the
 * agent-creation wizard's identical pattern in DescriptionStep).
 */
function DescribeTheme({
  onBack,
  onSubmit,
}: {
  onBack: () => void;
  onSubmit: (description: string) => void;
}): React.ReactNode {
  const [value, setValue] = React.useState('');
  const [cursorOffset, setCursorOffset] = React.useState(0);
  // The modal slot when there is one — a local-jsx panel gets `columns - 4`,
  // so sizing off the raw terminal made the framed input overhang its pane.
  const { columns } = useModalOrTerminalSize(useTerminalSize());

  useKeybinding('confirm:no', onBack, { context: 'Settings' });

  // Inner width the input box actually gets, accounting for pane padding
  // (Pane's paddingX=1 inside a modal), our marginX=2, the input's own
  // borderStyle (2), paddingX=1 inside it (2), and the "❯ " prompt (2).
  const innerWidth = Math.max(20, columns - 12);

  return (
    <Pane color="permission">
      <Box flexDirection="column" gap={1} paddingY={1}>
        <Box flexDirection="column" marginX={2} gap={1}>
          <Text bold color="claude">
            ✦ Design your own theme
          </Text>
          <Text>
            <Text color="text">Describe anything — a mood, a place, a film, a season.</Text>{' '}
            <Text dimColor>
              Claude will design a palette and pick an animation to match. You review it live, and keep it only if you
              love it.
            </Text>
          </Text>
        </Box>

        <Box marginX={2} borderStyle="round" borderColor="claude" paddingX={1}>
          <Text color="claude">❯ </Text>
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={v => {
              const trimmed = v.trim();
              if (trimmed.length > 0) onSubmit(trimmed);
            }}
            placeholder="give it a vibe — anything you can picture"
            columns={innerWidth}
            cursorOffset={cursorOffset}
            onChangeCursorOffset={setCursorOffset}
            focus
            showCursor
          />
        </Box>

        <Box flexDirection="column" marginX={2}>
          <Text dimColor>Try one, or borrow the idea:</Text>
          <Box flexDirection="column" marginLeft={2} marginTop={1}>
            {VIBE_EXAMPLES.map(v => (
              <Text key={v} dimColor italic>
                · {v}
              </Text>
            ))}
          </Box>
        </Box>

        <Box marginX={2} marginTop={1}>
          <Text dimColor italic>
            Enter to design it · Esc to go back to the grid
          </Text>
        </Box>
      </Box>
    </Pane>
  );
}

type PickerPhase = { kind: 'pick' } | { kind: 'describe' } | { kind: 'create'; description: string };

function ThemePickerCommand({ onDone }: Props): React.ReactNode {
  const [, setTheme] = useTheme();
  const [phase, setPhase] = React.useState<PickerPhase>({ kind: 'pick' });

  if (phase.kind === 'create') {
    return <ThemeCreator description={phase.description} onDone={onDone} />;
  }

  if (phase.kind === 'describe') {
    return (
      <DescribeTheme
        onBack={() => setPhase({ kind: 'pick' })}
        onSubmit={description => setPhase({ kind: 'create', description })}
      />
    );
  }

  return (
    <Pane color="permission">
      <ThemePicker
        layout="grid"
        onThemeSelect={setting => {
          setTheme(setting);
          onDone(`Theme set to ${setting}`);
        }}
        onCreate={() => setPhase({ kind: 'describe' })}
        onCancel={() => {
          onDone('Theme picker dismissed', { display: 'system' });
        }}
        skipExitHandling={true}
      />
    </Pane>
  );
}

/** Copies an existing theme into an editable file. */
async function handleExport(source: string, onDone: Props['onDone']): Promise<void> {
  if (!isKnownTheme(source)) {
    onDone(`No theme called “${source}”. Run /theme to see what is available.`, {
      display: 'system',
    });
    return;
  }

  const colors = getTheme(source) as unknown as Record<string, string>;
  // Mode from the meta registry — authoritative, set at registration. The
  // name-sniffing fallback only covers built-ins registered before meta
  // existed (and would misjudge a dark theme named "moonlight", which is why
  // it is no longer the primary).
  const mode: 'dark' | 'light' = getThemeMeta(source)?.mode ?? (source.includes('light') ? 'light' : 'dark');

  const result = await exportTheme(source, mode, colors);
  onDone(
    result.ok
      ? `Copied “${source}” to ${result.path}. Open it to edit — your editor will complete the slot names.`
      : result.error,
    { display: 'system' },
  );
}

/**
 * Deletes a user theme file — but only one of OURS.
 *
 * The policy itself lives in themes/remove.ts, shared with the grid's delete
 * key: two copies would drift, and the grid would end up offering to delete
 * something this command refuses.
 */
async function handleDelete(name: string, onDone: Props['onDone']): Promise<void> {
  const result = await removeTheme(name);
  onDone(result.message, { display: 'system' });
}

/**
 * Brings back a bundled theme the user deleted.
 *
 * Deleting one only records the name — there is no file to restore — so this
 * is the whole undo. Without it a shipped theme would be gone for good, which
 * is too sharp an edge for a key you can press by accident.
 */
function handleRestore(name: string, onDone: Props['onDone']): void {
  if (!restoreTheme(name)) {
    onDone(`“${name}” is not a deleted theme. Deleted: ${hiddenThemeNames().join(', ') || 'none'}.`, {
      display: 'system',
    });
    return;
  }
  onDone(`Restored “${name}”. Restart to see it in /theme.`, { display: 'system' });
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const parsed = parseThemeArgs(args ?? '');

  switch (parsed.kind) {
    case 'create':
      return <ThemeCreator description={parsed.description} onDone={onDone} />;
    case 'export':
      await handleExport(parsed.source, onDone);
      return null;
    case 'delete':
      await handleDelete(parsed.name, onDone);
      return null;
    case 'restore':
      handleRestore(parsed.name, onDone);
      return null;
    case 'error':
      onDone(parsed.message, { display: 'system' });
      return null;
    case 'picker':
      return <ThemePickerCommand onDone={onDone} />;
  }
};

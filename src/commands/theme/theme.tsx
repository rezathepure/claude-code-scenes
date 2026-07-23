import * as React from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import { Box, Pane, Text } from '@anthropic/ink';
import { ThemePicker } from '../../components/ThemePicker.js';
import { useTheme } from '@anthropic/ink';
import TextInput from '../../components/TextInput.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { getTheme, isKnownTheme, isReservedThemeName } from '../../utils/theme.js';
import { getThemeMeta, getThemeOrigin } from '../../themes/meta.js';
import { unregisterThemeWithTraits } from '../../themes/register.js';
import { deleteThemeFile, exportTheme } from '../../themes/save.js';
import { parseThemeArgs } from './parseArgs.js';
import { ThemeCreator } from './ThemeCreator.js';

type Props = {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
};

/**
 * The vibe prompt behind the grid's "Create your own" tile.
 *
 * Esc goes back to the grid rather than closing the command — abandoning the
 * idea should not cost the user the picker they came from. The Settings
 * context maps Esc alone to confirm:no (no bare letters), so typing a vibe
 * containing 'n' is safe — the same trick the agent-creation wizard uses.
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
  const { columns } = useTerminalSize();

  useKeybinding('confirm:no', onBack, { context: 'Settings' });

  return (
    <Pane color="permission">
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold color="claude">
            ✦ Create your own theme
          </Text>
          <Text dimColor>
            Describe a mood, a place, a film, a feeling — the palette and its animation are designed for you.
          </Text>
        </Box>
        <Box>
          <Text color="claude">❯ </Text>
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={v => {
              const trimmed = v.trim();
              if (trimmed.length > 0) onSubmit(trimmed);
            }}
            placeholder="e.g. neon tokyo rainstorm"
            columns={Math.max(20, columns - 8)}
            cursorOffset={cursorOffset}
            onChangeCursorOffset={setCursorOffset}
            focus
            showCursor
          />
        </Box>
        <Text dimColor italic>
          Enter to design it · Esc to go back
        </Text>
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

/** Deletes a user theme file — but only one of OURS. */
async function handleDelete(name: string, onDone: Props['onDone']): Promise<void> {
  if (isReservedThemeName(name)) {
    onDone(`“${name}” is built in and cannot be deleted.`, { display: 'system' });
    return;
  }
  if (!isKnownTheme(name)) {
    onDone(`No theme called “${name}”.`, { display: 'system' });
    return;
  }

  switch (getThemeOrigin(name)) {
    case 'bundled':
      onDone(
        `“${name}” ships with cc-themes and cannot be deleted. Run /theme export ${name} to make an editable copy.`,
        { display: 'system' },
      );
      return;
    case 'official':
      onDone(
        `“${name}” is managed by official Claude Code in ~/.claude/themes — delete it there, or run /theme export ${name} to copy it into ~/.claude/cc-themes as an editable cc theme.`,
        { display: 'system' },
      );
      return;
    default:
      break;
  }

  const result = await deleteThemeFile(name);
  if (result.ok) {
    unregisterThemeWithTraits(name);
  }
  onDone(result.ok ? `Deleted “${name}”.` : result.error, { display: 'system' });
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
    case 'error':
      onDone(parsed.message, { display: 'system' });
      return null;
    case 'picker':
      return <ThemePickerCommand onDone={onDone} />;
  }
};

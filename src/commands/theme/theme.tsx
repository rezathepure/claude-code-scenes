import * as React from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import { Pane } from '@anthropic/ink';
import { ThemePicker } from '../../components/ThemePicker.js';
import { useTheme } from '@anthropic/ink';
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

function ThemePickerCommand({ onDone }: Props): React.ReactNode {
  const [, setTheme] = useTheme();

  return (
    <Pane color="permission">
      <ThemePicker
        layout="grid"
        onThemeSelect={setting => {
          setTheme(setting);
          onDone(`Theme set to ${setting}`);
        }}
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

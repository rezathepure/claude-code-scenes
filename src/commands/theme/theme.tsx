import * as React from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import { Pane } from '@anthropic/ink';
import { ThemePicker } from '../../components/ThemePicker.js';
import { useTheme } from '@anthropic/ink';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { getTheme, isKnownTheme, isReservedThemeName } from '../../utils/theme.js';
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
  // Built-ins carry their mode in the name; runtime themes are registered with
  // it, but the palette itself does not record it, so fall back to reading the
  // background the theme was designed against.
  const mode: 'dark' | 'light' = source.includes('light') ? 'light' : 'dark';

  const result = await exportTheme(source, mode, colors);
  onDone(
    result.ok
      ? `Copied “${source}” to ${result.path}. Open it to edit — your editor will complete the slot names.`
      : result.error,
    { display: 'system' },
  );
}

/** Deletes a user theme file. */
async function handleDelete(name: string, onDone: Props['onDone']): Promise<void> {
  if (isReservedThemeName(name)) {
    onDone(`“${name}” is built in and cannot be deleted.`, { display: 'system' });
    return;
  }
  if (!isKnownTheme(name)) {
    onDone(`No theme called “${name}”.`, { display: 'system' });
    return;
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

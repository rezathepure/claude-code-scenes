import * as React from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import { Pane } from '@anthropic/ink';
import { ThemePicker } from '../../components/ThemePicker.js';
import { useTheme } from '@anthropic/ink';
import type { LocalJSXCommandCall } from '../../types/command.js';
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

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const parsed = parseThemeArgs(args ?? '');

  switch (parsed.kind) {
    case 'create':
      return <ThemeCreator description={parsed.description} onDone={onDone} />;
    case 'error':
      onDone(parsed.message, { display: 'system' });
      return null;
    case 'picker':
      return <ThemePickerCommand onDone={onDone} />;
  }
};

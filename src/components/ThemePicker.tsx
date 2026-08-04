import { feature } from 'bun:bundle';
import * as React from 'react';
import { useExitOnCtrlCDWithKeybindings } from '../hooks/useExitOnCtrlCDWithKeybindings.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { Box, Text, usePreviewTheme, useTheme, useThemeSetting } from '@anthropic/ink';
import { useRegisterKeybindingContext } from '../keybindings/KeybindingContext.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import { useShortcutDisplay } from '../keybindings/useShortcutDisplay.js';
import { sceneLabelOf } from '../scene/label.js';
import { removeTheme } from '../themes/remove.js';
import { useAppState, useSetAppState } from '../state/AppState.js';
import { gracefulShutdown } from '../utils/gracefulShutdown.js';
import { updateSettingsForSource } from '../utils/settings/settings.js';
import { getRegisteredThemeNames, THEME_NAMES, type ThemeSetting } from '../utils/theme.js';
import { getCachedThemeWarnings } from '../themes/loader.js';
import { useModalOrTerminalSize } from '../context/modalContext.js';
import { columnCountFor } from './ThemeGrid/layout.js';
import { ThemeGrid } from './ThemeGrid/ThemeGrid.js';
import { getSceneConfig } from '../scene/registry.js';
import { getGlobalConfig } from '../utils/config.js';
import { isFullscreenActive } from '../utils/fullscreen.js';
import { Select } from './CustomSelect/index.js';
import { Byline, KeyboardShortcutHint } from '@anthropic/ink';
import { getColorModuleUnavailableReason, getSyntaxTheme } from './StructuredDiff/colorDiff.js';
import { StructuredDiff } from './StructuredDiff.js';

export type ThemePickerProps = {
  onThemeSelect: (setting: ThemeSetting) => void;
  showIntroText?: boolean;
  helpText?: string;
  showHelpTextBelow?: boolean;
  hideEscToCancel?: boolean;
  /** Skip exit handling when running in a context that already has it (e.g., onboarding) */
  skipExitHandling?: boolean;
  /** Called when the user cancels (presses Escape). If skipExitHandling is true and this is provided, it will be called instead of just saving the preview. */
  onCancel?: () => void;
  /**
   * 'grid' renders the tile grid (/theme, /config); 'list' keeps the flat
   * Select (default — onboarding relies on it, and narrow terminals fall
   * back to it automatically even in grid mode).
   */
  layout?: 'list' | 'grid';
  /** Grid mode only: shows the "Create your own" tile, invoked on select. */
  onCreate?: () => void;
};

export function ThemePicker({
  onThemeSelect,
  showIntroText = false,
  helpText = '',
  showHelpTextBelow = false,
  hideEscToCancel = false,
  skipExitHandling = false,
  onCancel: onCancelProp,
  layout = 'list',
  onCreate,
}: ThemePickerProps): React.ReactNode {
  const [theme] = useTheme();
  const themeSetting = useThemeSetting();
  const { columns } = useTerminalSize();
  const colorModuleUnavailableReason = getColorModuleUnavailableReason();
  const syntaxTheme = colorModuleUnavailableReason === null ? getSyntaxTheme(theme) : null;
  const { setPreviewTheme, savePreview, cancelPreview } = usePreviewTheme();
  const syntaxHighlightingDisabled = useAppState(s => s.settings.syntaxHighlightingDisabled) ?? false;
  const setAppState = useSetAppState();

  // Register ThemePicker context so its keybindings take precedence over Global
  useRegisterKeybindingContext('ThemePicker');

  const syntaxToggleShortcut = useShortcutDisplay('theme:toggleSyntaxHighlighting', 'ThemePicker', 'ctrl+t');

  useKeybinding(
    'theme:toggleSyntaxHighlighting',
    () => {
      if (colorModuleUnavailableReason === null) {
        const newValue = !syntaxHighlightingDisabled;
        updateSettingsForSource('userSettings', {
          syntaxHighlightingDisabled: newValue,
        });
        setAppState(prev => ({
          ...prev,
          settings: { ...prev.settings, syntaxHighlightingDisabled: newValue },
        }));
      }
    },
    { context: 'ThemePicker' },
  );
  // Always call the hook to follow React rules, but conditionally assign the exit handler
  const exitState = useExitOnCtrlCDWithKeybindings(skipExitHandling ? () => {} : undefined);

  // Built-ins keep hand-written labels and this specific order (dark/light
  // paired by variant), which is neither alphabetical nor the order of
  // THEME_NAMES — deriving the list from that tuple would silently reshuffle
  // the menu. Themes registered at runtime are appended below, listed by name.
  const builtinThemeOptions: { label: string; value: ThemeSetting }[] = [
    ...(feature('AUTO_THEME') ? [{ label: 'Auto (match terminal)', value: 'auto' as const }] : []),
    { label: 'Dark mode', value: 'dark' },
    { label: 'Light mode', value: 'light' },
    {
      label: 'Dark mode (colorblind-friendly)',
      value: 'dark-daltonized',
    },
    {
      label: 'Light mode (colorblind-friendly)',
      value: 'light-daltonized',
    },
    {
      label: 'Dark mode (ANSI colors only)',
      value: 'dark-ansi',
    },
    {
      label: 'Light mode (ANSI colors only)',
      value: 'light-ansi',
    },
  ];

  const modalSize = useModalOrTerminalSize({ rows: 24, columns });
  const useGrid = layout === 'grid' && columnCountFor(modalSize.columns) >= 2;

  // Why is my theme not animating? The scene layer is alt-screen-only, and
  // external users default to the inline layout — a themed animation that
  // silently does nothing is exactly the kind of failure this picker has
  // learnt to explain. `theme` here is the resolved current theme, which
  // follows the preview, so the hint appears while hovering matrix/sakura.
  const sceneHint = React.useMemo(() => {
    if (!feature('SCENE_LAYER')) {
      return null;
    }
    const scene = getSceneConfig(theme);
    const label = sceneLabelOf(scene);
    if (label === null) return null;
    if (!isFullscreenActive()) {
      // Alt-screen is on by default now, so reaching here means it was turned
      // off deliberately — point at the switch that turns it back on rather
      // than at the env var, which is the escape hatch and not the setting.
      return `This theme has an animated background (${label}) — run /tui on and restart to see it (fullscreen mode)`;
    }
    if (getGlobalConfig().sceneAnimationsEnabled === false) {
      return `This theme has an animated background (${label}) — enable "Theme animations" in /config to see it`;
    }
    return null;
  }, [theme]);

  // Theme files that failed to load. Shown here because this is where someone
  // goes looking when a theme they wrote does not appear; the explanation
  // otherwise only reaches the debug log.
  const failedThemes = React.useMemo(() => getCachedThemeWarnings().filter(w => w.severity === 'error'), []);

  const themeOptions: { label: string; value: ThemeSetting }[] = React.useMemo(() => {
    const builtinNames = new Set<string>(THEME_NAMES);
    const extras = getRegisteredThemeNames()
      .filter(name => !builtinNames.has(name))
      .sort()
      .map(name => ({ label: name, value: name as ThemeSetting }));
    return [...builtinThemeOptions, ...extras];
    // Read once at mount: builtinThemeOptions is a stable literal and the
    // registry is the only real input. Phase 1 adds a change signal so newly
    // loaded theme files appear without a remount.
  }, []);

  // Bumped after a delete so the grid rebuilds its tiles from the registry.
  const [generation, bumpGeneration] = React.useReducer((n: number) => n + 1, 0);
  const [deleteStatus, setDeleteStatus] = React.useState<string | null>(null);

  const content = (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column" gap={1}>
        {showIntroText ? (
          <Text>Let&apos;s get started.</Text>
        ) : (
          <Text bold color="permission">
            Theme
          </Text>
        )}
        <Box flexDirection="column">
          <Text bold>Choose the text style that looks best with your terminal</Text>
          {helpText && !showHelpTextBelow && <Text dimColor>{helpText}</Text>}
        </Box>
        {useGrid ? (
          <ThemeGrid
            currentSetting={themeSetting}
            builtinOptions={builtinThemeOptions}
            onCreate={onCreate}
            generation={generation}
            onDelete={async name => {
              const result = await removeTheme(name);
              setDeleteStatus(result.message);
              if (!result.ok) return;

              // The preview may have been pointing at the theme that just
              // stopped existing; drop it before the grid rebuilds.
              cancelPreview();
              // Deleting the theme you are USING would leave the setting
              // naming something unregistered, which renders as the fallback
              // palette with no explanation. Fall back explicitly instead.
              if (name === themeSetting) {
                updateSettingsForSource('userSettings', { theme: 'dark' });
                onThemeSelect('dark' as ThemeSetting);
              }
              bumpGeneration();
            }}
            onFocus={setting => {
              setPreviewTheme(setting);
            }}
            onSelect={setting => {
              savePreview();
              onThemeSelect(setting);
            }}
            onCancel={
              skipExitHandling
                ? () => {
                    cancelPreview();
                    onCancelProp?.();
                  }
                : () => {
                    cancelPreview();
                    void gracefulShutdown(0);
                  }
            }
          />
        ) : (
          <Select
            options={themeOptions}
            onFocus={setting => {
              setPreviewTheme(setting as ThemeSetting);
            }}
            onChange={(setting: string) => {
              savePreview();
              onThemeSelect(setting as ThemeSetting);
            }}
            onCancel={
              skipExitHandling
                ? () => {
                    cancelPreview();
                    onCancelProp?.();
                  }
                : async () => {
                    cancelPreview();
                    await gracefulShutdown(0);
                  }
            }
            visibleOptionCount={themeOptions.length}
            defaultValue={themeSetting}
            defaultFocusValue={themeSetting}
          />
        )}
      </Box>
      <Box flexDirection="column" width="100%">
        {!useGrid && (
          <Box
            flexDirection="column"
            borderTop
            borderBottom
            borderLeft={false}
            borderRight={false}
            borderStyle="dashed"
            borderColor="subtle"
          >
            <StructuredDiff
              patch={{
                oldStart: 1,
                newStart: 1,
                oldLines: 3,
                newLines: 3,
                lines: [
                  ' function greet() {',
                  '-  console.log("Hello, World!");',
                  '+  console.log("Hello, Claude!");',
                  ' }',
                ],
              }}
              dim={false}
              filePath="demo.js"
              firstLine={null}
              width={columns}
            />
          </Box>
        )}
        <Text dimColor>
          {' '}
          {colorModuleUnavailableReason === 'env'
            ? `Syntax highlighting disabled (via CLAUDE_CODE_SYNTAX_HIGHLIGHT=${process.env.CLAUDE_CODE_SYNTAX_HIGHLIGHT})`
            : syntaxHighlightingDisabled
              ? `Syntax highlighting disabled (${syntaxToggleShortcut} to enable)`
              : syntaxTheme
                ? `Syntax theme: ${syntaxTheme.theme}${syntaxTheme.source ? ` (from ${syntaxTheme.source})` : ''} (${syntaxToggleShortcut} to disable)`
                : `Syntax highlighting enabled (${syntaxToggleShortcut} to disable)`}
        </Text>
        {sceneHint !== null && <Text dimColor> {sceneHint}</Text>}
        {deleteStatus !== null && <Text dimColor> {deleteStatus}</Text>}
      </Box>
      {failedThemes.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="warning">
            {failedThemes.length} theme file
            {failedThemes.length === 1 ? '' : 's'} could not be loaded:
          </Text>
          {failedThemes.map(w => (
            <Box key={`${w.theme}:${w.message}`} flexDirection="column" marginLeft={2}>
              <Text dimColor>
                • {w.theme} — {w.message}
              </Text>
              {w.suggestion !== undefined && (
                <Box marginLeft={2}>
                  <Text dimColor>{w.suggestion}</Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );

  // Only wrap in a box when not in onboarding
  if (!showIntroText) {
    return (
      <>
        <Box flexDirection="column">{content}</Box>
        <Box marginTop={1}>
          {showHelpTextBelow && helpText && (
            <Box marginLeft={3}>
              <Text dimColor>{helpText}</Text>
            </Box>
          )}
          {!hideEscToCancel && (
            <Box>
              <Text dimColor italic>
                {exitState.pending ? (
                  <>Press {exitState.keyName} again to exit</>
                ) : (
                  <Byline>
                    <KeyboardShortcutHint shortcut="Enter" action="select" />
                    {/* Only the grid binds it; the list picker has no focused tile to delete. */}
                    {useGrid && <KeyboardShortcutHint shortcut="d" action="delete" />}
                    <KeyboardShortcutHint shortcut="Esc" action="cancel" />
                  </Byline>
                )}
              </Text>
            </Box>
          )}
        </Box>
      </>
    );
  }

  return content;
}

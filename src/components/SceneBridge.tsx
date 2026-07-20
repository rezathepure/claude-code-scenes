import { useAppState } from '../state/AppState.js';
import { sceneController } from '../scene/controller.js';
import { useTheme } from '@anthropic/ink';
import * as React from 'react';

/**
 * Bridges React theme state to the (non-React) scene controller.
 *
 * Renders nothing. Exists because the resolved current theme lives only in
 * ThemeProvider's React state — there is no imperative subscription — and the
 * scene controller must follow it: picker selection, live preview (hovering
 * `matrix` in /theme starts the rain, because useTheme() already resolves
 * previewTheme ?? themeSetting), theme-file hot reload, and reduced-motion
 * changes all funnel through this one effect.
 */
export function SceneBridge(): React.ReactNode {
  const [currentTheme] = useTheme();
  const reducedMotion = useAppState(s => s.settings.prefersReducedMotion) ?? false;

  React.useEffect(() => {
    sceneController.syncPolicy({ themeName: currentTheme, reducedMotion });
  }, [currentTheme, reducedMotion]);

  // Unmount = the whole UI is going away; erase the scene with it.
  React.useEffect(() => () => sceneController.stop(), []);

  return null;
}

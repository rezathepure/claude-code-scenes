import * as React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from '@anthropic/ink';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';
import { shouldShowThemeDiscoveryHint, THEME_DISCOVERY_HINT_MAX_SHOW_COUNT } from '../../themes/firstRun.js';

export function ThemeDiscoveryHint(): React.ReactNode {
  const [show] = useState(() => shouldShowThemeDiscoveryHint(getGlobalConfig().ccsThemeHintSeenCount));

  useEffect(() => {
    if (!show) return;

    const newCount = (getGlobalConfig().ccsThemeHintSeenCount ?? 0) + 1;
    saveGlobalConfig(current => {
      if ((current.ccsThemeHintSeenCount ?? 0) >= newCount) return current;
      return {
        ...current,
        ccsThemeHintSeenCount: Math.min(newCount, THEME_DISCOVERY_HINT_MAX_SHOW_COUNT),
      };
    });
  }, [show]);

  if (!show) return null;

  return (
    <Box marginLeft={2} marginTop={1} alignSelf="flex-start" borderStyle="round" borderColor="claude" paddingX={1}>
      <Text>
        Type{' '}
        <Text bold color="claude">
          /theme
        </Text>{' '}
        to explore animated themes and create your own.
      </Text>
    </Box>
  );
}

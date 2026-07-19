import type { Command } from '../../commands.js'

const theme = {
  type: 'local-jsx',
  name: 'theme',
  description: 'Change the theme, or create one from a description',
  argumentHint: '[create <description>]',
  load: () => import('./theme.js'),
} satisfies Command

export default theme

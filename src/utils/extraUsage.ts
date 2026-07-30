import { isClaudeAISubscriber } from './auth.js'
import { has1mContext } from './context.js'

export function isBilledAsExtraUsage(
  model: string | null,
  isFastMode: boolean,
  isOpus1mMerged: boolean,
): boolean {
  if (!isClaudeAISubscriber()) return false
  if (isFastMode) return true
  if (model === null || !has1mContext(model)) return false

  const m = model
    .toLowerCase()
    .replace(/\[1m\]$/, '')
    .trim()
  // Matched on the resolved ID as well as the bare alias: the alias path keeps
  // working across a model launch on its own, but a user who picked a specific
  // model from the picker carries the full ID, and missing it here suppresses
  // the extra-usage warning for exactly the case it exists to cover.
  const isExtraUsageOpus =
    m === 'opus' ||
    m.includes('opus-4-6') ||
    m.includes('opus-4-7') ||
    m.includes('opus-4-8') ||
    m.includes('opus-5')
  const isExtraUsageSonnet =
    m === 'sonnet' || m.includes('sonnet-4-6') || m.includes('sonnet-5')
  const isExtraUsageFable = m === 'fable' || m.includes('fable-5')

  if (isExtraUsageOpus && isOpus1mMerged) return false

  return isExtraUsageOpus || isExtraUsageSonnet || isExtraUsageFable
}

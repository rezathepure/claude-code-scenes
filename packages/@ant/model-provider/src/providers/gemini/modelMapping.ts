// Fable is tested before opus. Without it, an unmatched family returns the raw
// 'claude-fable-5' from resolveGeminiModel below — worse than the throw, since
// the throw is the branch that tells the user which env var to set.
function getModelFamily(
  model: string,
): 'haiku' | 'sonnet' | 'opus' | 'fable' | null {
  if (/haiku/i.test(model)) return 'haiku'
  if (/fable/i.test(model)) return 'fable'
  if (/opus/i.test(model)) return 'opus'
  if (/sonnet/i.test(model)) return 'sonnet'
  return null
}

export function resolveGeminiModel(anthropicModel: string): string {
  if (process.env.GEMINI_MODEL) {
    return process.env.GEMINI_MODEL
  }

  const cleanModel = anthropicModel.replace(/\[1m\]$/i, '')
  const family = getModelFamily(cleanModel)

  if (!family) {
    return cleanModel
  }

  const geminiEnvVar = `GEMINI_DEFAULT_${family.toUpperCase()}_MODEL`
  const geminiModel = process.env[geminiEnvVar]
  if (geminiModel) {
    return geminiModel
  }

  const sharedEnvVar = `ANTHROPIC_DEFAULT_${family.toUpperCase()}_MODEL`
  const resolvedModel = process.env[sharedEnvVar]
  if (resolvedModel) {
    return resolvedModel
  }

  throw new Error(
    `Gemini provider requires GEMINI_MODEL or ${geminiEnvVar} (or ${sharedEnvVar} for backward compatibility) to be configured.`,
  )
}

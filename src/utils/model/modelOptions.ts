// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { getInitialMainLoopModel } from '../../bootstrap/state.js'
import {
  isClaudeAISubscriber,
  isMaxSubscriber,
  isTeamPremiumSubscriber,
} from '../auth.js'
import { getModelStrings } from './modelStrings.js'
import { getAntModels } from './antModels.js'
import {
  COST_TIER_3_15,
  COST_TIER_10_50,
  COST_HAIKU_35,
  COST_HAIKU_45,
  formatModelPricing,
} from '../modelCost.js'
import {
  FABLE_TAGLINE,
  HAIKU_TAGLINE,
  OPUS_TAGLINE,
  SONNET_TAGLINE,
} from './taglines.js'
import { getSettings_DEPRECATED } from '../settings/settings.js'
import { checkOpus1mAccess, checkSonnet1mAccess } from './check1mAccess.js'
import { getAPIProvider } from './providers.js'
import { isModelAllowed } from './modelAllowlist.js'
import {
  getCanonicalName,
  getClaudeAiUserDefaultModelDescription,
  getDefaultSonnetModel,
  getDefaultOpusModel,
  getDefaultFableModel,
  getDefaultHaikuModel,
  getDefaultMainLoopModelSetting,
  getMarketingNameForModel,
  getUserSpecifiedModelSetting,
  isOpus1mMergeEnabled,
  getOpusPricingSuffix,
  renderDefaultModelSetting,
  type ModelSetting,
} from './model.js'
import { has1mContext } from '../context.js'
import { getGlobalConfig } from '../config.js'
import {
  CHATGPT_CODEX_DEFAULT_MODEL,
  CHATGPT_CODEX_MODEL_OPTIONS,
  isChatGPTAuthMode,
} from './chatgptModels.js'

// @[MODEL LAUNCH]: Update all the available and default model option strings below.

export type ModelOption = {
  value: ModelSetting
  label: string
  description: string
  descriptionForModel?: string
}

export function getDefaultOptionForUser(fastMode = false): ModelOption {
  if (process.env.USER_TYPE === 'ant') {
    const currentModel = renderDefaultModelSetting(
      getDefaultMainLoopModelSetting(),
    )
    return {
      value: null,
      label: 'Default (recommended)',
      description: `Use the default model for Ants (currently ${currentModel})`,
      descriptionForModel: `Default model (currently ${currentModel})`,
    }
  }

  // Subscribers
  if (isClaudeAISubscriber()) {
    return {
      value: null,
      label: 'Default (recommended)',
      description: getClaudeAiUserDefaultModelDescription(fastMode),
    }
  }

  // PAYG
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: null,
    label: 'Default (recommended)',
    description: `Use the default model (currently ${renderDefaultModelSetting(getDefaultMainLoopModelSetting())})${is3P ? '' : ` · ${formatModelPricing(COST_TIER_3_15)}`}`,
  }
}

function getCustomSonnetOption(): ModelOption | undefined {
  const is3P = getAPIProvider() !== 'firstParty'
  const provider = getAPIProvider()
  // Use provider-specific DEFAULT_SONNET_MODEL
  const customSonnetModel =
    provider === 'openai'
      ? process.env.OPENAI_DEFAULT_SONNET_MODEL
      : provider === 'gemini'
        ? process.env.GEMINI_DEFAULT_SONNET_MODEL
        : process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
  // When a 3P user has a custom sonnet model string, show it directly
  if (is3P && customSonnetModel) {
    const is1m = has1mContext(customSonnetModel)
    // Use appropriate NAME/DESCRIPTION env vars based on provider
    const nameEnv =
      provider === 'openai'
        ? process.env.OPENAI_DEFAULT_SONNET_MODEL_NAME
        : provider === 'gemini'
          ? process.env.GEMINI_DEFAULT_SONNET_MODEL_NAME
          : process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_NAME
    const descEnv =
      provider === 'openai'
        ? process.env.OPENAI_DEFAULT_SONNET_MODEL_DESCRIPTION
        : provider === 'gemini'
          ? process.env.GEMINI_DEFAULT_SONNET_MODEL_DESCRIPTION
          : process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION
    return {
      value: 'sonnet',
      label: nameEnv ?? customSonnetModel,
      description:
        descEnv ?? `Custom Sonnet model${is1m ? ' (1M context)' : ''}`,
      descriptionForModel: `${descEnv ?? `Custom Sonnet model${is1m ? ' with 1M context' : ''}`} (${customSonnetModel})`,
    }
  }
}

// @[MODEL LAUNCH]: Update or add model option functions (getSonnetXXOption, getOpusXXOption, etc.)
// with the new model's label and description. These appear in the /model picker.
function getSonnet5Option(): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: is3P ? getModelStrings().sonnet5 : 'sonnet',
    label: 'Sonnet',
    description: `Sonnet 5 · ${SONNET_TAGLINE}${is3P ? '' : ` · ${formatModelPricing(COST_TIER_3_15)}`}`,
    descriptionForModel:
      'Sonnet 5 - efficient for routine tasks. Generally recommended for most coding tasks',
  }
}

function getFable5Option(): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: is3P ? getModelStrings().fable5 : 'fable',
    label: 'Fable',
    description: `Fable 5 · ${FABLE_TAGLINE}${is3P ? '' : ` · ${formatModelPricing(COST_TIER_10_50)}`}`,
    descriptionForModel:
      'Fable 5 - most capable for the hardest and longest-running tasks',
  }
}

function getSonnet46Option(): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: is3P ? getModelStrings().sonnet46 : 'sonnet',
    label: 'Sonnet',
    description: `Sonnet 4.6 · Best for everyday tasks${is3P ? '' : ` · ${formatModelPricing(COST_TIER_3_15)}`}`,
    descriptionForModel:
      'Sonnet 4.6 - best for everyday tasks. Generally recommended for most coding tasks',
  }
}

function getCustomOpusOption(): ModelOption | undefined {
  const is3P = getAPIProvider() !== 'firstParty'
  const provider = getAPIProvider()
  // Use provider-specific DEFAULT_OPUS_MODEL
  const customOpusModel =
    provider === 'openai'
      ? process.env.OPENAI_DEFAULT_OPUS_MODEL
      : provider === 'gemini'
        ? process.env.GEMINI_DEFAULT_OPUS_MODEL
        : process.env.ANTHROPIC_DEFAULT_OPUS_MODEL
  // When a 3P user has a custom opus model string, show it directly
  if (is3P && customOpusModel) {
    const is1m = has1mContext(customOpusModel)
    // Use appropriate NAME/DESCRIPTION env vars based on provider
    const nameEnv =
      provider === 'openai'
        ? process.env.OPENAI_DEFAULT_OPUS_MODEL_NAME
        : provider === 'gemini'
          ? process.env.GEMINI_DEFAULT_OPUS_MODEL_NAME
          : process.env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME
    const descEnv =
      provider === 'openai'
        ? process.env.OPENAI_DEFAULT_OPUS_MODEL_DESCRIPTION
        : provider === 'gemini'
          ? process.env.GEMINI_DEFAULT_OPUS_MODEL_DESCRIPTION
          : process.env.ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION
    return {
      value: 'opus',
      label: nameEnv ?? customOpusModel,
      description: descEnv ?? `Custom Opus model${is1m ? ' (1M context)' : ''}`,
      descriptionForModel: `${descEnv ?? `Custom Opus model${is1m ? ' with 1M context' : ''}`} (${customOpusModel})`,
    }
  }
}

function getOpus5Option(fastMode = false): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: is3P ? getModelStrings().opus5 : 'opus',
    label: 'Opus',
    description: `Opus 5 · ${OPUS_TAGLINE}${getOpusPricingSuffix(fastMode)}`,
    descriptionForModel: `Opus 5 - ${OPUS_TAGLINE.toLowerCase()}`,
  }
}

function getOpus5_1MOption(fastMode = false): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: is3P ? getModelStrings().opus5 + '[1m]' : 'opus[1m]',
    label: 'Opus (1M context)',
    description: `Opus 5 for long sessions${getOpusPricingSuffix(fastMode)}`,
    descriptionForModel:
      'Opus 5 with 1M context window - for long sessions with large codebases',
  }
}

function getOpus47Option(fastMode = false): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: is3P ? getModelStrings().opus47 : 'opus',
    label: 'Opus 4.7',
    description: `Opus 4.7 · Most capable for complex work${getOpusPricingSuffix(fastMode)}`,
    descriptionForModel: 'Opus 4.7 - most capable for complex work',
  }
}

export function getOpus46Option(fastMode = false): ModelOption {
  // Always use the canonical 4.6 model string (not the 'opus' alias, which
  // resolves via getDefaultOpusModel() to opus47 on firstParty). Users
  // selecting "Opus 4.6" must get 4.6 actually dispatched, not alias-routed
  // to 4.7. The same string is correct for 3P (getModelStrings maps per
  // provider).
  return {
    value: getModelStrings().opus46,
    label: 'Opus 4.6',
    description: `Opus 4.6 · Previous generation Opus${getOpusPricingSuffix(fastMode)}`,
    descriptionForModel: 'Opus 4.6 - previous generation Opus model',
  }
}

function getSonnet5_1MOption(): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: is3P ? getModelStrings().sonnet5 + '[1m]' : 'sonnet[1m]',
    label: 'Sonnet (1M context)',
    description: `Sonnet 5 for long sessions${is3P ? '' : ` · ${formatModelPricing(COST_TIER_3_15)}`}`,
    descriptionForModel:
      'Sonnet 5 with 1M context window - for long sessions with large codebases',
  }
}

export function getSonnet46_1MOption(): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: is3P ? getModelStrings().sonnet46 + '[1m]' : 'sonnet[1m]',
    label: 'Sonnet (1M context)',
    description: `Sonnet 4.6 for long sessions${is3P ? '' : ` · ${formatModelPricing(COST_TIER_3_15)}`}`,
    descriptionForModel:
      'Sonnet 4.6 with 1M context window - for long sessions with large codebases',
  }
}

export function getOpus47_1MOption(fastMode = false): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: is3P ? getModelStrings().opus47 + '[1m]' : 'opus[1m]',
    label: 'Opus 4.7 (1M context)',
    description: `Opus 4.7 with 1M context${getOpusPricingSuffix(fastMode)}`,
    descriptionForModel:
      'Opus 4.7 with 1M context window - for long sessions with large codebases',
  }
}

export function getOpus46_1MOption(fastMode = false): ModelOption {
  return {
    value: getModelStrings().opus46 + '[1m]',
    label: 'Opus 4.6 (1M context)',
    description: `Opus 4.6 with 1M context${getOpusPricingSuffix(fastMode)}`,
    descriptionForModel:
      'Opus 4.6 with 1M context window - for long sessions with large codebases',
  }
}

function getCustomHaikuOption(): ModelOption | undefined {
  const is3P = getAPIProvider() !== 'firstParty'
  const provider = getAPIProvider()
  // Use provider-specific DEFAULT_HAIKU_MODEL
  const customHaikuModel =
    provider === 'openai'
      ? process.env.OPENAI_DEFAULT_HAIKU_MODEL
      : provider === 'gemini'
        ? process.env.GEMINI_DEFAULT_HAIKU_MODEL
        : process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL
  // When a 3P user has a custom haiku model string, show it directly
  if (is3P && customHaikuModel) {
    // Use appropriate NAME/DESCRIPTION env vars based on provider
    const nameEnv =
      provider === 'openai'
        ? process.env.OPENAI_DEFAULT_HAIKU_MODEL_NAME
        : provider === 'gemini'
          ? process.env.GEMINI_DEFAULT_HAIKU_MODEL_NAME
          : process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME
    const descEnv =
      provider === 'openai'
        ? process.env.OPENAI_DEFAULT_HAIKU_MODEL_DESCRIPTION
        : provider === 'gemini'
          ? process.env.GEMINI_DEFAULT_HAIKU_MODEL_DESCRIPTION
          : process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION
    return {
      value: 'haiku',
      label: nameEnv ?? customHaikuModel,
      description: descEnv ?? 'Custom Haiku model',
      descriptionForModel: `${descEnv ?? 'Custom Haiku model'} (${customHaikuModel})`,
    }
  }
}

function getHaiku45Option(): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: 'haiku',
    label: 'Haiku',
    description: `Haiku 4.5 · ${HAIKU_TAGLINE}${is3P ? '' : ` · ${formatModelPricing(COST_HAIKU_45)}`}`,
    descriptionForModel:
      'Haiku 4.5 - fastest for quick answers. Lower cost but less capable than Sonnet.',
  }
}

function getHaiku35Option(): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: 'haiku',
    label: 'Haiku',
    description: `Haiku 3.5 for simple tasks${is3P ? '' : ` · ${formatModelPricing(COST_HAIKU_35)}`}`,
    descriptionForModel:
      'Haiku 3.5 - faster and lower cost, but less capable than Sonnet. Use for simple tasks.',
  }
}

function getHaikuOption(): ModelOption {
  // Return correct Haiku option based on provider
  const haikuModel = getDefaultHaikuModel()
  return haikuModel === getModelStrings().haiku45
    ? getHaiku45Option()
    : getHaiku35Option()
}

function getMaxOpusOption(fastMode = false): ModelOption {
  return {
    value: 'opus',
    label: 'Opus',
    description: `Opus 5 · ${OPUS_TAGLINE}${fastMode ? getOpusPricingSuffix(true) : ''}`,
  }
}

function getMaxSonnet5_1MOption(): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  const billingInfo = isClaudeAISubscriber() ? ' · Billed as extra usage' : ''
  return {
    value: 'sonnet[1m]',
    label: 'Sonnet (1M context)',
    description: `Sonnet 5 with 1M context${billingInfo}${is3P ? '' : ` · ${formatModelPricing(COST_TIER_3_15)}`}`,
  }
}

function getMaxOpus5_1MOption(fastMode = false): ModelOption {
  const billingInfo = isClaudeAISubscriber() ? ' · Billed as extra usage' : ''
  return {
    value: 'opus[1m]',
    label: 'Opus (1M context)',
    description: `Opus 5 with 1M context${billingInfo}${getOpusPricingSuffix(fastMode)}`,
  }
}

function getMergedOpus1MOption(fastMode = false): ModelOption {
  const is3P = getAPIProvider() !== 'firstParty'
  return {
    value: is3P ? getModelStrings().opus5 + '[1m]' : 'opus[1m]',
    label: 'Opus (1M context)',
    description: `Opus 5 with 1M context · ${OPUS_TAGLINE}${!is3P && fastMode ? getOpusPricingSuffix(fastMode) : ''}`,
    descriptionForModel: `Opus 5 with 1M context - ${OPUS_TAGLINE.toLowerCase()}`,
  }
}

const MaxSonnet5Option: ModelOption = {
  value: 'sonnet',
  label: 'Sonnet',
  description: `Sonnet 5 · ${SONNET_TAGLINE}`,
}

const MaxHaiku45Option: ModelOption = {
  value: 'haiku',
  label: 'Haiku',
  description: `Haiku 4.5 · ${HAIKU_TAGLINE}`,
}

function getOpusPlanOption(): ModelOption {
  return {
    value: 'opusplan',
    label: 'Opus Plan Mode',
    description: 'Use Opus in plan mode, Sonnet otherwise',
  }
}

function getChatGPTCodexModelOptions(): ModelOption[] {
  return [
    {
      value: null,
      label: 'Default (recommended)',
      description: `Use the default ChatGPT Codex model (currently ${CHATGPT_CODEX_DEFAULT_MODEL})`,
      descriptionForModel: `Default ChatGPT Codex model (currently ${CHATGPT_CODEX_DEFAULT_MODEL})`,
    },
    ...CHATGPT_CODEX_MODEL_OPTIONS.map(model => ({
      value: model.value,
      label: model.label,
      description: model.description,
      descriptionForModel: `${model.description} (${model.value})`,
    })),
  ]
}

// @[MODEL LAUNCH]: Update the model picker lists below to include/reorder options for the new model.
// Each user tier (ant, Max/Team Premium, Pro/Team Standard/Enterprise, PAYG 1P, PAYG 3P) has its own list.
function getModelOptionsBase(fastMode = false): ModelOption[] {
  if (process.env.USER_TYPE === 'ant') {
    // Build options from antModels config
    const antModelOptions: ModelOption[] = getAntModels().map(m => ({
      value: m.alias,
      label: m.label,
      description: m.description ?? `[ANT-ONLY] ${m.label} (${m.model})`,
    }))

    return [
      getDefaultOptionForUser(),
      ...antModelOptions,
      getMergedOpus1MOption(fastMode),
      getFable5Option(),
      getSonnet5Option(),
      getHaiku45Option(),
    ]
  }

  if (getAPIProvider() === 'openai' && isChatGPTAuthMode()) {
    return getChatGPTCodexModelOptions()
  }

  // First-party tiers below all show the same five rows official Claude Code
  // shows: Default, Opus (1M context), Fable, Sonnet, Haiku. Previous-generation
  // models are deliberately absent — they stay reachable through --model,
  // settings.model and ANTHROPIC_MODEL, which is how official words it too
  // ("For other/previous model names, specify with --model"). Keeping 4.6 and
  // 4.7 rows here would push the list past the picker's ten-row window for the
  // sake of models almost nobody reaches for.
  if (isClaudeAISubscriber()) {
    if (isMaxSubscriber() || isTeamPremiumSubscriber()) {
      // Max and Team Premium: the default already resolves to Opus 5 1M.
      const premiumOptions = [getDefaultOptionForUser(fastMode)]
      if (!isOpus1mMergeEnabled()) {
        premiumOptions.push(getMaxOpus5_1MOption(fastMode))
      }

      premiumOptions.push(getFable5Option())
      premiumOptions.push(MaxSonnet5Option)
      if (checkSonnet1mAccess()) {
        premiumOptions.push(getMaxSonnet5_1MOption())
      }

      premiumOptions.push(MaxHaiku45Option)
      return premiumOptions
    }

    // Pro/Team Standard/Enterprise: Sonnet is the default, so Opus is listed.
    const standardOptions = [getDefaultOptionForUser(fastMode)]

    if (isOpus1mMergeEnabled()) {
      standardOptions.push(getMergedOpus1MOption(fastMode))
    } else {
      standardOptions.push(getMaxOpusOption(fastMode))
      if (checkOpus1mAccess()) {
        standardOptions.push(getMaxOpus5_1MOption(fastMode))
      }
    }

    standardOptions.push(getFable5Option())
    standardOptions.push(MaxSonnet5Option)
    if (checkSonnet1mAccess()) {
      standardOptions.push(getMaxSonnet5_1MOption())
    }

    standardOptions.push(MaxHaiku45Option)
    return standardOptions
  }

  // PAYG 1P API
  if (getAPIProvider() === 'firstParty') {
    const payg1POptions = [getDefaultOptionForUser(fastMode)]
    if (isOpus1mMergeEnabled()) {
      payg1POptions.push(getMergedOpus1MOption(fastMode))
    } else {
      payg1POptions.push(getOpus5Option(fastMode))
      if (checkOpus1mAccess()) {
        payg1POptions.push(getOpus5_1MOption(fastMode))
      }
    }
    payg1POptions.push(getFable5Option())
    payg1POptions.push(getSonnet5Option())
    if (checkSonnet1mAccess()) {
      payg1POptions.push(getSonnet5_1MOption())
    }
    payg1POptions.push(getHaiku45Option())
    return payg1POptions
  }

  // PAYG 3P. Third-party capacity lags a launch, so this list stays on the
  // models getDefault*Model() actually resolves to for 3P — Sonnet 4.5 as the
  // default with 4.6 and Opus 4.7 offered above it — rather than advertising
  // Claude 5 rows that would 404 on Bedrock/Vertex/Foundry today.
  const payg3pOptions = [getDefaultOptionForUser(fastMode)]

  const customSonnet = getCustomSonnetOption()
  if (customSonnet !== undefined) {
    payg3pOptions.push(customSonnet)
  } else {
    // Add Sonnet 4.6 since Sonnet 4.5 is the default
    payg3pOptions.push(getSonnet46Option())
    if (checkSonnet1mAccess()) {
      payg3pOptions.push(getSonnet46_1MOption())
    }
  }

  const customOpus = getCustomOpusOption()
  if (customOpus !== undefined) {
    payg3pOptions.push(customOpus)
  } else {
    // Add Opus 4.7 1M + Opus 4.6 1M (no redundant non-1M entries)
    payg3pOptions.push(getOpus47_1MOption(fastMode))
    payg3pOptions.push(getOpus46_1MOption(fastMode))
  }
  const customHaiku = getCustomHaikuOption()
  if (customHaiku !== undefined) {
    payg3pOptions.push(customHaiku)
  } else {
    payg3pOptions.push(getHaikuOption())
  }
  return payg3pOptions
}

// @[MODEL LAUNCH]: Add the new model ID to the appropriate family pattern below
// so the "newer version available" hint works correctly.
/**
 * Map a full model name to its family alias and the marketing name of the
 * version the alias currently resolves to. Used to detect when a user has
 * a specific older version pinned and a newer one is available.
 */
function getModelFamilyInfo(
  model: string,
): { alias: string; currentVersionName: string } | null {
  const canonical = getCanonicalName(model)

  // Fable family — checked first, since it is the only one whose canonical name
  // contains no other family's substring and so cannot be caught by accident.
  if (canonical.includes('claude-fable')) {
    const currentName = getMarketingNameForModel(getDefaultFableModel())
    if (currentName) {
      return { alias: 'Fable', currentVersionName: currentName }
    }
  }

  // Sonnet family
  if (
    canonical.includes('claude-sonnet-5') ||
    canonical.includes('claude-sonnet-4-6') ||
    canonical.includes('claude-sonnet-4-5') ||
    canonical.includes('claude-sonnet-4-') ||
    canonical.includes('claude-3-7-sonnet') ||
    canonical.includes('claude-3-5-sonnet')
  ) {
    const currentName = getMarketingNameForModel(getDefaultSonnetModel())
    if (currentName) {
      return { alias: 'Sonnet', currentVersionName: currentName }
    }
  }

  // Opus family. 'claude-opus' rather than 'claude-opus-4' so that Opus 5 —
  // and whatever follows it — still gets the "newer version available" hint
  // when the user has an older Opus pinned by exact ID.
  if (canonical.includes('claude-opus')) {
    const currentName = getMarketingNameForModel(getDefaultOpusModel())
    if (currentName) {
      return { alias: 'Opus', currentVersionName: currentName }
    }
  }

  // Haiku family
  if (
    canonical.includes('claude-haiku') ||
    canonical.includes('claude-3-5-haiku')
  ) {
    const currentName = getMarketingNameForModel(getDefaultHaikuModel())
    if (currentName) {
      return { alias: 'Haiku', currentVersionName: currentName }
    }
  }

  return null
}

/**
 * Returns a ModelOption for a known Anthropic model with a human-readable
 * label, and an upgrade hint if a newer version is available via the alias.
 * Returns null if the model is not recognized.
 */
function getKnownModelOption(model: string): ModelOption | null {
  const marketingName = getMarketingNameForModel(model)
  if (!marketingName) return null

  const familyInfo = getModelFamilyInfo(model)
  if (!familyInfo) {
    return {
      value: model,
      label: marketingName,
      description: model,
    }
  }

  // Check if the alias currently resolves to a different (newer) version
  if (marketingName !== familyInfo.currentVersionName) {
    return {
      value: model,
      label: marketingName,
      description: `Newer version available · select ${familyInfo.alias} for ${familyInfo.currentVersionName}`,
    }
  }

  // Same version as the alias — just show the friendly name
  return {
    value: model,
    label: marketingName,
    description: model,
  }
}

export function getModelOptions(fastMode = false): ModelOption[] {
  const options = getModelOptionsBase(fastMode)

  // Add the custom model from the ANTHROPIC_CUSTOM_MODEL_OPTION env var
  const envCustomModel = process.env.ANTHROPIC_CUSTOM_MODEL_OPTION
  if (
    envCustomModel &&
    !options.some(existing => existing.value === envCustomModel)
  ) {
    options.push({
      value: envCustomModel,
      label: process.env.ANTHROPIC_CUSTOM_MODEL_OPTION_NAME ?? envCustomModel,
      description:
        process.env.ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION ??
        `Custom model (${envCustomModel})`,
    })
  }

  // Append additional model options fetched during bootstrap
  for (const opt of getGlobalConfig().additionalModelOptionsCache ?? []) {
    if (!options.some(existing => existing.value === opt.value)) {
      options.push(opt)
    }
  }

  // Add custom model from either the current model value or the initial one
  // if it is not already in the options.
  let customModel: ModelSetting = null
  const currentMainLoopModel = getUserSpecifiedModelSetting()
  const initialMainLoopModel = getInitialMainLoopModel()
  if (currentMainLoopModel !== undefined && currentMainLoopModel !== null) {
    customModel = currentMainLoopModel
  } else if (initialMainLoopModel !== null) {
    customModel = initialMainLoopModel
  }
  if (customModel === null || options.some(opt => opt.value === customModel)) {
    return filterModelOptionsByAllowlist(options)
  } else if (customModel === 'opusplan') {
    return filterModelOptionsByAllowlist([...options, getOpusPlanOption()])
  } else if (customModel === 'opus' && getAPIProvider() === 'firstParty') {
    return filterModelOptionsByAllowlist([
      ...options,
      getMaxOpusOption(fastMode),
    ])
  } else if (customModel === 'opus[1m]' && getAPIProvider() === 'firstParty') {
    return filterModelOptionsByAllowlist([
      ...options,
      getMergedOpus1MOption(fastMode),
    ])
  } else {
    // Try to show a human-readable label for known Anthropic models, with an
    // upgrade hint if the alias now resolves to a newer version.
    const knownOption = getKnownModelOption(customModel)
    if (knownOption) {
      options.push(knownOption)
    } else {
      options.push({
        value: customModel,
        label: customModel,
        description: 'Custom model',
      })
    }
    return filterModelOptionsByAllowlist(options)
  }
}

/**
 * Filter model options by the availableModels allowlist.
 * Always preserves the "Default" option (value: null).
 */
function filterModelOptionsByAllowlist(options: ModelOption[]): ModelOption[] {
  const settings = getSettings_DEPRECATED() || {}
  if (!settings.availableModels) {
    return options // No restrictions
  }
  return options.filter(
    opt =>
      opt.value === null || (opt.value !== null && isModelAllowed(opt.value)),
  )
}

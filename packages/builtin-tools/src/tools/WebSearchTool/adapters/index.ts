/**
 * Search adapter factory — selects the appropriate backend.
 *
 * Priority (highest first):
 *   1. WEB_SEARCH_ADAPTER environment variable (explicit override)
 *   2. settings.webSearchAdapter (user-configurable via /web-tools)
 *   3. Default: api — the user's own provider
 *
 * The default used to be `tavily`, which pointed at a Tavily proxy run by the
 * upstream project. Every unconfigured search therefore left the user's query
 * with a third party they had never heard of and could not see. `api` uses
 * the provider the user has already authenticated against, which is the only
 * default that sends their queries somewhere they chose. Tavily is still one
 * `/web-tools` away, and now requires its endpoint to be named explicitly.
 */

import { getSettings_DEPRECATED } from 'src/utils/settings/settings.js'
import { ApiSearchAdapter } from './apiAdapter.js'
import { BingSearchAdapter } from './bingAdapter.js'
import { BraveSearchAdapter } from './braveAdapter.js'
import { ExaSearchAdapter } from './exaAdapter.js'
import { TavilySearchAdapter } from './tavilyAdapter.js'
import type { WebSearchAdapter } from './types.js'

export type {
  SearchResult,
  SearchOptions,
  SearchProgress,
  WebSearchAdapter,
} from './types.js'

export type SearchAdapterKey = 'api' | 'bing' | 'brave' | 'exa' | 'tavily'

let cachedAdapter: WebSearchAdapter | null = null
let cachedAdapterKey: SearchAdapterKey | null = null

export function createAdapter(): WebSearchAdapter {
  // 1. Explicit env override
  const envAdapter = process.env.WEB_SEARCH_ADAPTER
  // 2. Settings preference (set via /web-tools panel)
  const settingsAdapter = getSettings_DEPRECATED().webSearchAdapter

  const adapterKey: SearchAdapterKey =
    envAdapter === 'api' ||
    envAdapter === 'bing' ||
    envAdapter === 'brave' ||
    envAdapter === 'exa' ||
    envAdapter === 'tavily'
      ? envAdapter
      : settingsAdapter === 'api' ||
          settingsAdapter === 'bing' ||
          settingsAdapter === 'brave' ||
          settingsAdapter === 'exa' ||
          settingsAdapter === 'tavily'
        ? settingsAdapter
        : 'api' // 3. Default

  if (cachedAdapter && cachedAdapterKey === adapterKey) return cachedAdapter

  switch (adapterKey) {
    case 'api':
      cachedAdapter = new ApiSearchAdapter()
      break
    case 'bing':
      cachedAdapter = new BingSearchAdapter()
      break
    case 'brave':
      cachedAdapter = new BraveSearchAdapter()
      break
    case 'exa':
      cachedAdapter = new ExaSearchAdapter()
      break
    case 'tavily':
      cachedAdapter = new TavilySearchAdapter()
      break
    default:
      cachedAdapter = new ApiSearchAdapter()
      break
  }

  cachedAdapterKey = adapterKey
  return cachedAdapter
}

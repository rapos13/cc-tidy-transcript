import type { On } from 'claude-code'

import { registerReadRuns } from './read-runs'
import { registerSearchRuns } from './search-runs'

/**
 * Registers the plugin's hooks.
 *
 * @param on the engine's registrar
 */
export function register(on: On) {
  registerReadRuns(on)
  registerSearchRuns(on)
}

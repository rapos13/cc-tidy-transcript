import type { On } from 'claude-code'

import { registerProbe } from './probe'
import { registerReadRuns } from './read-runs'
import { registerSearchRuns } from './search-runs'

/**
 * Registers the plugin's hooks.
 *
 * @param on the engine's registrar
 */
export function register(on: On) {
  registerProbe(on)
  registerReadRuns(on)
  registerSearchRuns(on)
}

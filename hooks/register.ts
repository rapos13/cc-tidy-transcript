import type { On } from 'claude-code'

import { registerCompactRows } from './compact-rows'
import { registerTerminal } from './terminal'

/**
 * Registers the plugin's hooks.
 *
 * @param on the engine's registrar
 */
export function register(on: On) {
  registerCompactRows(on)
  registerTerminal(on)
}

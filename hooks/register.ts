import type { On } from 'claude-code'

import { registerCompactRows } from './compact-rows'

/**
 * Registers the plugin's hooks.
 *
 * @param on the engine's registrar
 */
export function register(on: On) {
  registerCompactRows(on)
}

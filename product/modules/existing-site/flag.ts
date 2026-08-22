/**
 * Single on/off switch for the existing-site module. NEXT_PUBLIC_ so the same
 * value is inlined into client bundles and readable in route handlers.
 */
export const existingSiteEnabled = (): boolean => process.env.NEXT_PUBLIC_MODULE_EXISTING_SITE === '1'

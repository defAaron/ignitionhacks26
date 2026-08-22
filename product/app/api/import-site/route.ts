// [existing-site] — thin shim; the handler lives in modules/existing-site/server/handler.ts.
// Segment config must be literal here: Next parses these statically and rejects re-exports.
export const runtime = 'nodejs' // [existing-site]
export const maxDuration = 30 // [existing-site]
export { POST } from '@/modules/existing-site/server/handler' // [existing-site]

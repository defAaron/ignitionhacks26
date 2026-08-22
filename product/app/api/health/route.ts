import { NextResponse } from 'next/server'

/**
 * Which capabilities are configured. Booleans only — never the values — so
 * the studio can tell a new user what to set up before they hit a failure.
 */
export function GET(): NextResponse {
  return NextResponse.json({
    recognize: !!process.env.GEMINI_API_KEY,
    seal: !!process.env.ANTHROPIC_API_KEY,
    builder: process.env.BUILDER === 'freesolo' ? (process.env.FREESOLO_BASE_URL ? 'freesolo' : 'freesolo-unconfigured') : 'baseline'
  })
}

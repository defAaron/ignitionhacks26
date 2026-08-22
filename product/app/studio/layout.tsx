import type { Metadata } from 'next'
import './studio.css'

export const metadata: Metadata = {
  title: 'baio studio',
  description: 'Draw it. Press Enter. It prints.'
}

export default function StudioLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <>{children}</>
}

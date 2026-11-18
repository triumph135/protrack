import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { AuthProvider } from '@/contexts/AuthContext'
import { TenantProvider } from '@/contexts/TenantContext'
import { ConfirmDialogHost } from '@/components/ui/confirm-dialog'
import { ThemeToaster } from '@/components/theme/ThemeToaster'
import './globals.css'

const themeScript = `(function(){try{var q=new URLSearchParams(location.search).get('theme');var stored=null;try{stored=localStorage.getItem('protrack-theme')}catch(e){}var theme='dark';if(q==='light'||q==='dark')theme=q;else if(stored==='light'||stored==='dark')theme=stored;else if(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)theme='light';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme}catch(e){}})();`

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'ProTrack - Project Management',
  description: 'Professional project cost tracking and management',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${inter.className}`}>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <AuthProvider>
          <TenantProvider>
            {children}
          </TenantProvider>
        </AuthProvider>
        <ThemeToaster />
        <ConfirmDialogHost />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
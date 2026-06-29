import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth/AuthContext'

export const metadata: Metadata = {
  title: 'Freshket Sale Tracking',
  description: 'ระบบติดตามการพัฒนาทีม Sale ของ Freshket',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}

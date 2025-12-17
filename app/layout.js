import './globals.css'

export const metadata = {
  title: 'Polymarket × Kalshi Arbitrage Scanner',
  description: 'Real-time cross-platform prediction market arbitrage opportunity finder',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

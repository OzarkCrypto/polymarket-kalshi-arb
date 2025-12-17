# Polymarket × Kalshi Arbitrage Scanner

Real-time cross-platform prediction market arbitrage opportunity finder.

![Dashboard Preview](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![Deployment](https://img.shields.io/badge/Vercel-Deployed-black?style=flat-square&logo=vercel)

## 🎯 What is this?

This dashboard scans both **Polymarket** and **Kalshi** prediction markets to find arbitrage opportunities where:

```
pY' + pN' < 1
```

Where `pY'` and `pN'` are fee-adjusted prices for YES and NO outcomes.

## 📊 Arbitrage Logic

### Assumptions
- Budget: B = $100
- Yes price: pY, Fee: fY
- No price: pN, Fee: fN

### Calculation Steps

1. **Fee-included prices**
   ```
   pY' = pY × (1 + fY)
   pN' = pN × (1 + fN)
   ```

2. **Arbitrage condition**
   ```
   pY' + pN' < 1 ✅
   ```

3. **Dollar allocation** (by price ratio)
   ```
   Yes $ = Budget × pY' / (pY' + pN')
   No  $ = Budget × pN' / (pY' + pN')
   ```

4. **Shares purchased** (always equal)
   ```
   shares = Budget / (pY' + pN')
   ```

5. **Result at expiry**
   ```
   Payout = shares × $1
   Profit = Budget × (1/(pY'+pN') − 1)
   ```

### Example
```
Yes price pY = 0.46, Fee fY = 1%
No price pN = 0.50, Fee fN = 1%

Step 1: pY' = 0.46 × 1.01 = 0.4646
        pN' = 0.50 × 1.01 = 0.5050

Step 2: 0.4646 + 0.5050 = 0.9696 < 1 ✅

Step 3: Yes $ = $47.93, No $ = $52.07

Step 4: shares = 100 / 0.9696 ≈ 103.14

Step 5: Payout = $103.14
        Profit = +$3.14 (ROI ≈ 3.14%)
```

## 🚀 Features

- **Cross-Platform Scanning**: Matches similar markets between Polymarket and Kalshi using keyword similarity
- **Intra-Platform Detection**: Finds arbitrage within single platforms
- **Price Gap Analysis**: Shows price differences for similar markets
- **Real-time Updates**: Auto-refreshes every 60 seconds
- **Customizable Parameters**: Adjust budget, fees, and minimum ROI

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **APIs**: Polymarket Gamma API, Kalshi Trading API
- **Deployment**: Vercel

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/polymarket-kalshi-arb.git

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## ⚠️ Disclaimers

1. **Resolution Mismatch**: Polymarket and Kalshi may have different resolution rules for seemingly identical events
2. **Execution Risk**: Prices can change between detection and trade execution
3. **Liquidity**: Large orders may experience slippage
4. **Funding**: Cross-platform arbitrage requires capital on both platforms
5. **Timing**: Settlement dates may differ between platforms

## 📄 License

MIT License

---

Built with ❤️ for prediction market enthusiasts

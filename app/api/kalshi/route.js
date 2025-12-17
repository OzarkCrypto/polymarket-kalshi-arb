import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const params = new URLSearchParams({
      limit: '1000',
      status: 'open'
    });
    
    const response = await fetch(
      `https://api.elections.kalshi.com/trade-api/v2/markets?${params}`,
      { 
        next: { revalidate: 30 },
        headers: {
          'Accept': 'application/json',
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Kalshi API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Process and filter markets (status is 'active' not 'open')
    const processed = (data.markets || [])
      .filter(m => m.yes_ask && m.no_ask && m.status === 'active')
      .map(m => {
        const yesPrice = (m.yes_ask || 0) / 100; // Convert cents to dollars
        const noPrice = (m.no_ask || 0) / 100;
        
        if (yesPrice <= 0 || noPrice <= 0) return null;
        
        return {
          id: m.ticker,
          platform: 'kalshi',
          question: m.title || '',
          ticker: m.ticker,
          eventTicker: m.event_ticker,
          yesPrice,
          noPrice,
          yesBid: (m.yes_bid || 0) / 100,
          noBid: (m.no_bid || 0) / 100,
          volume24hr: m.volume_24h || 0,
          openInterest: m.open_interest || 0,
          closeTime: m.close_time,
          url: `https://kalshi.com/markets/${m.event_ticker}`
        };
      })
      .filter(Boolean);
    
    return NextResponse.json({ 
      success: true, 
      data: processed,
      count: processed.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Kalshi API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

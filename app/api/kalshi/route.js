import { NextResponse } from 'next/server';

// 주요 스포츠 시리즈 티커 (실제 확인된 시리즈)
const SPORTS_SERIES = [
  // 미국 프로 스포츠
  'KXNFLGAME', 'KXNBAGAME', 'KXMLBGAME', 'KXNHLGAME',
  // 대학 스포츠
  'KXNCAAFGAME', 'KXNCAABGAME', 
  // 축구
  'KXEPLGAME', 'KXLALIGAGAME', 'KXBUNDESLIGAGAME', 'KXSABOREDGAME',
  'KXCHAMPIONSLEAGUEGAME', 'KXEUROLEAGUEGAME', 'KXHNLGAME',
  'KXEREDIVISIEGAME', 'KXDANISHSUPERLIGAGAME',
  // 기타 스포츠
  'KXUFCFIGHT', 'KXPGATOUR', 'KXTENNISEXHIBITION', 'KXTENNISGAME',
  'KXF1RACE', 'KXCSGOGAME',
  // 어워드/챔피언십
  'KXNFLMVP', 'KXNBAMVP', 'KXMLBMVP', 'KXNHLMVP',
  'KXNFLAFCCHAMP', 'KXNFLNFCCHAMP', 'KXSUPERBOWLWINNER',
  'KXNBACHAMP', 'KXMLBCHAMP', 'KXNHLCHAMP'
];

export async function GET() {
  try {
    const allMarkets = [];
    
    // 1. 일반 마켓 가져오기 (cursor 기반 페이지네이션)
    let cursor = null;
    for (let i = 0; i < 3; i++) {
      const url = cursor 
        ? `https://api.elections.kalshi.com/trade-api/v2/markets?limit=1000&cursor=${cursor}`
        : `https://api.elections.kalshi.com/trade-api/v2/markets?limit=1000`;
      
      const response = await fetch(url, { 
        next: { revalidate: 30 },
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) break;
      const data = await response.json();
      allMarkets.push(...(data.markets || []));
      cursor = data.cursor;
      if (!cursor) break;
    }
    
    // 2. 스포츠 시리즈별 마켓 가져오기 (병렬)
    const sportsFetches = SPORTS_SERIES.map(series =>
      fetch(
        `https://api.elections.kalshi.com/trade-api/v2/markets?limit=500&series_ticker=${series}`,
        { 
          next: { revalidate: 30 },
          headers: { 'Accept': 'application/json' }
        }
      ).then(r => r.ok ? r.json() : { markets: [] })
       .catch(() => ({ markets: [] }))
    );
    
    const sportsResults = await Promise.all(sportsFetches);
    for (const result of sportsResults) {
      allMarkets.push(...(result.markets || []));
    }
    
    // 중복 제거
    const seen = new Set();
    const uniqueMarkets = allMarkets.filter(m => {
      if (!m.ticker || seen.has(m.ticker)) return false;
      seen.add(m.ticker);
      return true;
    });
    
    const data = { markets: uniqueMarkets };
    
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

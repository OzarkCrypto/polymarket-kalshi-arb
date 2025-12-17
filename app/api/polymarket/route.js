import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Fetch multiple pages (500 per page, up to 3000 markets)
    const allMarkets = [];
    const pageSize = 500;
    const maxPages = 6; // 3000 markets max
    
    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
        closed: 'false',
        active: 'true'
      });
      
      const response = await fetch(
        `https://gamma-api.polymarket.com/markets?${params}`,
        { 
          next: { revalidate: 30 },
          headers: {
            'Accept': 'application/json',
          }
        }
      );
      
      if (!response.ok) {
        console.error(`Polymarket API error on page ${page}: ${response.status}`);
        break;
      }
      
      const pageData = await response.json();
      if (!pageData || pageData.length === 0) break;
      
      allMarkets.push(...pageData);
      
      // If we got less than pageSize, we've reached the end
      if (pageData.length < pageSize) break;
    }
    
    const data = allMarkets;
    
    // Process and filter markets
    const processed = data
      .filter(m => m.outcomePrices && !m.closed && m.active)
      .map(m => {
        try {
          const prices = JSON.parse(m.outcomePrices);
          const yesPrice = parseFloat(prices[0]) || 0;
          const noPrice = parseFloat(prices[1]) || 0;
          
          if (yesPrice <= 0 || noPrice <= 0) return null;
          
          return {
            id: m.id,
            platform: 'polymarket',
            question: m.question || '',
            slug: m.slug,
            category: m.category,
            yesPrice,
            noPrice,
            volume24hr: m.volume24hr || 0,
            volumeNum: m.volumeNum || 0,
            liquidityNum: m.liquidityNum || 0,
            endDate: m.endDate,
            url: `https://polymarket.com/event/${m.slug}`
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    
    return NextResponse.json({ 
      success: true, 
      data: processed,
      count: processed.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Polymarket API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

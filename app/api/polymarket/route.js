import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const params = new URLSearchParams({
      limit: '500',
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
      throw new Error(`Polymarket API error: ${response.status}`);
    }
    
    const data = await response.json();
    
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

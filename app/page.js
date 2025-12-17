'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

export default function Home() {
  const [polymarketData, setPolymarketData] = useState([]);
  const [kalshiData, setKalshiData] = useState([]);
  const [loading, setLoading] = useState({ polymarket: true, kalshi: true });
  const [errors, setErrors] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  const [activeTab, setActiveTab] = useState('cross');
  const [budget, setBudget] = useState(100);
  const [feeRate, setFeeRate] = useState({ polymarket: 0.01, kalshi: 0.01 });
  const [minROI, setMinROI] = useState(0);
  const [expandedItem, setExpandedItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch Polymarket data
  const fetchPolymarket = useCallback(async () => {
    setLoading(prev => ({ ...prev, polymarket: true }));
    try {
      const response = await fetch('/api/polymarket');
      const result = await response.json();
      
      if (!result.success) throw new Error(result.error);
      
      setPolymarketData(result.data);
      setErrors(prev => ({ ...prev, polymarket: null }));
    } catch (err) {
      setErrors(prev => ({ ...prev, polymarket: err.message }));
    } finally {
      setLoading(prev => ({ ...prev, polymarket: false }));
    }
  }, []);

  // Fetch Kalshi data
  const fetchKalshi = useCallback(async () => {
    setLoading(prev => ({ ...prev, kalshi: true }));
    try {
      const response = await fetch('/api/kalshi');
      const result = await response.json();
      
      if (!result.success) throw new Error(result.error);
      
      setKalshiData(result.data);
      setErrors(prev => ({ ...prev, kalshi: null }));
    } catch (err) {
      setErrors(prev => ({ ...prev, kalshi: err.message }));
    } finally {
      setLoading(prev => ({ ...prev, kalshi: false }));
    }
  }, []);

  // Fetch all data
  const fetchAll = useCallback(() => {
    fetchPolymarket();
    fetchKalshi();
    setLastUpdate(new Date());
  }, [fetchPolymarket, fetchKalshi]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Calculate intra-platform arbitrage
  const calculateIntraArb = useCallback((market, fee) => {
    const yesPrime = market.yesPrice * (1 + fee);
    const noPrime = market.noPrice * (1 + fee);
    const yesPrimeCeil = Math.ceil(yesPrime * 100) / 100;
    const noPrimeCeil = Math.ceil(noPrime * 100) / 100;
    const totalCost = yesPrimeCeil + noPrimeCeil;
    
    if (totalCost >= 1) return null;
    
    const shares = budget / totalCost;
    const profit = budget * (1 / totalCost - 1);
    const roi = ((1 / totalCost) - 1) * 100;
    
    return {
      yesPrime: yesPrimeCeil,
      noPrime: noPrimeCeil,
      totalCost,
      shares,
      profit,
      roi,
      yesAllocation: budget * yesPrimeCeil / totalCost,
      noAllocation: budget * noPrimeCeil / totalCost
    };
  }, [budget]);

  // Intra-platform arbitrage opportunities
  const intraArbOpportunities = useMemo(() => {
    const polyArbs = polymarketData
      .map(m => {
        const arb = calculateIntraArb(m, feeRate.polymarket);
        if (!arb || arb.roi < minROI) return null;
        return { ...m, ...arb, arbType: 'intra' };
      })
      .filter(Boolean);

    const kalshiArbs = kalshiData
      .map(m => {
        const arb = calculateIntraArb(m, feeRate.kalshi);
        if (!arb || arb.roi < minROI) return null;
        return { ...m, ...arb, arbType: 'intra' };
      })
      .filter(Boolean);

    return [...polyArbs, ...kalshiArbs].sort((a, b) => b.roi - a.roi);
  }, [polymarketData, kalshiData, calculateIntraArb, feeRate, minROI]);

  // Extract keywords from text
  const extractKeywords = (text) => {
    if (!text) return [];
    const stopWords = new Set(['will', 'the', 'a', 'an', 'be', 'is', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'shall', 'should', 'would', 'could', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'or', 'and', 'not', 'no', 'yes', 'before', 'after', 'this', 'that', 'if', 'who', 'what', 'when', 'where', 'how', 'which', 'than', 'then', 'more', 'less', 'between', 'during']);
    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
  };

  // Calculate similarity between keyword sets
  const calculateSimilarity = (keywords1, keywords2) => {
    if (!keywords1.length || !keywords2.length) return 0;
    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);
    const intersection = [...set1].filter(x => set2.has(x)).length;
    const union = new Set([...set1, ...set2]).size;
    return intersection / union;
  };

  // Cross-platform arbitrage opportunities
  const crossArbOpportunities = useMemo(() => {
    const opportunities = [];
    const polyKeywords = polymarketData.map(m => ({
      market: m,
      keywords: extractKeywords(m.question)
    }));
    const kalshiKeywords = kalshiData.map(m => ({
      market: m,
      keywords: extractKeywords(m.question)
    }));

    for (const poly of polyKeywords) {
      for (const kalshi of kalshiKeywords) {
        const similarity = calculateSimilarity(poly.keywords, kalshi.keywords);
        
        if (similarity >= 0.3) {
          const polyYes = poly.market.yesPrice * (1 + feeRate.polymarket);
          const polyNo = poly.market.noPrice * (1 + feeRate.polymarket);
          const kalshiYes = kalshi.market.yesPrice * (1 + feeRate.kalshi);
          const kalshiNo = kalshi.market.noPrice * (1 + feeRate.kalshi);

          // Strategy 1: Polymarket Yes + Kalshi No
          const strat1Total = polyYes + kalshiNo;
          if (strat1Total < 1) {
            const roi1 = ((1 / strat1Total) - 1) * 100;
            if (roi1 >= minROI) {
              opportunities.push({
                id: `${poly.market.id}-${kalshi.market.id}-1`,
                similarity,
                polymarket: poly.market,
                kalshi: kalshi.market,
                strategy: 'Poly YES + Kalshi NO',
                polyPosition: 'YES',
                kalshiPosition: 'NO',
                polyPrice: polyYes,
                kalshiPrice: kalshiNo,
                totalCost: strat1Total,
                roi: roi1,
                profit: budget * (1 / strat1Total - 1),
                polyAllocation: budget * polyYes / strat1Total,
                kalshiAllocation: budget * kalshiNo / strat1Total,
                shares: budget / strat1Total,
                arbType: 'cross'
              });
            }
          }

          // Strategy 2: Polymarket No + Kalshi Yes
          const strat2Total = polyNo + kalshiYes;
          if (strat2Total < 1) {
            const roi2 = ((1 / strat2Total) - 1) * 100;
            if (roi2 >= minROI) {
              opportunities.push({
                id: `${poly.market.id}-${kalshi.market.id}-2`,
                similarity,
                polymarket: poly.market,
                kalshi: kalshi.market,
                strategy: 'Poly NO + Kalshi YES',
                polyPosition: 'NO',
                kalshiPosition: 'YES',
                polyPrice: polyNo,
                kalshiPrice: kalshiYes,
                totalCost: strat2Total,
                roi: roi2,
                profit: budget * (1 / strat2Total - 1),
                polyAllocation: budget * polyNo / strat2Total,
                kalshiAllocation: budget * kalshiYes / strat2Total,
                shares: budget / strat2Total,
                arbType: 'cross'
              });
            }
          }
        }
      }
    }

    return opportunities.sort((a, b) => b.roi - a.roi);
  }, [polymarketData, kalshiData, feeRate, minROI, budget]);

  // Price differences (not arbitrage, but useful info)
  const priceDifferences = useMemo(() => {
    const diffs = [];
    const polyKeywords = polymarketData.map(m => ({
      market: m,
      keywords: extractKeywords(m.question)
    }));
    const kalshiKeywords = kalshiData.map(m => ({
      market: m,
      keywords: extractKeywords(m.question)
    }));

    for (const poly of polyKeywords) {
      for (const kalshi of kalshiKeywords) {
        const similarity = calculateSimilarity(poly.keywords, kalshi.keywords);
        
        if (similarity >= 0.35) {
          const yesDiff = Math.abs(poly.market.yesPrice - kalshi.market.yesPrice);
          const noDiff = Math.abs(poly.market.noPrice - kalshi.market.noPrice);
          const avgDiff = (yesDiff + noDiff) / 2;

          if (avgDiff >= 0.03) {
            diffs.push({
              id: `diff-${poly.market.id}-${kalshi.market.id}`,
              similarity,
              polymarket: poly.market,
              kalshi: kalshi.market,
              yesDiff,
              noDiff,
              avgDiff,
              polyYes: poly.market.yesPrice,
              kalshiYes: kalshi.market.yesPrice,
              polyNo: poly.market.noPrice,
              kalshiNo: kalshi.market.noPrice
            });
          }
        }
      }
    }

    return diffs.sort((a, b) => b.avgDiff - a.avgDiff).slice(0, 50);
  }, [polymarketData, kalshiData]);

  const filteredIntraArbs = intraArbOpportunities.filter(m =>
    !searchQuery || m.question.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCrossArbs = crossArbOpportunities.filter(m =>
    !searchQuery || 
    m.polymarket.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.kalshi.question.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPriceDiffs = priceDifferences.filter(m =>
    !searchQuery ||
    m.polymarket.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.kalshi.question.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (num) => {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatPercent = (num) => `${(num * 100).toFixed(1)}%`;

  const isLoading = loading.polymarket || loading.kalshi;

  return (
    <main className="min-h-screen p-4 md:p-6">
      {/* Header */}
      <header className="mb-6 p-5 rounded-xl bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-green-500/10 border border-[#30363d]">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-green-400 bg-clip-text text-transparent">
              Polymarket × Kalshi Arb Scanner
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Cross-platform prediction market arbitrage finder | pY&apos; + pN&apos; &lt; 1
            </p>
          </div>
          
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex gap-2">
              <span className="badge-polymarket px-2 py-1 rounded text-xs font-semibold">
                POLY: {polymarketData.length}
              </span>
              <span className="badge-kalshi px-2 py-1 rounded text-xs font-semibold">
                KALSHI: {kalshiData.length}
              </span>
            </div>
            {lastUpdate && (
              <span className="text-xs text-gray-500">
                {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <button onClick={fetchAll} disabled={isLoading} className="btn-primary text-sm">
              {isLoading ? 'Scanning...' : '🔄 Refresh'}
            </button>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <div className="card p-4">
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wider">💰 Budget ($)</label>
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value) || 100)}
            className="input-field font-semibold text-blue-400"
          />
        </div>

        <div className="card p-4">
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wider">📊 Poly Fee (%)</label>
          <input
            type="number"
            step="0.1"
            value={feeRate.polymarket * 100}
            onChange={(e) => setFeeRate(prev => ({ ...prev, polymarket: Number(e.target.value) / 100 || 0 }))}
            className="input-field font-semibold text-purple-400"
          />
        </div>

        <div className="card p-4">
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wider">📊 Kalshi Fee (%)</label>
          <input
            type="number"
            step="0.1"
            value={feeRate.kalshi * 100}
            onChange={(e) => setFeeRate(prev => ({ ...prev, kalshi: Number(e.target.value) / 100 || 0 }))}
            className="input-field font-semibold text-green-400"
          />
        </div>

        <div className="card p-4">
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wider">🎯 Min ROI (%)</label>
          <input
            type="number"
            step="0.1"
            value={minROI}
            onChange={(e) => setMinROI(Number(e.target.value) || 0)}
            className="input-field font-semibold text-orange-400"
          />
        </div>

        <div className="card p-4 col-span-2">
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wider">🔍 Search</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Enter keywords..."
            className="input-field"
          />
        </div>
      </div>

      {/* Errors */}
      {(errors.polymarket || errors.kalshi) && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          {errors.polymarket && <p className="text-red-400 text-sm">⚠️ Polymarket: {errors.polymarket}</p>}
          {errors.kalshi && <p className="text-red-400 text-sm">⚠️ Kalshi: {errors.kalshi}</p>}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-[#30363d] mb-5">
        <button className={`tab-btn ${activeTab === 'cross' ? 'active' : ''}`} onClick={() => setActiveTab('cross')}>
          🔀 Cross-Platform ({filteredCrossArbs.length})
        </button>
        <button className={`tab-btn ${activeTab === 'intra' ? 'active' : ''}`} onClick={() => setActiveTab('intra')}>
          📊 Single Platform ({filteredIntraArbs.length})
        </button>
        <button className={`tab-btn ${activeTab === 'diff' ? 'active' : ''}`} onClick={() => setActiveTab('diff')}>
          📈 Price Gaps ({filteredPriceDiffs.length})
        </button>
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {/* Cross-Platform Tab */}
        {activeTab === 'cross' && (
          <div className="space-y-3">
            {filteredCrossArbs.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <div className="text-5xl mb-4">🔍</div>
                <p>No cross-platform arbitrage opportunities found.</p>
                <p className="text-sm mt-2">Try adjusting fee rates or minimum ROI.</p>
              </div>
            ) : (
              filteredCrossArbs.slice(0, 30).map((opp, idx) => (
                <div
                  key={opp.id}
                  className="card p-4 cursor-pointer animate-slideIn"
                  style={{ animationDelay: `${idx * 30}ms` }}
                  onClick={() => setExpandedItem(expandedItem === opp.id ? null : opp.id)}
                >
                  <div className="flex flex-col lg:flex-row justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="bg-green-600 text-white px-2 py-0.5 rounded text-xs font-bold">
                          #{idx + 1}
                        </span>
                        <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-xs">
                          Match: {(opp.similarity * 100).toFixed(0)}%
                        </span>
                        <span className="text-orange-400 text-xs font-medium">
                          {opp.strategy}
                        </span>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="badge-polymarket px-1.5 py-0.5 rounded text-[10px] font-bold">POLY</span>
                          <span className="text-sm truncate">{opp.polymarket.question}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="badge-kalshi px-1.5 py-0.5 rounded text-[10px] font-bold">KALSHI</span>
                          <span className="text-sm truncate">{opp.kalshi.question}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="text-center">
                        <div className="text-[10px] text-gray-500">Poly {opp.polyPosition}</div>
                        <div className="text-purple-400 font-semibold">{opp.polyPrice.toFixed(4)}</div>
                      </div>
                      <span className="text-gray-600">+</span>
                      <div className="text-center">
                        <div className="text-[10px] text-gray-500">Kalshi {opp.kalshiPosition}</div>
                        <div className="text-green-400 font-semibold">{opp.kalshiPrice.toFixed(4)}</div>
                      </div>
                      <span className="text-gray-600">=</span>
                      <div className="text-center">
                        <div className="text-[10px] text-gray-500">Total</div>
                        <div className="text-blue-400 font-semibold">{opp.totalCost.toFixed(4)}</div>
                      </div>
                      <div className="bg-green-500/20 border border-green-500/30 rounded-lg px-3 py-2 text-center">
                        <div className="text-[10px] text-gray-500">ROI</div>
                        <div className="text-green-400 text-lg font-bold">+{opp.roi.toFixed(2)}%</div>
                      </div>
                    </div>
                  </div>

                  {expandedItem === opp.id && (
                    <div className="mt-4 pt-4 border-t border-[#30363d] animate-slideIn">
                      <h4 className="text-blue-400 text-sm font-semibold mb-3">
                        💰 ${budget} Investment Strategy
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-[#0d1117] rounded-lg p-3">
                          <div className="text-[10px] text-gray-500">Poly {opp.polyPosition}</div>
                          <div className="text-purple-400 font-semibold">${opp.polyAllocation.toFixed(2)}</div>
                        </div>
                        <div className="bg-[#0d1117] rounded-lg p-3">
                          <div className="text-[10px] text-gray-500">Kalshi {opp.kalshiPosition}</div>
                          <div className="text-green-400 font-semibold">${opp.kalshiAllocation.toFixed(2)}</div>
                        </div>
                        <div className="bg-[#0d1117] rounded-lg p-3">
                          <div className="text-[10px] text-gray-500">Shares</div>
                          <div className="text-blue-400 font-semibold">{opp.shares.toFixed(2)}</div>
                        </div>
                        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                          <div className="text-[10px] text-gray-500">Guaranteed Profit</div>
                          <div className="text-green-400 font-bold text-lg">+${opp.profit.toFixed(2)}</div>
                        </div>
                      </div>
                      
                      <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
                        <strong>Formula:</strong> Payout = {opp.shares.toFixed(2)} × $1 = ${opp.shares.toFixed(2)} | 
                        Profit = ${opp.shares.toFixed(2)} - ${budget} = <strong>${opp.profit.toFixed(2)}</strong>
                      </div>

                      <div className="mt-3 flex gap-2 flex-wrap">
                        <a
                          href={opp.polymarket.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="badge-polymarket px-3 py-1.5 rounded text-xs hover:opacity-80 transition"
                        >
                          🔗 Polymarket
                        </a>
                        <a
                          href={opp.kalshi.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="badge-kalshi px-3 py-1.5 rounded text-xs hover:opacity-80 transition"
                        >
                          🔗 Kalshi
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Intra-Platform Tab */}
        {activeTab === 'intra' && (
          <div className="space-y-3">
            {filteredIntraArbs.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <div className="text-5xl mb-4">📭</div>
                <p>No single-platform arbitrage opportunities found.</p>
              </div>
            ) : (
              filteredIntraArbs.slice(0, 30).map((opp, idx) => (
                <div
                  key={`${opp.platform}-${opp.id}`}
                  className="card p-4 animate-slideIn"
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`badge-${opp.platform} px-1.5 py-0.5 rounded text-[10px] font-bold`}>
                        {opp.platform.toUpperCase()}
                      </span>
                      <span className="text-sm truncate">{opp.question}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <div className="text-[10px] text-gray-500">YES&apos;</div>
                        <div className="text-green-400 text-sm">{opp.yesPrime.toFixed(4)}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-gray-500">NO&apos;</div>
                        <div className="text-red-400 text-sm">{opp.noPrime.toFixed(4)}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-gray-500">Total</div>
                        <div className="text-blue-400 text-sm">{opp.totalCost.toFixed(4)}</div>
                      </div>
                      <div className="bg-green-500/20 rounded px-2 py-1">
                        <div className="text-green-400 font-bold">+{opp.roi.toFixed(2)}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Price Differences Tab */}
        {activeTab === 'diff' && (
          <div className="space-y-3">
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg mb-4">
              <span className="text-blue-400 text-sm">
                ℹ️ Similar markets with price differences (not arbitrage - for research only)
              </span>
            </div>
            
            {filteredPriceDiffs.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <div className="text-5xl mb-4">🔍</div>
                <p>No similar markets found.</p>
              </div>
            ) : (
              filteredPriceDiffs.map((item, idx) => (
                <div
                  key={item.id}
                  className="card p-4 animate-slideIn"
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-xs">
                      Match: {(item.similarity * 100).toFixed(0)}%
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs ${item.avgDiff >= 0.1 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      Avg Diff: {(item.avgDiff * 100).toFixed(1)}%
                    </span>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="badge-polymarket px-1.5 py-0.5 rounded text-[10px] font-bold">POLY</span>
                      </div>
                      <p className="text-sm text-gray-300 mb-2 line-clamp-2">{item.polymarket.question}</p>
                      <div className="flex gap-4 text-sm">
                        <span className="text-green-400">YES: {formatPercent(item.polyYes)}</span>
                        <span className="text-red-400">NO: {formatPercent(item.polyNo)}</span>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="badge-kalshi px-1.5 py-0.5 rounded text-[10px] font-bold">KALSHI</span>
                      </div>
                      <p className="text-sm text-gray-300 mb-2 line-clamp-2">{item.kalshi.question}</p>
                      <div className="flex gap-4 text-sm">
                        <span className="text-green-400">YES: {formatPercent(item.kalshiYes)}</span>
                        <span className="text-red-400">NO: {formatPercent(item.kalshiNo)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-[#30363d] flex gap-4 text-xs text-gray-500">
                    <span>YES diff: <span className="text-yellow-400">{(item.yesDiff * 100).toFixed(1)}%</span></span>
                    <span>NO diff: <span className="text-yellow-400">{(item.noDiff * 100).toFixed(1)}%</span></span>
                    {item.polyYes !== item.kalshiYes && (
                      <span className="text-blue-400">
                        → {item.polyYes > item.kalshiYes ? 'Kalshi YES cheaper' : 'Poly YES cheaper'}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-8 p-4 bg-[#161b22]/50 rounded-lg border border-[#30363d]">
        <div className="flex flex-col md:flex-row justify-between items-center gap-3 text-xs text-gray-500">
          <div>
            <strong className="text-blue-400">Arbitrage Condition:</strong>
            <span className="ml-2">pY&apos; + pN&apos; &lt; 1 (fees included, same event)</span>
          </div>
          <div>
            ⚠️ Cross-platform trades require matching resolution rules, timing, and liquidity
          </div>
        </div>
      </footer>
    </main>
  );
}

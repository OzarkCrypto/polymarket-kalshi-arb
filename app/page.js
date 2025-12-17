'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

export default function Home() {
  const [polymarketData, setPolymarketData] = useState([]);
  const [kalshiData, setKalshiData] = useState([]);
  const [loading, setLoading] = useState({ polymarket: true, kalshi: true });
  const [lastUpdate, setLastUpdate] = useState(null);
  const [activeTab, setActiveTab] = useState('cross');
  const [budget, setBudget] = useState(100);
  const [feeRate, setFeeRate] = useState({ polymarket: 1, kalshi: 1 });
  const [minROI, setMinROI] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchPolymarket = useCallback(async () => {
    try {
      const res = await fetch('/api/polymarket');
      const data = await res.json();
      if (data.success) setPolymarketData(data.data);
    } catch (e) { console.error(e); }
    setLoading(prev => ({ ...prev, polymarket: false }));
  }, []);

  const fetchKalshi = useCallback(async () => {
    try {
      const res = await fetch('/api/kalshi');
      const data = await res.json();
      if (data.success) setKalshiData(data.data);
    } catch (e) { console.error(e); }
    setLoading(prev => ({ ...prev, kalshi: false }));
  }, []);

  const fetchAll = useCallback(() => {
    setLoading({ polymarket: true, kalshi: true });
    fetchPolymarket();
    fetchKalshi();
    setLastUpdate(new Date());
  }, [fetchPolymarket, fetchKalshi]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const extractKeywords = (text) => {
    if (!text) return [];
    const stopWords = new Set(['will', 'the', 'a', 'an', 'be', 'is', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'or', 'and', 'not', 'no', 'yes', 'before', 'after', 'this', 'that', 'if', 'who', 'what', 'when', 'where', 'how', 'which', 'than', 'then', 'more', 'less', 'between', 'during']);
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  };

  const calcSimilarity = (k1, k2) => {
    if (!k1.length || !k2.length) return 0;
    const s1 = new Set(k1), s2 = new Set(k2);
    const inter = [...s1].filter(x => s2.has(x)).length;
    return inter / new Set([...s1, ...s2]).size;
  };

  const crossArbs = useMemo(() => {
    const opps = [];
    const polyKw = polymarketData.map(m => ({ m, kw: extractKeywords(m.question) }));
    const kalshiKw = kalshiData.map(m => ({ m, kw: extractKeywords(m.question) }));

    for (const p of polyKw) {
      for (const k of kalshiKw) {
        const sim = calcSimilarity(p.kw, k.kw);
        if (sim < 0.3) continue;

        const pFee = feeRate.polymarket / 100;
        const kFee = feeRate.kalshi / 100;
        const pY = p.m.yesPrice * (1 + pFee);
        const pN = p.m.noPrice * (1 + pFee);
        const kY = k.m.yesPrice * (1 + kFee);
        const kN = k.m.noPrice * (1 + kFee);

        // Strategy 1: Poly YES + Kalshi NO
        const t1 = pY + kN;
        if (t1 < 1) {
          const roi = (1 / t1 - 1) * 100;
          if (roi >= minROI) {
            opps.push({
              id: `${p.m.id}-${k.m.id}-1`,
              sim, poly: p.m, kalshi: k.m,
              strat: 'P.Yes + K.No',
              pPos: 'YES', kPos: 'NO',
              pPrice: pY, kPrice: kN,
              total: t1, roi,
              profit: budget * (1 / t1 - 1),
              pAlloc: budget * pY / t1,
              kAlloc: budget * kN / t1,
              shares: budget / t1
            });
          }
        }

        // Strategy 2: Poly NO + Kalshi YES
        const t2 = pN + kY;
        if (t2 < 1) {
          const roi = (1 / t2 - 1) * 100;
          if (roi >= minROI) {
            opps.push({
              id: `${p.m.id}-${k.m.id}-2`,
              sim, poly: p.m, kalshi: k.m,
              strat: 'P.No + K.Yes',
              pPos: 'NO', kPos: 'YES',
              pPrice: pN, kPrice: kY,
              total: t2, roi,
              profit: budget * (1 / t2 - 1),
              pAlloc: budget * pN / t2,
              kAlloc: budget * kY / t2,
              shares: budget / t2
            });
          }
        }
      }
    }
    return opps.sort((a, b) => b.roi - a.roi);
  }, [polymarketData, kalshiData, feeRate, minROI, budget]);

  const intraArbs = useMemo(() => {
    const opps = [];
    
    polymarketData.forEach(m => {
      const fee = feeRate.polymarket / 100;
      const yP = Math.ceil(m.yesPrice * (1 + fee) * 100) / 100;
      const nP = Math.ceil(m.noPrice * (1 + fee) * 100) / 100;
      const t = yP + nP;
      if (t < 1) {
        const roi = (1 / t - 1) * 100;
        if (roi >= minROI) {
          opps.push({ ...m, platform: 'poly', yP, nP, total: t, roi, profit: budget * (1 / t - 1), shares: budget / t });
        }
      }
    });

    kalshiData.forEach(m => {
      const fee = feeRate.kalshi / 100;
      const yP = Math.ceil(m.yesPrice * (1 + fee) * 100) / 100;
      const nP = Math.ceil(m.noPrice * (1 + fee) * 100) / 100;
      const t = yP + nP;
      if (t < 1) {
        const roi = (1 / t - 1) * 100;
        if (roi >= minROI) {
          opps.push({ ...m, platform: 'kalshi', yP, nP, total: t, roi, profit: budget * (1 / t - 1), shares: budget / t });
        }
      }
    });

    return opps.sort((a, b) => b.roi - a.roi);
  }, [polymarketData, kalshiData, feeRate, minROI, budget]);

  const priceDiffs = useMemo(() => {
    const diffs = [];
    const polyKw = polymarketData.map(m => ({ m, kw: extractKeywords(m.question) }));
    const kalshiKw = kalshiData.map(m => ({ m, kw: extractKeywords(m.question) }));

    for (const p of polyKw) {
      for (const k of kalshiKw) {
        const sim = calcSimilarity(p.kw, k.kw);
        if (sim >= 0.35) {
          const yDiff = Math.abs(p.m.yesPrice - k.m.yesPrice);
          const nDiff = Math.abs(p.m.noPrice - k.m.noPrice);
          if ((yDiff + nDiff) / 2 >= 0.03) {
            diffs.push({
              id: `d-${p.m.id}-${k.m.id}`,
              sim, poly: p.m, kalshi: k.m,
              yDiff, nDiff,
              avgDiff: (yDiff + nDiff) / 2
            });
          }
        }
      }
    }
    return diffs.sort((a, b) => b.avgDiff - a.avgDiff).slice(0, 50);
  }, [polymarketData, kalshiData]);

  const filtered = {
    cross: crossArbs.filter(o => !searchQuery || o.poly.question.toLowerCase().includes(searchQuery.toLowerCase()) || o.kalshi.question.toLowerCase().includes(searchQuery.toLowerCase())),
    intra: intraArbs.filter(o => !searchQuery || o.question.toLowerCase().includes(searchQuery.toLowerCase())),
    diff: priceDiffs.filter(o => !searchQuery || o.poly.question.toLowerCase().includes(searchQuery.toLowerCase()) || o.kalshi.question.toLowerCase().includes(searchQuery.toLowerCase()))
  };

  const isLoading = loading.polymarket || loading.kalshi;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[--border] bg-[--bg-alt] px-4 py-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-sm">Polymarket × Kalshi Arb Scanner</h1>
            <span className="text-[10px] text-[--text-muted]">pY&apos; + pN&apos; &lt; 1</span>
          </div>
          
          <div className="flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-1">
              <span className="badge badge-poly">POLY {polymarketData.length}</span>
              <span className="badge badge-kalshi">KALSHI {kalshiData.length}</span>
            </div>
            {lastUpdate && (
              <span className="text-[--text-muted]">
                <span className="status-dot status-live"></span>
                {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <button onClick={fetchAll} disabled={isLoading} className="btn-sm btn-primary">
              {isLoading ? '...' : '↻ Refresh'}
            </button>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="border-b border-[--border] px-4 py-2 flex items-center gap-4 flex-wrap bg-white">
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-[--text-muted]">Budget $</label>
          <input type="number" value={budget} onChange={e => setBudget(Number(e.target.value) || 100)} className="input-sm" />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-[--text-muted]">Poly Fee %</label>
          <input type="number" step="0.1" value={feeRate.polymarket} onChange={e => setFeeRate(p => ({ ...p, polymarket: Number(e.target.value) || 0 }))} className="input-sm w-14" />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-[--text-muted]">Kalshi Fee %</label>
          <input type="number" step="0.1" value={feeRate.kalshi} onChange={e => setFeeRate(p => ({ ...p, kalshi: Number(e.target.value) || 0 }))} className="input-sm w-14" />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-[--text-muted]">Min ROI %</label>
          <input type="number" step="0.1" value={minROI} onChange={e => setMinROI(Number(e.target.value) || 0)} className="input-sm w-14" />
        </div>
        <div className="flex items-center gap-1 flex-1 max-w-xs">
          <label className="text-[10px] text-[--text-muted]">Search</label>
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="keyword..." className="input-sm flex-1" style={{ width: 'auto' }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar px-2">
        <button className={`tab-btn ${activeTab === 'cross' ? 'active' : ''}`} onClick={() => setActiveTab('cross')}>
          Cross-Platform ({filtered.cross.length})
        </button>
        <button className={`tab-btn ${activeTab === 'intra' ? 'active' : ''}`} onClick={() => setActiveTab('intra')}>
          Single Platform ({filtered.intra.length})
        </button>
        <button className={`tab-btn ${activeTab === 'diff' ? 'active' : ''}`} onClick={() => setActiveTab('diff')}>
          Price Gaps ({filtered.diff.length})
        </button>
      </div>

      {/* Content */}
      <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
        {/* Cross-Platform Table */}
        {activeTab === 'cross' && (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th style={{ width: 50 }}>Match</th>
                <th>Polymarket</th>
                <th>Kalshi</th>
                <th style={{ width: 90 }}>Strategy</th>
                <th style={{ width: 70 }}>P.Price</th>
                <th style={{ width: 70 }}>K.Price</th>
                <th style={{ width: 70 }}>Total</th>
                <th style={{ width: 70 }}>ROI</th>
                <th style={{ width: 70 }}>Profit</th>
                <th style={{ width: 60 }}>Links</th>
              </tr>
            </thead>
            <tbody>
              {filtered.cross.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8 text-[--text-muted]">No arbitrage opportunities found</td></tr>
              ) : (
                filtered.cross.slice(0, 100).map((o, i) => (
                  <>
                    <tr key={o.id} className="arb-row cursor-pointer" onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                      <td><span className="badge badge-rank">{i + 1}</span></td>
                      <td><span className="num">{(o.sim * 100).toFixed(0)}%</span></td>
                      <td>
                        <div className="flex items-center gap-1">
                          <span className="badge badge-poly">{o.pPos}</span>
                          <span className="q-text" title={o.poly.question}>{o.poly.question}</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <span className="badge badge-kalshi">{o.kPos}</span>
                          <span className="q-text" title={o.kalshi.question}>{o.kalshi.question}</span>
                        </div>
                      </td>
                      <td className="text-[10px] text-[--text-muted]">{o.strat}</td>
                      <td className="num num-purple">{o.pPrice.toFixed(4)}</td>
                      <td className="num num-teal">{o.kPrice.toFixed(4)}</td>
                      <td className="num num-blue">{o.total.toFixed(4)}</td>
                      <td><span className="badge badge-roi">+{o.roi.toFixed(2)}%</span></td>
                      <td className="num num-green font-semibold">+${o.profit.toFixed(2)}</td>
                      <td>
                        <a href={o.poly.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="link mr-1">P</a>
                        <a href={o.kalshi.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="link">K</a>
                      </td>
                    </tr>
                    {expandedId === o.id && (
                      <tr key={`${o.id}-exp`} className="expand-row">
                        <td colSpan={11}>
                          <div className="flex gap-6 text-[11px]">
                            <div>
                              <span className="text-[--text-muted]">Poly Alloc:</span>
                              <span className="num num-purple ml-1">${o.pAlloc.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-[--text-muted]">Kalshi Alloc:</span>
                              <span className="num num-teal ml-1">${o.kAlloc.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-[--text-muted]">Shares:</span>
                              <span className="num ml-1">{o.shares.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-[--text-muted]">Payout:</span>
                              <span className="num num-green ml-1">${o.shares.toFixed(2)}</span>
                            </div>
                            <div className="text-[--text-muted]">
                              Formula: ${budget} ÷ {o.total.toFixed(4)} = {o.shares.toFixed(2)} shares → ${o.shares.toFixed(2)} payout
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* Single Platform Table */}
        {activeTab === 'intra' && (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th style={{ width: 60 }}>Platform</th>
                <th>Market</th>
                <th style={{ width: 70 }}>Yes&apos;</th>
                <th style={{ width: 70 }}>No&apos;</th>
                <th style={{ width: 70 }}>Total</th>
                <th style={{ width: 70 }}>ROI</th>
                <th style={{ width: 70 }}>Profit</th>
                <th style={{ width: 50 }}>Link</th>
              </tr>
            </thead>
            <tbody>
              {filtered.intra.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-[--text-muted]">No single-platform arbitrage found</td></tr>
              ) : (
                filtered.intra.slice(0, 100).map((o, i) => (
                  <tr key={`${o.platform}-${o.id}`} className="arb-row">
                    <td><span className="badge badge-rank">{i + 1}</span></td>
                    <td><span className={`badge badge-${o.platform}`}>{o.platform.toUpperCase()}</span></td>
                    <td><span className="q-text" title={o.question}>{o.question}</span></td>
                    <td className="num num-green">{o.yP.toFixed(4)}</td>
                    <td className="num num-red">{o.nP.toFixed(4)}</td>
                    <td className="num num-blue">{o.total.toFixed(4)}</td>
                    <td><span className="badge badge-roi">+{o.roi.toFixed(2)}%</span></td>
                    <td className="num num-green font-semibold">+${o.profit.toFixed(2)}</td>
                    <td><a href={o.url} target="_blank" rel="noopener noreferrer" className="link">→</a></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* Price Gaps Table */}
        {activeTab === 'diff' && (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th style={{ width: 50 }}>Match</th>
                <th>Polymarket</th>
                <th style={{ width: 60 }}>P.Yes</th>
                <th style={{ width: 60 }}>P.No</th>
                <th>Kalshi</th>
                <th style={{ width: 60 }}>K.Yes</th>
                <th style={{ width: 60 }}>K.No</th>
                <th style={{ width: 60 }}>Δ Yes</th>
                <th style={{ width: 60 }}>Δ No</th>
                <th style={{ width: 50 }}>Links</th>
              </tr>
            </thead>
            <tbody>
              {filtered.diff.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8 text-[--text-muted]">No significant price gaps found</td></tr>
              ) : (
                filtered.diff.map((o, i) => (
                  <tr key={o.id}>
                    <td className="text-[--text-muted]">{i + 1}</td>
                    <td><span className="num">{(o.sim * 100).toFixed(0)}%</span></td>
                    <td><span className="q-text" title={o.poly.question}>{o.poly.question}</span></td>
                    <td className="num">{(o.poly.yesPrice * 100).toFixed(1)}¢</td>
                    <td className="num">{(o.poly.noPrice * 100).toFixed(1)}¢</td>
                    <td><span className="q-text" title={o.kalshi.question}>{o.kalshi.question}</span></td>
                    <td className="num">{(o.kalshi.yesPrice * 100).toFixed(1)}¢</td>
                    <td className="num">{(o.kalshi.noPrice * 100).toFixed(1)}¢</td>
                    <td className={`num ${o.yDiff >= 0.05 ? 'num-red font-semibold' : ''}`}>{(o.yDiff * 100).toFixed(1)}¢</td>
                    <td className={`num ${o.nDiff >= 0.05 ? 'num-red font-semibold' : ''}`}>{(o.nDiff * 100).toFixed(1)}¢</td>
                    <td>
                      <a href={o.poly.url} target="_blank" rel="noopener noreferrer" className="link mr-1">P</a>
                      <a href={o.kalshi.url} target="_blank" rel="noopener noreferrer" className="link">K</a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-[--border] bg-white px-4 py-1 text-[10px] text-[--text-muted] flex justify-between">
        <span>⚠️ Cross-platform requires matching resolution rules</span>
        <span>Auto-refresh: 60s</span>
      </footer>
    </div>
  );
}

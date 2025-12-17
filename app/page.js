'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

export default function Home() {
  const [polymarketData, setPolymarketData] = useState([]);
  const [kalshiData, setKalshiData] = useState([]);
  const [loading, setLoading] = useState({ polymarket: true, kalshi: true });
  const [lastUpdate, setLastUpdate] = useState(null);
  const [activeTab, setActiveTab] = useState('matched');
  const [budget, setBudget] = useState(100);
  const [feeRate, setFeeRate] = useState({ polymarket: 1, kalshi: 1 });
  const [minROI, setMinROI] = useState(0);
  const [minSimilarity, setMinSimilarity] = useState(35);
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

  // 키워드 추출 (더 관대하게)
  const extractKeywords = useCallback((text) => {
    if (!text) return new Set();
    const stopwords = new Set([
      'will', 'the', 'a', 'an', 'be', 'is', 'are', 'to', 'of', 'in', 'for', 'on', 
      'by', 'or', 'and', 'before', 'after', 'this', 'that', 'next', 'first', 'who', 
      'what', 'when', 'where', 'how', 'than', 'more', 'less', 'any', 'have', 'has',
      'does', 'do', 'did', 'been', 'being', 'their', 'there', 'they', 'them', 'its'
    ]);
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.has(w));
    return new Set(words);
  }, []);

  // Jaccard 유사도
  const calcSimilarity = useCallback((kw1, kw2) => {
    if (!kw1.size || !kw2.size) return 0;
    const intersection = [...kw1].filter(w => kw2.has(w));
    const union = new Set([...kw1, ...kw2]);
    return (intersection.length / union.size) * 100;
  }, []);

  // 공통 키워드 찾기
  const findCommonKeywords = useCallback((kw1, kw2) => {
    return [...kw1].filter(w => kw2.has(w));
  }, []);

  // 모든 매칭된 마켓 찾기
  const matchedMarkets = useMemo(() => {
    const matches = [];
    const seen = new Set();

    for (const p of polymarketData) {
      const pKw = extractKeywords(p.question);
      
      for (const k of kalshiData) {
        const kKw = extractKeywords(k.question);
        const similarity = calcSimilarity(pKw, kKw);
        const commonKw = findCommonKeywords(pKw, kKw);
        
        // 매칭 조건: 유사도 기준 이상 OR 공통 키워드 3개 이상
        if (similarity >= minSimilarity || commonKw.length >= 3) {
          const key = [p.id, k.id].sort().join('-');
          if (seen.has(key)) continue;
          seen.add(key);

          const pFee = feeRate.polymarket / 100;
          const kFee = feeRate.kalshi / 100;
          
          const strat1Total = p.yesPrice * (1 + pFee) + k.noPrice * (1 + kFee);
          const strat2Total = p.noPrice * (1 + pFee) + k.yesPrice * (1 + kFee);
          
          const hasArb = strat1Total < 1 || strat2Total < 1;
          const bestTotal = Math.min(strat1Total, strat2Total);
          const bestStrat = strat1Total < strat2Total ? 1 : 2;
          const roi = hasArb ? (1 / bestTotal - 1) * 100 : 0;

          matches.push({
            id: key,
            similarity,
            commonKeywords: commonKw,
            poly: p,
            kalshi: k,
            pYes: p.yesPrice,
            pNo: p.noPrice,
            kYes: k.yesPrice,
            kNo: k.noPrice,
            yesDiff: Math.abs(p.yesPrice - k.yesPrice),
            strat1Total,
            strat2Total,
            hasArb,
            bestStrat,
            bestTotal,
            roi,
            profit: hasArb ? budget * (1 / bestTotal - 1) : 0
          });
        }
      }
    }
    
    return matches.sort((a, b) => b.similarity - a.similarity);
  }, [polymarketData, kalshiData, feeRate, budget, minSimilarity, extractKeywords, calcSimilarity, findCommonKeywords]);

  // 차익거래 기회만
  const arbOpportunities = useMemo(() => {
    return matchedMarkets
      .filter(m => m.hasArb && m.roi >= minROI)
      .sort((a, b) => b.roi - a.roi);
  }, [matchedMarkets, minROI]);

  // Single platform arbs
  const intraArbs = useMemo(() => {
    const opps = [];
    
    polymarketData.forEach(m => {
      const fee = feeRate.polymarket / 100;
      const yP = Math.ceil(m.yesPrice * (1 + fee) * 100) / 100;
      const nP = Math.ceil(m.noPrice * (1 + fee) * 100) / 100;
      const t = yP + nP;
      if (t < 1 && (1/t - 1) * 100 >= minROI) {
        opps.push({ ...m, platform: 'poly', yP, nP, total: t, roi: (1/t-1)*100, profit: budget*(1/t-1) });
      }
    });

    kalshiData.forEach(m => {
      const fee = feeRate.kalshi / 100;
      const yP = Math.ceil(m.yesPrice * (1 + fee) * 100) / 100;
      const nP = Math.ceil(m.noPrice * (1 + fee) * 100) / 100;
      const t = yP + nP;
      if (t < 1 && (1/t - 1) * 100 >= minROI) {
        opps.push({ ...m, platform: 'kalshi', yP, nP, total: t, roi: (1/t-1)*100, profit: budget*(1/t-1) });
      }
    });

    return opps.sort((a, b) => b.roi - a.roi);
  }, [polymarketData, kalshiData, feeRate, minROI, budget]);

  // 필터링
  const filtered = {
    matched: matchedMarkets.filter(m => !searchQuery || 
      m.poly.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.kalshi.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.commonKeywords.some(kw => kw.includes(searchQuery.toLowerCase()))),
    arb: arbOpportunities.filter(m => !searchQuery || 
      m.poly.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.kalshi.question.toLowerCase().includes(searchQuery.toLowerCase())),
    intra: intraArbs.filter(m => !searchQuery || m.question.toLowerCase().includes(searchQuery.toLowerCase())),
  };

  const isLoading = loading.polymarket || loading.kalshi;

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <header className="border-b border-[--border] bg-[--bg-alt] px-4 py-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-sm">Polymarket × Kalshi Scanner</h1>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="badge badge-poly">POLY {polymarketData.length}</span>
            <span className="badge badge-kalshi">KALSHI {kalshiData.length}</span>
            {lastUpdate && <span className="text-[--text-muted]"><span className="status-dot status-live"></span>{lastUpdate.toLocaleTimeString()}</span>}
            <button onClick={fetchAll} disabled={isLoading} className="btn-sm btn-primary">{isLoading ? '...' : '↻'}</button>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="border-b border-[--border] px-4 py-2 flex items-center gap-3 flex-wrap bg-white">
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-[--text-muted]">Budget $</label>
          <input type="number" value={budget} onChange={e => setBudget(Number(e.target.value) || 100)} className="input-sm w-16" />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-[--text-muted]">P.Fee %</label>
          <input type="number" step="0.1" value={feeRate.polymarket} onChange={e => setFeeRate(p => ({ ...p, polymarket: Number(e.target.value) || 0 }))} className="input-sm w-12" />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-[--text-muted]">K.Fee %</label>
          <input type="number" step="0.1" value={feeRate.kalshi} onChange={e => setFeeRate(p => ({ ...p, kalshi: Number(e.target.value) || 0 }))} className="input-sm w-12" />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-[--text-muted]">Min Sim %</label>
          <input type="number" step="5" value={minSimilarity} onChange={e => setMinSimilarity(Number(e.target.value) || 30)} className="input-sm w-12" />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-[--text-muted]">Min ROI %</label>
          <input type="number" step="0.1" value={minROI} onChange={e => setMinROI(Number(e.target.value) || 0)} className="input-sm w-12" />
        </div>
        <div className="flex items-center gap-1 flex-1 max-w-xs">
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." className="input-sm flex-1" />
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar px-2">
        <button className={`tab-btn ${activeTab === 'matched' ? 'active' : ''}`} onClick={() => setActiveTab('matched')}>
          🔗 Matched ({filtered.matched.length})
        </button>
        <button className={`tab-btn ${activeTab === 'arb' ? 'active' : ''}`} onClick={() => setActiveTab('arb')}>
          🎯 Arbitrage ({filtered.arb.length})
        </button>
        <button className={`tab-btn ${activeTab === 'intra' ? 'active' : ''}`} onClick={() => setActiveTab('intra')}>
          📊 Single ({filtered.intra.length})
        </button>
      </div>

      {/* Content */}
      <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
        
        {/* Matched Markets */}
        {activeTab === 'matched' && (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:25}}>#</th>
                <th style={{width:45}}>Sim</th>
                <th>Polymarket</th>
                <th style={{width:50}}>P.Yes</th>
                <th>Kalshi</th>
                <th style={{width:50}}>K.Yes</th>
                <th style={{width:45}}>Δ</th>
                <th style={{width:150}}>Common Keywords</th>
                <th style={{width:80}}>Arb?</th>
                <th style={{width:35}}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.matched.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-[--text-muted]">
                  {isLoading ? 'Loading...' : 'No matched markets found. Try lowering Min Sim %.'}
                </td></tr>
              ) : filtered.matched.map((m, i) => (
                <tr key={m.id} className={m.hasArb ? 'arb-row' : ''}>
                  <td className="text-[--text-muted] text-[10px]">{i + 1}</td>
                  <td><span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">{m.similarity.toFixed(0)}%</span></td>
                  <td>
                    <div className="q-text text-[11px]" title={m.poly.question}>{m.poly.question}</div>
                  </td>
                  <td className="num">{(m.pYes * 100).toFixed(0)}¢</td>
                  <td>
                    <div className="q-text text-[11px]" title={m.kalshi.question}>{m.kalshi.question}</div>
                  </td>
                  <td className="num">{(m.kYes * 100).toFixed(0)}¢</td>
                  <td className={`num font-medium ${m.yesDiff >= 0.1 ? 'num-red' : m.yesDiff >= 0.05 ? 'text-orange-500' : 'text-[--text-muted]'}`}>
                    {(m.yesDiff * 100).toFixed(0)}¢
                  </td>
                  <td className="text-[9px] text-[--text-muted]">
                    {m.commonKeywords.slice(0, 5).join(', ')}
                  </td>
                  <td className="text-[10px]">
                    {m.hasArb ? (
                      <span className="text-green-600 font-medium">✓ {m.roi.toFixed(1)}%</span>
                    ) : (
                      <span className="text-[--text-muted]">—</span>
                    )}
                  </td>
                  <td>
                    <a href={m.poly.url} target="_blank" rel="noopener noreferrer" className="link mr-1">P</a>
                    <a href={m.kalshi.url} target="_blank" rel="noopener noreferrer" className="link">K</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Arbitrage */}
        {activeTab === 'arb' && (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:25}}>#</th>
                <th style={{width:40}}>Sim</th>
                <th>Polymarket</th>
                <th style={{width:50}}>Price</th>
                <th>Kalshi</th>
                <th style={{width:50}}>Price</th>
                <th style={{width:70}}>Strategy</th>
                <th style={{width:55}}>Total</th>
                <th style={{width:50}}>ROI</th>
                <th style={{width:55}}>Profit</th>
                <th style={{width:35}}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.arb.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8 text-[--text-muted]">
                  {isLoading ? 'Loading...' : 'No arbitrage opportunities'}
                </td></tr>
              ) : filtered.arb.map((m, i) => {
                const isPYesKNo = m.bestStrat === 1;
                return (
                  <tr key={m.id} className="arb-row">
                    <td><span className="badge badge-rank">{i + 1}</span></td>
                    <td><span className="text-[9px] px-1 py-0.5 bg-blue-50 text-blue-700 rounded">{m.similarity.toFixed(0)}%</span></td>
                    <td>
                      <div className="flex items-center gap-1">
                        <span className={`badge ${isPYesKNo ? 'badge-poly' : 'bg-purple-100 text-purple-700'}`}>
                          {isPYesKNo ? 'Y' : 'N'}
                        </span>
                        <span className="q-text text-[11px]" title={m.poly.question}>{m.poly.question}</span>
                      </div>
                    </td>
                    <td className="num num-purple">{((isPYesKNo ? m.pYes : m.pNo) * 100).toFixed(0)}¢</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <span className={`badge ${isPYesKNo ? 'bg-green-100 text-green-700' : 'badge-kalshi'}`}>
                          {isPYesKNo ? 'N' : 'Y'}
                        </span>
                        <span className="q-text text-[11px]" title={m.kalshi.question}>{m.kalshi.question}</span>
                      </div>
                    </td>
                    <td className="num num-teal">{((isPYesKNo ? m.kNo : m.kYes) * 100).toFixed(0)}¢</td>
                    <td className="text-[9px] text-[--text-muted]">
                      P.{isPYesKNo ? 'Yes' : 'No'}+K.{isPYesKNo ? 'No' : 'Yes'}
                    </td>
                    <td className="num num-blue font-medium">{m.bestTotal.toFixed(4)}</td>
                    <td><span className="badge badge-roi">+{m.roi.toFixed(1)}%</span></td>
                    <td className="num num-green font-semibold">+${m.profit.toFixed(2)}</td>
                    <td>
                      <a href={m.poly.url} target="_blank" rel="noopener noreferrer" className="link mr-1">P</a>
                      <a href={m.kalshi.url} target="_blank" rel="noopener noreferrer" className="link">K</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Single Platform */}
        {activeTab === 'intra' && (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:25}}>#</th>
                <th style={{width:50}}>Platform</th>
                <th>Market</th>
                <th style={{width:55}}>Yes&apos;</th>
                <th style={{width:55}}>No&apos;</th>
                <th style={{width:55}}>Total</th>
                <th style={{width:50}}>ROI</th>
                <th style={{width:55}}>Profit</th>
                <th style={{width:35}}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.intra.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-[--text-muted]">No single-platform arbitrage</td></tr>
              ) : filtered.intra.map((m, i) => (
                <tr key={`${m.platform}-${m.id}`} className="arb-row">
                  <td><span className="badge badge-rank">{i + 1}</span></td>
                  <td><span className={`badge badge-${m.platform}`}>{m.platform.toUpperCase()}</span></td>
                  <td><span className="q-text" title={m.question}>{m.question}</span></td>
                  <td className="num num-green">{m.yP.toFixed(3)}</td>
                  <td className="num num-red">{m.nP.toFixed(3)}</td>
                  <td className="num num-blue">{m.total.toFixed(4)}</td>
                  <td><span className="badge badge-roi">+{m.roi.toFixed(1)}%</span></td>
                  <td className="num num-green font-semibold">+${m.profit.toFixed(2)}</td>
                  <td><a href={m.url} target="_blank" rel="noopener noreferrer" className="link">→</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-[--border] bg-white px-4 py-1 text-[10px] text-[--text-muted] flex justify-between">
        <span>⚠️ Verify resolution rules match before trading • Lower &quot;Min Sim %&quot; to find more matches</span>
        <span>Auto-refresh: 60s</span>
      </footer>
    </div>
  );
}

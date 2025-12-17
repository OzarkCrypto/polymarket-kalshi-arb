'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

const KNOWN_PERSONS = [
  'kevin warsh', 'kevin hassett', 'arthur laffer', 'larry kudlow', 'judy shelton',
  'ron paul', 'chamath palihapitiya', 'howard lutnick', 'scott bessent', 'elon musk',
  'chris waller', 'christopher waller', 'michelle bowman', 'roger ferguson', 'rick rieder',
  'jerome powell', 'philip jefferson', 'lorie logan', 'james bullard', 'david malpass',
  'stephen miran', 'janet yellen', 'bill pulte', 'david zervos', 'marc sumerlin',
  'larry lindsey', 'donald trump', 'joe biden', 'kamala harris', 'pete hegseth',
  'marco rubio', 'tulsi gabbard', 'pam bondi', 'rfk', 'robert kennedy',
  'sam bankman-fried', 'sbf', 'julian assange', 'edward snowden', 'kristi noem',
  'naftali bennett', 'benny gantz', 'yair lapid'
];

const EVENT_PATTERNS = {
  'fed_chair': ['fed chair', 'federal reserve chair', 'fed chairman'],
  'prime_minister': ['prime minister', 'pm of', 'next pm'],
  'ceo': ['ceo of', 'chief executive'],
  'pardon': ['pardon'],
  'visit': ['visit'],
  'leave_cabinet': ['leave the trump administration', 'leave trump cabinet', 'first to leave', 'leave the trump cabinet'],
};

export default function Home() {
  const [polymarketData, setPolymarketData] = useState([]);
  const [kalshiData, setKalshiData] = useState([]);
  const [loading, setLoading] = useState({ polymarket: true, kalshi: true });
  const [lastUpdate, setLastUpdate] = useState(null);
  const [activeTab, setActiveTab] = useState('matched');
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

  const extractPerson = useCallback((text) => {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const person of KNOWN_PERSONS) {
      if (lower.includes(person)) return person;
    }
    return null;
  }, []);

  const extractEventType = useCallback((text) => {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const [type, patterns] of Object.entries(EVENT_PATTERNS)) {
      for (const pattern of patterns) {
        if (lower.includes(pattern)) return type;
      }
    }
    return null;
  }, []);

  const isExactMatch = useCallback((polyQ, kalshiQ) => {
    const polyPerson = extractPerson(polyQ);
    const kalshiPerson = extractPerson(kalshiQ);
    
    if (!polyPerson || !kalshiPerson) return { match: false };
    
    // 이름 변형 처리 (Chris/Christopher Waller)
    const normalizeName = (name) => {
      return name.replace('christopher', 'chris').replace('robert f. kennedy', 'rfk');
    };
    
    if (normalizeName(polyPerson) !== normalizeName(kalshiPerson)) return { match: false };
    
    const polyEvent = extractEventType(polyQ);
    const kalshiEvent = extractEventType(kalshiQ);
    
    if (!polyEvent || !kalshiEvent) return { match: false };
    if (polyEvent !== kalshiEvent) return { match: false };
    
    return { match: true, person: polyPerson, eventType: polyEvent };
  }, [extractPerson, extractEventType]);

  const crossArbs = useMemo(() => {
    const opps = [];
    
    for (const p of polymarketData) {
      for (const k of kalshiData) {
        const matchResult = isExactMatch(p.question, k.question);
        
        if (matchResult.match) {
          const pFee = feeRate.polymarket / 100;
          const kFee = feeRate.kalshi / 100;
          const pY = p.yesPrice * (1 + pFee);
          const pN = p.noPrice * (1 + pFee);
          const kY = k.yesPrice * (1 + kFee);
          const kN = k.noPrice * (1 + kFee);

          const t1 = pY + kN;
          if (t1 < 1) {
            const roi = (1 / t1 - 1) * 100;
            if (roi >= minROI) {
              opps.push({
                id: `${p.id}-${k.id}-1`, person: matchResult.person, eventType: matchResult.eventType,
                poly: p, kalshi: k, strat: 'P.Yes + K.No', pPos: 'YES', kPos: 'NO',
                pPrice: pY, kPrice: kN, pRaw: p.yesPrice, kRaw: k.noPrice,
                total: t1, roi, profit: budget * (1 / t1 - 1),
                pAlloc: budget * pY / t1, kAlloc: budget * kN / t1, shares: budget / t1
              });
            }
          }

          const t2 = pN + kY;
          if (t2 < 1) {
            const roi = (1 / t2 - 1) * 100;
            if (roi >= minROI) {
              opps.push({
                id: `${p.id}-${k.id}-2`, person: matchResult.person, eventType: matchResult.eventType,
                poly: p, kalshi: k, strat: 'P.No + K.Yes', pPos: 'NO', kPos: 'YES',
                pPrice: pN, kPrice: kY, pRaw: p.noPrice, kRaw: k.yesPrice,
                total: t2, roi, profit: budget * (1 / t2 - 1),
                pAlloc: budget * pN / t2, kAlloc: budget * kY / t2, shares: budget / t2
              });
            }
          }
        }
      }
    }
    return opps.sort((a, b) => b.roi - a.roi);
  }, [polymarketData, kalshiData, feeRate, minROI, budget, isExactMatch]);

  const matchedMarkets = useMemo(() => {
    const matches = [];
    const seen = new Set();
    
    for (const p of polymarketData) {
      for (const k of kalshiData) {
        const matchResult = isExactMatch(p.question, k.question);
        
        if (matchResult.match) {
          const key = `${matchResult.person}-${matchResult.eventType}`;
          if (seen.has(key)) continue;
          seen.add(key);
          
          const pFee = feeRate.polymarket / 100;
          const kFee = feeRate.kalshi / 100;
          
          matches.push({
            id: `match-${p.id}-${k.id}`, person: matchResult.person, eventType: matchResult.eventType,
            poly: p, kalshi: k,
            pYes: p.yesPrice, pNo: p.noPrice, kYes: k.yesPrice, kNo: k.noPrice,
            yesDiff: Math.abs(p.yesPrice - k.yesPrice),
            strat1Total: p.yesPrice * (1 + pFee) + k.noPrice * (1 + kFee),
            strat2Total: p.noPrice * (1 + pFee) + k.yesPrice * (1 + kFee),
          });
        }
      }
    }
    return matches.sort((a, b) => b.yesDiff - a.yesDiff);
  }, [polymarketData, kalshiData, feeRate, isExactMatch]);

  const intraArbs = useMemo(() => {
    const opps = [];
    
    [...polymarketData, ...kalshiData].forEach(m => {
      const platform = m.platform || (polymarketData.includes(m) ? 'poly' : 'kalshi');
      const fee = platform === 'poly' ? feeRate.polymarket / 100 : feeRate.kalshi / 100;
      const yP = Math.ceil(m.yesPrice * (1 + fee) * 100) / 100;
      const nP = Math.ceil(m.noPrice * (1 + fee) * 100) / 100;
      const t = yP + nP;
      if (t < 1) {
        const roi = (1 / t - 1) * 100;
        if (roi >= minROI) {
          opps.push({ ...m, platform, yP, nP, total: t, roi, profit: budget * (1 / t - 1), shares: budget / t });
        }
      }
    });

    return opps.sort((a, b) => b.roi - a.roi);
  }, [polymarketData, kalshiData, feeRate, minROI, budget]);

  const filtered = {
    cross: crossArbs.filter(o => !searchQuery || o.person?.includes(searchQuery.toLowerCase()) || o.poly.question.toLowerCase().includes(searchQuery.toLowerCase())),
    matched: matchedMarkets.filter(o => !searchQuery || o.person?.includes(searchQuery.toLowerCase()) || o.poly.question.toLowerCase().includes(searchQuery.toLowerCase())),
    intra: intraArbs.filter(o => !searchQuery || o.question.toLowerCase().includes(searchQuery.toLowerCase())),
  };

  const isLoading = loading.polymarket || loading.kalshi;
  const formatEventType = (type) => ({ fed_chair: 'Fed Chair', prime_minister: 'PM', ceo: 'CEO', pardon: 'Pardon', visit: 'Visit', leave_cabinet: 'Cabinet Exit' }[type] || type);

  return (
    <div className="min-h-screen">
      <header className="border-b border-[--border] bg-[--bg-alt] px-4 py-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-sm">Polymarket × Kalshi Arb Scanner</h1>
            <span className="text-[10px] text-[--text-muted]">Person + Event Matching</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-1">
              <span className="badge badge-poly">POLY {polymarketData.length}</span>
              <span className="badge badge-kalshi">KALSHI {kalshiData.length}</span>
            </div>
            {lastUpdate && <span className="text-[--text-muted]"><span className="status-dot status-live"></span>{lastUpdate.toLocaleTimeString()}</span>}
            <button onClick={fetchAll} disabled={isLoading} className="btn-sm btn-primary">{isLoading ? '...' : '↻ Refresh'}</button>
          </div>
        </div>
      </header>

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
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="warsh, hassett..." className="input-sm flex-1" style={{ width: 'auto' }} />
        </div>
      </div>

      <div className="tab-bar px-2">
        <button className={`tab-btn ${activeTab === 'matched' ? 'active' : ''}`} onClick={() => setActiveTab('matched')}>🔗 Matched ({filtered.matched.length})</button>
        <button className={`tab-btn ${activeTab === 'cross' ? 'active' : ''}`} onClick={() => setActiveTab('cross')}>🎯 Arbitrage ({filtered.cross.length})</button>
        <button className={`tab-btn ${activeTab === 'intra' ? 'active' : ''}`} onClick={() => setActiveTab('intra')}>📊 Single ({filtered.intra.length})</button>
      </div>

      <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
        {activeTab === 'matched' && (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:30}}>#</th>
                <th style={{width:120}}>Person</th>
                <th style={{width:70}}>Event</th>
                <th>Polymarket</th>
                <th style={{width:55}}>P.Yes</th>
                <th>Kalshi</th>
                <th style={{width:55}}>K.Yes</th>
                <th style={{width:50}}>Δ</th>
                <th style={{width:100}}>Arb Check</th>
                <th style={{width:40}}>Links</th>
              </tr>
            </thead>
            <tbody>
              {filtered.matched.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-[--text-muted]">No matched markets found</td></tr>
              ) : filtered.matched.map((m, i) => (
                <tr key={m.id} className={m.strat1Total < 1 || m.strat2Total < 1 ? 'arb-row' : ''}>
                  <td className="text-[--text-muted]">{i + 1}</td>
                  <td className="font-medium capitalize text-[12px]">{m.person}</td>
                  <td><span className="text-[9px] px-1 py-0.5 bg-gray-100 rounded">{formatEventType(m.eventType)}</span></td>
                  <td><span className="q-text text-[11px]" title={m.poly.question}>{m.poly.question}</span></td>
                  <td className="num">{(m.pYes * 100).toFixed(0)}¢</td>
                  <td><span className="q-text text-[11px]" title={m.kalshi.question}>{m.kalshi.question}</span></td>
                  <td className="num">{(m.kYes * 100).toFixed(0)}¢</td>
                  <td className={`num font-semibold ${m.yesDiff >= 0.1 ? 'num-red' : m.yesDiff >= 0.05 ? 'text-orange-500' : ''}`}>{(m.yesDiff * 100).toFixed(0)}¢</td>
                  <td className="text-[10px]">
                    {m.strat1Total < 1 ? <span className="text-green-600 font-medium">✓ P.Y+K.N={m.strat1Total.toFixed(3)}</span>
                    : m.strat2Total < 1 ? <span className="text-green-600 font-medium">✓ P.N+K.Y={m.strat2Total.toFixed(3)}</span>
                    : <span className="text-[--text-muted]">—</span>}
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

        {activeTab === 'cross' && (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:30}}>#</th>
                <th style={{width:110}}>Person</th>
                <th style={{width:70}}>Event</th>
                <th style={{width:80}}>Strategy</th>
                <th style={{width:60}}>P.Price</th>
                <th style={{width:60}}>K.Price</th>
                <th style={{width:60}}>Total</th>
                <th style={{width:60}}>ROI</th>
                <th style={{width:60}}>Profit</th>
                <th style={{width:40}}>Links</th>
              </tr>
            </thead>
            <tbody>
              {filtered.cross.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-[--text-muted]">No arbitrage opportunities</td></tr>
              ) : filtered.cross.map((o, i) => (
                <tr key={o.id} className="arb-row cursor-pointer" onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                  <td><span className="badge badge-rank">{i + 1}</span></td>
                  <td className="font-medium capitalize text-[12px]">{o.person}</td>
                  <td><span className="text-[9px] px-1 py-0.5 bg-gray-100 rounded">{formatEventType(o.eventType)}</span></td>
                  <td className="text-[10px]"><span className="badge badge-poly">{o.pPos}</span>+<span className="badge badge-kalshi">{o.kPos}</span></td>
                  <td className="num num-purple">{o.pPrice.toFixed(3)}</td>
                  <td className="num num-teal">{o.kPrice.toFixed(3)}</td>
                  <td className="num num-blue">{o.total.toFixed(4)}</td>
                  <td><span className="badge badge-roi">+{o.roi.toFixed(1)}%</span></td>
                  <td className="num num-green font-semibold">+${o.profit.toFixed(2)}</td>
                  <td>
                    <a href={o.poly.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="link mr-1">P</a>
                    <a href={o.kalshi.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="link">K</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'intra' && (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:30}}>#</th>
                <th style={{width:55}}>Platform</th>
                <th>Market</th>
                <th style={{width:60}}>Yes&apos;</th>
                <th style={{width:60}}>No&apos;</th>
                <th style={{width:60}}>Total</th>
                <th style={{width:60}}>ROI</th>
                <th style={{width:60}}>Profit</th>
                <th style={{width:40}}>Link</th>
              </tr>
            </thead>
            <tbody>
              {filtered.intra.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-[--text-muted]">No single-platform arb</td></tr>
              ) : filtered.intra.map((o, i) => (
                <tr key={`${o.platform}-${o.id}`} className="arb-row">
                  <td><span className="badge badge-rank">{i + 1}</span></td>
                  <td><span className={`badge badge-${o.platform}`}>{o.platform.toUpperCase()}</span></td>
                  <td><span className="q-text" title={o.question}>{o.question}</span></td>
                  <td className="num num-green">{o.yP.toFixed(3)}</td>
                  <td className="num num-red">{o.nP.toFixed(3)}</td>
                  <td className="num num-blue">{o.total.toFixed(4)}</td>
                  <td><span className="badge badge-roi">+{o.roi.toFixed(1)}%</span></td>
                  <td className="num num-green font-semibold">+${o.profit.toFixed(2)}</td>
                  <td><a href={o.url} target="_blank" rel="noopener noreferrer" className="link">→</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <footer className="fixed bottom-0 left-0 right-0 border-t border-[--border] bg-white px-4 py-1 text-[10px] text-[--text-muted] flex justify-between">
        <span>⚠️ Verify resolution rules match before trading</span>
        <span>Matching: Person + Event Type | Auto-refresh: 60s</span>
      </footer>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

// 팀명 정규화 맵
const TEAM_ALIASES = {
  // NBA
  'oklahoma city thunder': 'oklahoma city', 'thunder': 'oklahoma city',
  'los angeles lakers': 'los angeles l', 'lakers': 'los angeles l',
  'los angeles clippers': 'los angeles c', 'clippers': 'los angeles c',
  'golden state warriors': 'golden state', 'warriors': 'golden state',
  'boston celtics': 'boston', 'celtics': 'boston',
  'new york knicks': 'new york', 'knicks': 'new york',
  'cleveland cavaliers': 'cleveland', 'cavaliers': 'cleveland', 'cavs': 'cleveland',
  'denver nuggets': 'denver', 'nuggets': 'denver',
  'houston rockets': 'houston', 'rockets': 'houston',
  'san antonio spurs': 'san antonio', 'spurs': 'san antonio',
  'detroit pistons': 'detroit', 'pistons': 'detroit',
  'miami heat': 'miami', 'heat': 'miami',
  'milwaukee bucks': 'milwaukee', 'bucks': 'milwaukee',
  'minnesota timberwolves': 'minnesota', 'timberwolves': 'minnesota',
  'orlando magic': 'orlando', 'magic': 'orlando',
  'philadelphia 76ers': 'philadelphia', '76ers': 'philadelphia', 'sixers': 'philadelphia',
  'phoenix suns': 'phoenix', 'suns': 'phoenix',
  'portland trail blazers': 'portland', 'trail blazers': 'portland', 'blazers': 'portland',
  'sacramento kings': 'sacramento', 'kings': 'sacramento',
  'toronto raptors': 'toronto', 'raptors': 'toronto',
  'indiana pacers': 'indiana', 'pacers': 'indiana',
  'memphis grizzlies': 'memphis', 'grizzlies': 'memphis',
  'new orleans pelicans': 'new orleans', 'pelicans': 'new orleans',
  'dallas mavericks': 'dallas', 'mavericks': 'dallas', 'mavs': 'dallas',
  'chicago bulls': 'chicago', 'bulls': 'chicago',
  'atlanta hawks': 'atlanta', 'hawks': 'atlanta',
  'brooklyn nets': 'brooklyn', 'nets': 'brooklyn',
  'charlotte hornets': 'charlotte', 'hornets': 'charlotte',
  'washington wizards': 'washington', 'wizards': 'washington',
  'utah jazz': 'utah', 'jazz': 'utah',
  // 리그명 정규화
  'nba finals': 'pro basketball finals',
  'nba championship': 'pro basketball finals',
  'pro basketball championship': 'pro basketball finals',
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

  // 텍스트 정규화 (최대한 동일하게 만들기)
  const normalize = useCallback((text) => {
    let norm = text.toLowerCase()
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"')
      .replace(/\?/g, '')
      .replace(/!/g, '')
      .replace(/,/g, ' ')
      .replace(/\./g, ' ')
      .replace(/-/g, ' ')
      .replace(/'/g, ' ')
      .replace(/"/g, ' ')
      .replace(/\$/g, ' ')
      .replace(/%/g, ' percent')
      .replace(/\s+/g, ' ')
      .trim();
    
    // 팀명/리그명 정규화 적용
    for (const [alias, normalized] of Object.entries(TEAM_ALIASES)) {
      norm = norm.replace(new RegExp(`\\b${alias}\\b`, 'gi'), normalized);
    }
    
    return norm;
  }, []);

  // 매우 적은 불용어만 제거 (핵심 단어는 모두 유지)
  const STOPWORDS = new Set([
    'will', 'the', 'a', 'an', 'be', 'is', 'are', 'to', 'of', 'in', 'for', 'on', 
    'by', 'or', 'and', 'before', 'this', 'that', 'next', 'any', 'its'
  ]);

  // 핵심 단어 추출
  const extractWords = useCallback((text) => {
    const norm = normalize(text);
    const words = norm.split(' ').filter(w => w.length > 1 && !STOPWORDS.has(w));
    return words;
  }, [normalize]);

  // 부정어 감지
  const hasNegation = useCallback((text) => {
    const norm = normalize(text);
    return /\bnot\b|n t\b|\bnever\b|\bno\b|\bwon t\b|\bfail\b|\brefuse\b/.test(norm);
  }, [normalize]);

  // Jaccard 유사도 (단어 배열 기준)
  const jaccard = useCallback((arr1, arr2) => {
    const set1 = new Set(arr1);
    const set2 = new Set(arr2);
    if (set1.size === 0 || set2.size === 0) return 0;
    const intersection = [...set1].filter(x => set2.has(x));
    const union = new Set([...set1, ...set2]);
    return intersection.length / union.size;
  }, []);

  // 순서 기반 유사도 (단어 순서도 고려)
  const sequenceSimilarity = useCallback((arr1, arr2) => {
    if (arr1.length === 0 || arr2.length === 0) return 0;
    
    // LCS (Longest Common Subsequence) 간단 버전
    let matches = 0;
    let lastIdx = -1;
    for (const word of arr1) {
      const idx = arr2.indexOf(word, lastIdx + 1);
      if (idx > lastIdx) {
        matches++;
        lastIdx = idx;
      }
    }
    return matches / Math.max(arr1.length, arr2.length);
  }, []);

  // 초엄격 매칭
  const isIdenticalMarket = useCallback((q1, q2) => {
    const words1 = extractWords(q1);
    const words2 = extractWords(q2);
    const neg1 = hasNegation(q1);
    const neg2 = hasNegation(q2);

    // 1. 부정어 불일치 → 즉시 거부
    if (neg1 !== neg2) {
      return { match: false, reason: 'negation' };
    }

    // 2. Jaccard 유사도 70% 이상 필수 (팀명 정규화 후)
    const jaccardSim = jaccard(words1, words2);
    if (jaccardSim < 0.7) {
      return { match: false, reason: 'jaccard', similarity: jaccardSim };
    }

    // 3. 순서 유사도 50% 이상 필수
    const seqSim = sequenceSimilarity(words1, words2);
    if (seqSim < 0.5) {
      return { match: false, reason: 'sequence', similarity: seqSim };
    }

    // 4. 최종 유사도 = (Jaccard + Sequence) / 2
    const finalSim = (jaccardSim + seqSim) / 2;

    return {
      match: true,
      similarity: finalSim,
      jaccardSim,
      seqSim,
      words1,
      words2
    };
  }, [extractWords, hasNegation, jaccard, sequenceSimilarity]);

  // 매칭된 마켓 찾기
  const matchedMarkets = useMemo(() => {
    const matches = [];
    const seen = new Set();

    for (const p of polymarketData) {
      for (const k of kalshiData) {
        const result = isIdenticalMarket(p.question, k.question);
        
        if (result.match) {
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
            similarity: result.similarity,
            jaccardSim: result.jaccardSim,
            seqSim: result.seqSim,
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
  }, [polymarketData, kalshiData, feeRate, budget, isIdenticalMarket]);

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

  const filtered = {
    matched: matchedMarkets.filter(m => !searchQuery || 
      m.poly.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.kalshi.question.toLowerCase().includes(searchQuery.toLowerCase())),
    arb: arbOpportunities.filter(m => !searchQuery || 
      m.poly.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.kalshi.question.toLowerCase().includes(searchQuery.toLowerCase())),
    intra: intraArbs.filter(m => !searchQuery || m.question.toLowerCase().includes(searchQuery.toLowerCase())),
  };

  const isLoading = loading.polymarket || loading.kalshi;

  return (
    <div className="min-h-screen pb-8">
      <header className="border-b border-[--border] bg-[--bg-alt] px-4 py-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-sm">Polymarket × Kalshi Scanner</h1>
            <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded font-medium">ULTRA STRICT: Jaccard ≥80% + Sequence ≥60%</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="badge badge-poly">POLY {polymarketData.length}</span>
            <span className="badge badge-kalshi">KALSHI {kalshiData.length}</span>
            {lastUpdate && <span className="text-[--text-muted]"><span className="status-dot status-live"></span>{lastUpdate.toLocaleTimeString()}</span>}
            <button onClick={fetchAll} disabled={isLoading} className="btn-sm btn-primary">{isLoading ? '...' : '↻'}</button>
          </div>
        </div>
      </header>

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
          <label className="text-[10px] text-[--text-muted]">Min ROI %</label>
          <input type="number" step="0.1" value={minROI} onChange={e => setMinROI(Number(e.target.value) || 0)} className="input-sm w-12" />
        </div>
        <div className="flex items-center gap-1 flex-1 max-w-xs">
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." className="input-sm flex-1" />
        </div>
      </div>

      <div className="tab-bar px-2">
        <button className={`tab-btn ${activeTab === 'matched' ? 'active' : ''}`} onClick={() => setActiveTab('matched')}>
          🔗 Identical Markets ({filtered.matched.length})
        </button>
        <button className={`tab-btn ${activeTab === 'arb' ? 'active' : ''}`} onClick={() => setActiveTab('arb')}>
          🎯 Arbitrage ({filtered.arb.length})
        </button>
        <button className={`tab-btn ${activeTab === 'intra' ? 'active' : ''}`} onClick={() => setActiveTab('intra')}>
          📊 Single ({filtered.intra.length})
        </button>
      </div>

      <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
        
        {activeTab === 'matched' && (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:25}}>#</th>
                <th style={{width:50}}>Match</th>
                <th>Polymarket</th>
                <th style={{width:50}}>P.Yes</th>
                <th>Kalshi</th>
                <th style={{width:50}}>K.Yes</th>
                <th style={{width:45}}>Δ</th>
                <th style={{width:80}}>Arb?</th>
                <th style={{width:35}}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.matched.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-[--text-muted]">
                  {isLoading ? 'Loading...' : 'No identical markets found (Jaccard ≥80% + Sequence ≥60% required)'}
                </td></tr>
              ) : filtered.matched.map((m, i) => (
                <tr key={m.id} className={m.hasArb ? 'arb-row' : ''}>
                  <td className="text-[--text-muted] text-[10px]">{i + 1}</td>
                  <td><span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">{(m.similarity * 100).toFixed(0)}%</span></td>
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

        {activeTab === 'arb' && (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:25}}>#</th>
                <th style={{width:45}}>Match</th>
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
                  {isLoading ? 'Loading...' : 'No arbitrage on identical markets'}
                </td></tr>
              ) : filtered.arb.map((m, i) => {
                const isPYesKNo = m.bestStrat === 1;
                return (
                  <tr key={m.id} className="arb-row">
                    <td><span className="badge badge-rank">{i + 1}</span></td>
                    <td><span className="text-[9px] px-1 py-0.5 bg-green-100 text-green-700 rounded">{(m.similarity * 100).toFixed(0)}%</span></td>
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

      <footer className="fixed bottom-0 left-0 right-0 border-t border-[--border] bg-white px-4 py-1 text-[10px] text-[--text-muted] flex justify-between">
        <span>⚠️ ULTRA STRICT: Jaccard ≥80% AND Sequence ≥60% AND No negation mismatch</span>
        <span>Auto-refresh: 60s</span>
      </footer>
    </div>
  );
}

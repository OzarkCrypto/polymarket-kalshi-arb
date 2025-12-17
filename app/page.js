'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

// 알려진 인물/엔티티
const KNOWN_ENTITIES = [
  // Fed Chair candidates
  'kevin warsh', 'kevin hassett', 'arthur laffer', 'larry kudlow', 'judy shelton',
  'ron paul', 'chamath palihapitiya', 'howard lutnick', 'scott bessent', 'elon musk',
  'chris waller', 'christopher waller', 'michelle bowman', 'roger ferguson', 'rick rieder',
  'jerome powell', 'philip jefferson', 'lorie logan', 'james bullard', 'david malpass',
  'stephen miran', 'janet yellen', 'bill pulte', 'david zervos', 'marc sumerlin', 'larry lindsey',
  // Politicians
  'donald trump', 'joe biden', 'kamala harris', 'pete hegseth', 'marco rubio', 
  'tulsi gabbard', 'pam bondi', 'robert kennedy', 'rfk', 'kristi noem', 'mike waltz',
  'lee zeldin', 'doug burgum', 'chris wright', 'elise stefanik', 'john ratcliffe',
  // Israel PM candidates
  'naftali bennett', 'benny gantz', 'yair lapid', 'benjamin netanyahu', 'itamar ben-gvir',
  // Pardon targets
  'sam bankman-fried', 'sbf', 'julian assange', 'edward snowden', 'steve bannon',
  'roger stone', 'bob menendez', 'derek chauvin', 'joe exotic',
  // Tech/Business
  'sundar pichai', 'tim cook', 'satya nadella', 'mark zuckerberg', 'jeff bezos',
  // Countries/Orgs
  'ukraine', 'russia', 'china', 'israel', 'iran', 'nato', 'bitcoin', 'ethereum',
];

// 이벤트 패턴 (더 확장)
const EVENT_PATTERNS = {
  'fed_chair': ['fed chair', 'federal reserve chair', 'next fed', 'nominate.*fed'],
  'prime_minister': ['prime minister', 'next pm'],
  'ceo': ['ceo', 'chief executive'],
  'pardon': ['pardon'],
  'visit': ['visit'],
  'leave_cabinet': ['leave.*administration', 'leave.*cabinet', 'first.*leave'],
  'resign': ['resign', 'step down', 'out as'],
  'impeach': ['impeach'],
  'recession': ['recession'],
  'rate_cut': ['rate cut', 'interest rate'],
  'price_target': ['reach \\$', 'hit \\$', 'price'],
  'election': ['election', 'elected', 'win.*election'],
  'ceasefire': ['ceasefire', 'peace deal'],
  'war': ['war', 'invasion', 'attack'],
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

  // 엔티티 추출 (복수 가능)
  const extractEntities = useCallback((text) => {
    if (!text) return [];
    const lower = text.toLowerCase();
    const found = [];
    for (const entity of KNOWN_ENTITIES) {
      if (lower.includes(entity)) {
        found.push(entity);
      }
    }
    return found;
  }, []);

  // 이벤트 유형 추출
  const extractEventType = useCallback((text) => {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const [type, patterns] of Object.entries(EVENT_PATTERNS)) {
      for (const pattern of patterns) {
        if (new RegExp(pattern).test(lower)) return type;
      }
    }
    return null;
  }, []);

  // 연도 추출
  const extractYear = useCallback((text) => {
    if (!text) return null;
    const match = text.match(/\b(202[4-9]|203[0-9])\b/);
    return match ? match[1] : null;
  }, []);

  // 핵심 키워드 추출
  const extractKeywords = useCallback((text) => {
    if (!text) return new Set();
    const stopwords = new Set(['will', 'the', 'a', 'an', 'be', 'is', 'are', 'to', 'of', 'in', 'for', 'on', 'by', 'or', 'and', 'before', 'after', 'this', 'that', 'next', 'first', 'who', 'what', 'when', 'where', 'how']);
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
    return new Set(words.filter(w => w.length > 2 && !stopwords.has(w)));
  }, []);

  // 매칭 점수 계산
  const calculateMatchScore = useCallback((polyQ, kalshiQ) => {
    const pEntities = extractEntities(polyQ);
    const kEntities = extractEntities(kalshiQ);
    const pEvent = extractEventType(polyQ);
    const kEvent = extractEventType(kalshiQ);
    const pYear = extractYear(polyQ);
    const kYear = extractYear(kalshiQ);
    const pKeywords = extractKeywords(polyQ);
    const kKeywords = extractKeywords(kalshiQ);

    let score = 0;
    let matchReason = [];

    // 1. 엔티티 매칭 (가장 중요)
    const commonEntities = pEntities.filter(e => {
      // Chris/Christopher Waller 같은 변형 처리
      const normalize = (s) => s.replace('christopher', 'chris').replace('robert f. kennedy', 'rfk');
      return kEntities.some(ke => normalize(e) === normalize(ke));
    });
    
    if (commonEntities.length > 0) {
      score += 40 * commonEntities.length;
      matchReason.push(`Entity: ${commonEntities.join(', ')}`);
    }

    // 2. 이벤트 유형 매칭
    if (pEvent && kEvent && pEvent === kEvent) {
      score += 30;
      matchReason.push(`Event: ${pEvent}`);
    }

    // 3. 연도 매칭 (있으면 같아야 함)
    if (pYear && kYear) {
      if (pYear === kYear) {
        score += 20;
        matchReason.push(`Year: ${pYear}`);
      } else {
        score -= 50; // 연도가 다르면 큰 페널티
      }
    }

    // 4. 키워드 유사도
    const intersection = [...pKeywords].filter(w => kKeywords.has(w));
    const union = new Set([...pKeywords, ...kKeywords]);
    const jaccard = intersection.length / union.size;
    
    if (jaccard >= 0.3) {
      score += Math.round(jaccard * 30);
      if (jaccard >= 0.5) matchReason.push(`Keywords: ${Math.round(jaccard * 100)}%`);
    }

    // 최소 점수 기준
    const isMatch = score >= 50 && (commonEntities.length > 0 || (pEvent && kEvent && pEvent === kEvent));

    return {
      score,
      isMatch,
      reason: matchReason.join(' | '),
      entities: commonEntities,
      eventType: pEvent || kEvent,
      year: pYear || kYear
    };
  }, [extractEntities, extractEventType, extractYear, extractKeywords]);

  // 모든 매칭된 마켓 찾기
  const matchedMarkets = useMemo(() => {
    const matches = [];
    const seen = new Set();

    for (const p of polymarketData) {
      for (const k of kalshiData) {
        const result = calculateMatchScore(p.question, k.question);
        
        if (result.isMatch) {
          // 중복 방지 (같은 마켓 쌍이 여러 번 나오지 않도록)
          const key = [p.id, k.id].sort().join('-');
          if (seen.has(key)) continue;
          seen.add(key);

          const pFee = feeRate.polymarket / 100;
          const kFee = feeRate.kalshi / 100;
          
          // 두 전략의 합계 계산
          const strat1Total = p.yesPrice * (1 + pFee) + k.noPrice * (1 + kFee);  // P.Yes + K.No
          const strat2Total = p.noPrice * (1 + pFee) + k.yesPrice * (1 + kFee);  // P.No + K.Yes
          
          const hasArb = strat1Total < 1 || strat2Total < 1;
          const bestStrat = strat1Total < strat2Total ? 1 : 2;
          const bestTotal = Math.min(strat1Total, strat2Total);
          const roi = bestTotal < 1 ? (1 / bestTotal - 1) * 100 : 0;

          matches.push({
            id: key,
            score: result.score,
            reason: result.reason,
            entities: result.entities,
            eventType: result.eventType,
            year: result.year,
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
    
    return matches.sort((a, b) => b.score - a.score);
  }, [polymarketData, kalshiData, feeRate, budget, calculateMatchScore]);

  // 차익거래 기회만 필터
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
      m.entities?.some(e => e.includes(searchQuery.toLowerCase()))),
    arb: arbOpportunities.filter(m => !searchQuery || 
      m.poly.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.kalshi.question.toLowerCase().includes(searchQuery.toLowerCase())),
    intra: intraArbs.filter(m => !searchQuery || m.question.toLowerCase().includes(searchQuery.toLowerCase())),
  };

  const isLoading = loading.polymarket || loading.kalshi;

  const formatEventType = (type) => {
    const map = {
      fed_chair: 'Fed Chair', prime_minister: 'PM', ceo: 'CEO', pardon: 'Pardon',
      visit: 'Visit', leave_cabinet: 'Cabinet', resign: 'Resign', impeach: 'Impeach',
      recession: 'Recession', rate_cut: 'Rate', price_target: 'Price', election: 'Election',
      ceasefire: 'Peace', war: 'War'
    };
    return map[type] || type || '—';
  };

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
      <div className="border-b border-[--border] px-4 py-2 flex items-center gap-4 flex-wrap bg-white">
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-[--text-muted]">Budget $</label>
          <input type="number" value={budget} onChange={e => setBudget(Number(e.target.value) || 100)} className="input-sm" />
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

      {/* Tabs */}
      <div className="tab-bar px-2">
        <button className={`tab-btn ${activeTab === 'matched' ? 'active' : ''}`} onClick={() => setActiveTab('matched')}>
          🔗 Matched Markets ({filtered.matched.length})
        </button>
        <button className={`tab-btn ${activeTab === 'arb' ? 'active' : ''}`} onClick={() => setActiveTab('arb')}>
          🎯 Arbitrage ({filtered.arb.length})
        </button>
        <button className={`tab-btn ${activeTab === 'intra' ? 'active' : ''}`} onClick={() => setActiveTab('intra')}>
          📊 Single Platform ({filtered.intra.length})
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
                <th style={{width:50}}>Score</th>
                <th>Polymarket</th>
                <th style={{width:50}}>P.Yes</th>
                <th>Kalshi</th>
                <th style={{width:50}}>K.Yes</th>
                <th style={{width:45}}>Δ</th>
                <th style={{width:70}}>Event</th>
                <th style={{width:90}}>Arb?</th>
                <th style={{width:35}}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.matched.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-[--text-muted]">
                  {isLoading ? 'Loading...' : 'No matched markets found'}
                </td></tr>
              ) : filtered.matched.map((m, i) => (
                <tr key={m.id} className={m.hasArb ? 'arb-row' : ''}>
                  <td className="text-[--text-muted] text-[10px]">{i + 1}</td>
                  <td><span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{m.score}</span></td>
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
                  <td><span className="text-[9px] px-1 py-0.5 bg-gray-100 rounded">{formatEventType(m.eventType)}</span></td>
                  <td className="text-[10px]">
                    {m.hasArb ? (
                      <span className="text-green-600 font-medium">
                        ✓ {m.roi.toFixed(1)}% ROI
                      </span>
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

        {/* Arbitrage Opportunities */}
        {activeTab === 'arb' && (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:25}}>#</th>
                <th>Polymarket</th>
                <th style={{width:50}}>Price</th>
                <th>Kalshi</th>
                <th style={{width:50}}>Price</th>
                <th style={{width:70}}>Strategy</th>
                <th style={{width:55}}>Total</th>
                <th style={{width:55}}>ROI</th>
                <th style={{width:60}}>Profit</th>
                <th style={{width:35}}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.arb.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-[--text-muted]">
                  {isLoading ? 'Loading...' : 'No arbitrage opportunities found'}
                </td></tr>
              ) : filtered.arb.map((m, i) => {
                const isPYesKNo = m.bestStrat === 1;
                return (
                  <tr key={m.id} className="arb-row cursor-pointer" onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}>
                    <td><span className="badge badge-rank">{i + 1}</span></td>
                    <td>
                      <div className="flex items-center gap-1">
                        <span className={`badge ${isPYesKNo ? 'badge-poly' : 'bg-purple-100 text-purple-700'}`}>
                          {isPYesKNo ? 'YES' : 'NO'}
                        </span>
                        <span className="q-text text-[11px]" title={m.poly.question}>{m.poly.question}</span>
                      </div>
                    </td>
                    <td className="num num-purple">{((isPYesKNo ? m.pYes : m.pNo) * 100).toFixed(0)}¢</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <span className={`badge ${isPYesKNo ? 'bg-green-100 text-green-700' : 'badge-kalshi'}`}>
                          {isPYesKNo ? 'NO' : 'YES'}
                        </span>
                        <span className="q-text text-[11px]" title={m.kalshi.question}>{m.kalshi.question}</span>
                      </div>
                    </td>
                    <td className="num num-teal">{((isPYesKNo ? m.kNo : m.kYes) * 100).toFixed(0)}¢</td>
                    <td className="text-[10px] text-[--text-muted]">
                      P.{isPYesKNo ? 'Yes' : 'No'} + K.{isPYesKNo ? 'No' : 'Yes'}
                    </td>
                    <td className="num num-blue font-medium">{m.bestTotal.toFixed(4)}</td>
                    <td><span className="badge badge-roi">+{m.roi.toFixed(1)}%</span></td>
                    <td className="num num-green font-semibold">+${m.profit.toFixed(2)}</td>
                    <td>
                      <a href={m.poly.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="link mr-1">P</a>
                      <a href={m.kalshi.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="link">K</a>
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
                <th style={{width:55}}>ROI</th>
                <th style={{width:60}}>Profit</th>
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
        <span>⚠️ Always verify resolution rules match before trading</span>
        <span>Auto-refresh: 60s</span>
      </footer>
    </div>
  );
}

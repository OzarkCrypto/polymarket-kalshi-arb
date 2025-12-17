'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

// 알려진 엔티티들
const PERSONS = [
  'trump', 'biden', 'harris', 'obama', 'putin', 'zelenskyy', 'zelensky', 'xi jinping', 'xi',
  'netanyahu', 'kim jong un', 'kim', 'modi', 'macron', 'scholz', 'trudeau', 'starmer',
  'musk', 'elon', 'bezos', 'zuckerberg', 'altman', 'nadella', 'cook', 'pichai',
  'kevin warsh', 'warsh', 'kevin hassett', 'hassett', 'jerome powell', 'powell', 'yellen',
  'pete hegseth', 'hegseth', 'marco rubio', 'rubio', 'tulsi gabbard', 'gabbard',
  'pam bondi', 'bondi', 'rfk', 'kennedy', 'kristi noem', 'noem', 'vivek', 'ramaswamy',
  'desantis', 'newsom', 'vance', 'walz', 'pelosi', 'mcconnell', 'schumer',
  'lewandowski', 'ronaldo', 'messi', 'lebron', 'curry', 'mahomes', 'swift', 'beyonce',
  'sam bankman-fried', 'sbf', 'cz', 'changpeng zhao', 'gary gensler', 'gensler',
  'assange', 'snowden', 'bannon', 'gaetz', 'hunter biden'
];

const COUNTRIES_ORGS = [
  'us', 'usa', 'united states', 'america', 'russia', 'ukraine', 'china', 'israel', 
  'iran', 'north korea', 'gaza', 'taiwan', 'nato', 'eu', 'european union',
  'fed', 'federal reserve', 'sec', 'doj', 'fbi', 'cia', 'pentagon',
  'openai', 'anthropic', 'google', 'meta', 'microsoft', 'apple', 'amazon', 'nvidia',
  'tesla', 'spacex', 'twitter', 'x', 'tiktok', 'bytedance', 'bitcoin', 'btc', 'ethereum', 'eth'
];

// 액션 패턴들
const ACTION_PATTERNS = {
  'nominate': ['nominate', 'announce.*as', 'name.*as', 'pick.*for', 'choose.*as'],
  'meet': ['meet', 'meeting', 'summit', 'talks with', 'meet with'],
  'visit': ['visit'],
  'resign': ['resign', 'step down', 'leave', 'out as', 'depart'],
  'fire': ['fire', 'remove', 'oust', 'dismiss'],
  'win': ['win', 'wins', 'victory', 'champion', 'beat'],
  'lose': ['lose', 'loses', 'defeat', 'eliminated'],
  'reach_price': ['reach \\$', 'hit \\$', 'above \\$', 'below \\$', 'at \\$'],
  'acquire': ['acquire', 'buy', 'purchase', 'merger', 'takeover'],
  'ban': ['ban', 'prohibit', 'block', 'sanction'],
  'pardon': ['pardon'],
  'indict': ['indict', 'charge', 'prosecute', 'arrest'],
  'die': ['die', 'death', 'pass away', 'assassinate'],
  'war': ['war', 'invasion', 'attack', 'strike', 'bomb'],
  'ceasefire': ['ceasefire', 'peace', 'truce', 'armistice'],
  'recession': ['recession'],
  'rate': ['rate cut', 'rate hike', 'interest rate'],
  'ipo': ['ipo', 'go public', 'listing'],
  'launch': ['launch', 'release', 'announce', 'unveil'],
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

  // 텍스트 정규화
  const normalize = useCallback((text) => {
    return text.toLowerCase()
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"')
      .replace(/[^a-z0-9\s$%]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  // 주체(인물/조직) 추출
  const extractSubjects = useCallback((text) => {
    const norm = normalize(text);
    const found = new Set();
    
    // 인물 찾기
    for (const person of PERSONS) {
      if (norm.includes(person)) {
        // 정규화된 이름 사용 (zelensky -> zelenskyy, elon -> musk 등)
        const normalized = person
          .replace('zelensky', 'zelenskyy')
          .replace('elon', 'musk')
          .replace(/^(kevin )?warsh$/, 'warsh')
          .replace(/^(kevin )?hassett$/, 'hassett');
        found.add(normalized);
      }
    }
    
    // 조직/국가 찾기
    for (const org of COUNTRIES_ORGS) {
      if (norm.includes(org)) {
        const normalized = org
          .replace('united states', 'usa')
          .replace('america', 'usa')
          .replace('federal reserve', 'fed');
        found.add(normalized);
      }
    }
    
    return [...found].sort();
  }, [normalize]);

  // 액션 추출
  const extractAction = useCallback((text) => {
    const norm = normalize(text);
    
    for (const [action, patterns] of Object.entries(ACTION_PATTERNS)) {
      for (const pattern of patterns) {
        if (new RegExp(pattern, 'i').test(norm)) {
          return action;
        }
      }
    }
    return null;
  }, [normalize]);

  // 연도/시간 추출
  const extractTimeframe = useCallback((text) => {
    const norm = normalize(text);
    
    // 연도 찾기
    const yearMatch = norm.match(/\b(202[4-9]|203[0-9])\b/);
    if (yearMatch) return yearMatch[1];
    
    // "before/by [date]" 패턴
    const beforeMatch = norm.match(/before\s+(\w+\s+\d+)/);
    if (beforeMatch) return `before_${beforeMatch[1]}`;
    
    return null;
  }, [normalize]);

  // 부정어 감지
  const hasNegation = useCallback((text) => {
    const norm = normalize(text);
    const negations = [' not ', " won't ", " won't ", ' never ', ' no ', ' refuse ', ' fail '];
    return negations.some(neg => norm.includes(neg));
  }, [normalize]);

  // 목적어/대상 추출 (Fed Chair, CEO, PM 등)
  const extractTarget = useCallback((text) => {
    const norm = normalize(text);
    
    const targets = [
      { pattern: /fed chair|federal reserve chair/i, value: 'fed_chair' },
      { pattern: /prime minister|pm of/i, value: 'pm' },
      { pattern: /ceo of (\w+)/i, value: 'ceo' },
      { pattern: /president of/i, value: 'president' },
      { pattern: /super bowl/i, value: 'super_bowl' },
      { pattern: /world series/i, value: 'world_series' },
      { pattern: /championship/i, value: 'championship' },
      { pattern: /\$[\d,]+/i, value: 'price_target' },
    ];
    
    for (const { pattern, value } of targets) {
      if (pattern.test(norm)) return value;
    }
    return null;
  }, [normalize]);

  // 정밀 매칭 함수
  const isExactMatch = useCallback((q1, q2) => {
    const subj1 = extractSubjects(q1);
    const subj2 = extractSubjects(q2);
    const action1 = extractAction(q1);
    const action2 = extractAction(q2);
    const time1 = extractTimeframe(q1);
    const time2 = extractTimeframe(q2);
    const neg1 = hasNegation(q1);
    const neg2 = hasNegation(q2);
    const target1 = extractTarget(q1);
    const target2 = extractTarget(q2);

    // 디버그 정보
    const debug = {
      subj1, subj2, action1, action2, time1, time2, neg1, neg2, target1, target2
    };

    // 1. 주체가 정확히 같아야 함 (가장 중요)
    if (subj1.length === 0 || subj2.length === 0) return { match: false, reason: 'no_subject' };
    if (subj1.join(',') !== subj2.join(',')) return { match: false, reason: 'subject_mismatch', debug };

    // 2. 액션이 같아야 함
    if (action1 && action2 && action1 !== action2) return { match: false, reason: 'action_mismatch', debug };

    // 3. 부정어가 같아야 함 (둘 다 긍정 or 둘 다 부정)
    if (neg1 !== neg2) return { match: false, reason: 'negation_mismatch', debug };

    // 4. 시간이 있으면 같아야 함
    if (time1 && time2 && time1 !== time2) return { match: false, reason: 'time_mismatch', debug };

    // 5. 타겟이 있으면 같아야 함
    if (target1 && target2 && target1 !== target2) return { match: false, reason: 'target_mismatch', debug };

    // 매칭 성공
    return {
      match: true,
      subjects: subj1,
      action: action1 || action2,
      timeframe: time1 || time2,
      target: target1 || target2,
      debug
    };
  }, [extractSubjects, extractAction, extractTimeframe, hasNegation, extractTarget]);

  // 매칭된 마켓 찾기
  const matchedMarkets = useMemo(() => {
    const matches = [];
    const seen = new Set();

    for (const p of polymarketData) {
      for (const k of kalshiData) {
        const result = isExactMatch(p.question, k.question);
        
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
            subjects: result.subjects,
            action: result.action,
            timeframe: result.timeframe,
            target: result.target,
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
    
    return matches.sort((a, b) => b.yesDiff - a.yesDiff);
  }, [polymarketData, kalshiData, feeRate, budget, isExactMatch]);

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
      m.subjects?.some(s => s.includes(searchQuery.toLowerCase()))),
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
            <span className="text-[10px] text-[--text-muted]">Strict Matching: Subject + Action + Time</span>
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
                <th style={{width:120}}>Subject</th>
                <th style={{width:70}}>Action</th>
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
                <tr><td colSpan={10} className="text-center py-8 text-[--text-muted]">
                  {isLoading ? 'Loading...' : 'No exact matches found. Markets must have same subject, action, and timeframe.'}
                </td></tr>
              ) : filtered.matched.map((m, i) => (
                <tr key={m.id} className={m.hasArb ? 'arb-row' : ''}>
                  <td className="text-[--text-muted] text-[10px]">{i + 1}</td>
                  <td className="text-[11px] font-medium capitalize">{m.subjects?.join(', ')}</td>
                  <td><span className="text-[9px] px-1 py-0.5 bg-blue-50 text-blue-700 rounded">{m.action || '—'}</span></td>
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

        {/* Arbitrage */}
        {activeTab === 'arb' && (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:25}}>#</th>
                <th style={{width:100}}>Subject</th>
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
                    <td className="text-[11px] font-medium capitalize">{m.subjects?.join(', ')}</td>
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
        <span>⚠️ Strict matching: Same subject + action + timeframe required</span>
        <span>Auto-refresh: 60s</span>
      </footer>
    </div>
  );
}

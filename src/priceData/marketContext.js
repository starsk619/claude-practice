/**
 * analyst가 종목을 "고르기 전에" 참고할 수 있는 실제 시세/밸류에이션/변동성 데이터를 만든다.
 *
 * 기존 enrichPicksWithPriceData는 analyst가 이미 정한 picks에 시세를 "장식"으로 붙이는
 * 용도였는데(표시만 되고 판단에는 못 쓰임), 이 모듈은 그 반대로 analyst 호출 "전에"
 * 오늘 뉴스에 언급된 종목들의 데이터를 미리 모아서 판단 근거로 프롬프트에 넣기 위한 것이다.
 * Gemini를 추가로 호출하지 않으므로(할당량에 영향 없음) 요약 1번 + 분석 1번 구조는 그대로 유지된다.
 */
import { findMentionedCompanies } from './candidateExtractor.js';
import { fetchPriceInfo } from './yahooFinance.js';
import { fetchValuationInfo } from './naverValuation.js';
import { findTicker } from './tickerLookup.js';
import { CORE_WATCHLIST_NAMES, CORE_WATCHLIST_OVERRIDES } from './watchlist.js';

/**
 * 오늘 뉴스에서 이미 찾은 종목과 겹치지 않는 핵심 관심 종목들을 후보로 추가한다.
 * 뉴스 언급이 없으므로 mentionCount는 0으로 표시해서, 프롬프트에서 "뉴스 때문이 아니라
 * 상시 관심 종목이라 포함됨"을 구분할 수 있게 한다.
 * @param {Set<string>} existingCodes
 */
function buildWatchlistCandidates(existingCodes) {
  const candidates = [];
  for (const name of CORE_WATCHLIST_NAMES) {
    const ticker = findTicker(name);
    if (!ticker || existingCodes.has(ticker.code)) continue;
    candidates.push({ name, code: ticker.code, suffix: ticker.suffix, mentionCount: 0 });
    existingCodes.add(ticker.code);
  }
  for (const override of CORE_WATCHLIST_OVERRIDES) {
    if (existingCodes.has(override.code)) continue;
    candidates.push({ ...override, mentionCount: 0 });
    existingCodes.add(override.code);
  }
  return candidates;
}

/**
 * @typedef {Object} MarketContextEntry
 * @property {string} name
 * @property {string} code
 * @property {number} mentionCount - 오늘 뉴스에서 언급된 횟수(관심도 힌트)
 * @property {number} currentPrice
 * @property {number|null} changePercent
 * @property {number|null} high52w
 * @property {number|null} low52w
 * @property {string} currency
 * @property {number|null} annualizedVolatilityPercent
 * @property {number|null} per
 * @property {number|null} forwardPer
 * @property {number|null} pbr
 * @property {number|null} dividendYield
 */

/**
 * @param {import('../types.js').NewsItem[]} newsItems
 * @param {{ maxCandidates?: number }} [options]
 * @returns {Promise<MarketContextEntry[]>} 실제 가격 조회에 성공한 종목만 포함(실패한 건 제외)
 */
export async function buildMarketContext(newsItems, options = {}) {
  const newsCandidates = findMentionedCompanies(newsItems, options);
  const existingCodes = new Set(newsCandidates.map((c) => c.code));
  const watchlistCandidates = buildWatchlistCandidates(existingCodes);
  const candidates = [...newsCandidates, ...watchlistCandidates];
  if (!candidates.length) return [];

  const entries = await Promise.all(
    candidates.map(async (candidate) => {
      const [priceInfo, valuation] = await Promise.all([
        fetchPriceInfo(candidate.code, candidate.suffix),
        fetchValuationInfo(candidate.code),
      ]);
      if (!priceInfo) return null; // 가격 조회 자체가 안 되면 판단 근거로 쓸 게 없어 제외

      return {
        name: candidate.name,
        code: candidate.code,
        mentionCount: candidate.mentionCount,
        ...priceInfo,
        ...(valuation ?? {}),
      };
    })
  );

  return entries.filter((entry) => entry !== null);
}

/**
 * 판단 이력(pick-history)을 실제 주가와 대사해서 "1주일 전 / 1개월 전 판단이 맞았는지" 검증한다.
 *
 * "매수 고려"는 그 이후 주가가 올랐으면 적중, "주의"는 그 이후 주가가 내렸으면 적중으로 본다
 * (원했던 방향으로 움직였는지가 기준). "관망"은 방향성 판단이 아니라서 집계에서 제외한다.
 * marketContext에 이미 오늘자로 조회해둔 종목이 있으면 재사용하고(중복 조회 방지 - 카드 시세
 * 중복 조회 버그를 고칠 때와 같은 원칙), 없는 종목만 새로 조회한다.
 */
import { findTicker } from '../priceData/tickerLookup.js';
import { fetchPriceInfo } from '../priceData/yahooFinance.js';

const HORIZONS = [
  { key: 'oneWeek', label: '1주일', targetDays: 7, toleranceDays: 2 },
  { key: 'oneMonth', label: '1개월', targetDays: 30, toleranceDays: 5 },
];

const SCORABLE_RATINGS = new Set(['매수 고려', '주의']);

function daysBetween(a, b) {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * history 중 targetDays 전과 가장 가까운(허용오차 이내) 항목 하나를 찾는다. 허용오차 안에
 * 여러 개가 있으면 targetDays에 가장 가까운 것을 고른다.
 * @param {import('./index.js').PickHistoryEntry[]} history
 * @param {Date} now
 * @param {number} targetDays
 * @param {number} toleranceDays
 * @returns {import('./index.js').PickHistoryEntry | null}
 */
function findClosestEntry(history, now, targetDays, toleranceDays) {
  let best = null;
  let bestDiff = Infinity;
  for (const entry of history) {
    const entryDate = new Date(entry?.generatedAt);
    if (Number.isNaN(entryDate.getTime())) continue;
    const diffFromTarget = Math.abs(daysBetween(now, entryDate) - targetDays);
    if (diffFromTarget > toleranceDays) continue;
    if (diffFromTarget < bestDiff) {
      bestDiff = diffFromTarget;
      best = entry;
    }
  }
  return best;
}

/**
 * @param {import('./index.js').PickHistoryPick} pick
 * @param {Map<string, import('../priceData/marketContext.js').MarketContextEntry>} contextByCode
 * @returns {Promise<{ name: string, rating: string, returnPercent: number, hit: boolean } | null>}
 */
async function scorePick(pick, contextByCode) {
  if (!SCORABLE_RATINGS.has(pick?.rating) || typeof pick?.price !== 'number' || pick.price === 0) {
    return null;
  }

  const ticker = findTicker(pick.name);
  if (!ticker) return null;

  const cached = contextByCode.get(ticker.code);
  const currentPrice = cached ? cached.currentPrice : (await fetchPriceInfo(ticker.code, ticker.suffix))?.currentPrice;
  if (typeof currentPrice !== 'number') return null;

  const returnPercent = Math.round(((currentPrice - pick.price) / pick.price) * 10000) / 100;
  const hit = pick.rating === '매수 고려' ? returnPercent > 0 : returnPercent < 0;
  return { name: pick.name, rating: pick.rating, returnPercent, hit };
}

/**
 * @typedef {Object} TrackRecordStat
 * @property {string} label
 * @property {string} asOfDate
 * @property {number} count
 * @property {number} hits
 * @property {number} hitRatePercent
 * @property {number} avgReturnPercent
 * @property {Array<{ name: string, rating: string, returnPercent: number, hit: boolean }>} details
 */

/**
 * @param {import('./index.js').PickHistoryEntry[]} [history]
 * @param {import('../priceData/marketContext.js').MarketContextEntry[]} [marketContext]
 * @returns {Promise<{ oneWeek: TrackRecordStat|null, oneMonth: TrackRecordStat|null }>}
 */
export async function computeTrackRecord(history, marketContext = []) {
  const list = Array.isArray(history) ? history : [];
  const now = new Date();
  const contextByCode = new Map(marketContext.map((entry) => [entry.code, entry]));

  const result = {};
  for (const horizon of HORIZONS) {
    const entry = findClosestEntry(list, now, horizon.targetDays, horizon.toleranceDays);
    if (!entry) {
      result[horizon.key] = null;
      continue;
    }

    const scored = await Promise.all((entry.picks ?? []).map((pick) => scorePick(pick, contextByCode)));
    const details = scored.filter((d) => d !== null);
    if (!details.length) {
      result[horizon.key] = null;
      continue;
    }

    const hits = details.filter((d) => d.hit).length;
    const avgReturnPercent =
      Math.round((details.reduce((sum, d) => sum + d.returnPercent, 0) / details.length) * 100) / 100;

    result[horizon.key] = {
      label: horizon.label,
      asOfDate: entry.generatedAt,
      count: details.length,
      hits,
      hitRatePercent: Math.round((hits / details.length) * 100),
      avgReturnPercent,
      details,
    };
  }

  return result;
}

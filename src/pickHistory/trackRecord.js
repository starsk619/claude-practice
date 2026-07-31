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

// computeRatingPerformance(자기 보정용 집계)에서 쓰는 기준.
const MIN_AGE_DAYS = 3; // 최소 이 정도는 지나야 "결과가 어느 정도 드러났다"고 보고 집계 대상에 포함
const MIN_SAMPLE_SIZE = 10; // 등급별 표본이 이보다 적으면 아직 근거로 쓰기엔 부족하다고 보고 null 반환

// scorePick에서 쓰는 기준. pick.price(판단 당시 raw 현재가)와 지금의 raw 현재가를 그대로
// 비교하는데, 그 사이에 액면분할이 있었으면(priceData의 52주 고저/등락률에서 이미 겪은 것과
// 같은 원인) 며칠~한 달 만에 -80~-90% 같은 터무니없는 수익률이 나올 수 있다. adjclose처럼
// 과거 시점의 pick.price를 사후에 보정할 방법이 없으므로(당시 분할 비율을 모름), 이상치를
// 걸러내는 방식으로 방어한다. 아무리 변동성이 큰 대형주라도 1주~1개월 만에 이 폭을 넘는
// 수익률은 실제 시세 변동보다는 분할 등 데이터 불일치일 가능성이 훨씬 크다고 보고 제외한다.
const MAX_PLAUSIBLE_RETURN_PERCENT = 80;

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
  if (Math.abs(returnPercent) > MAX_PLAUSIBLE_RETURN_PERCENT) {
    console.warn(
      `[pickHistory] "${pick.name}" 수익률 ${returnPercent.toFixed(2)}%는 비현실적으로 커서(액면분할 등 데이터 불일치 가능성) 트랙레코드 집계에서 제외`
    );
    return null;
  }

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

/**
 * @typedef {Object} RatingPerformanceStat
 * @property {number} count
 * @property {number} hits
 * @property {number} hitRatePercent
 * @property {number} avgReturnPercent
 */

/**
 * 판단 유형(rating)별 누적 성과를 집계한다. computeTrackRecord가 "가장 가까운 판단 1건"만
 * 보는 것과 달리, 표본을 늘리기 위해 MIN_AGE_DAYS 이상 지난 판단을 전부(여러 날짜에 걸쳐)
 * 스코어링해서 등급별로 묶는다. 판단 시점부터 경과일이 제각각이라 "정확히 N일 후 수익률"은
 * 아니지만, "이 등급이 실제로 방향을 맞히는 경향이 있는지"를 보는 용도로는 충분하다.
 *
 * 이 결과는 analyst 프롬프트에 "자기 보정" 참고 자료로 제공된다(src/analyst/userPrompt.js).
 * 다만 모델이 이걸 실제로 판단에 반영한다는 보장은 없다 — 프롬프트에 데이터를 준다고 모델이
 * 자동으로 그걸 반영하는 게 아니라는 건 이 프로젝트에서 이미 한 번 겪은 문제라(일 변동성 인용
 * 지시 추가 사례, docs/analyst.md 참고), systemPrompt.js에 명시적 지시를 함께 추가해야 한다.
 *
 * @param {import('./index.js').PickHistoryEntry[]} [history]
 * @param {import('../priceData/marketContext.js').MarketContextEntry[]} [marketContext]
 * @returns {Promise<Object<string, RatingPerformanceStat|null>>} rating -> 통계(표본 부족하면 null)
 */
export async function computeRatingPerformance(history, marketContext = []) {
  const list = Array.isArray(history) ? history : [];
  const now = new Date();
  const contextByCode = new Map(marketContext.map((entry) => [entry.code, entry]));

  const eligibleEntries = list.filter((entry) => {
    const entryDate = new Date(entry?.generatedAt);
    return !Number.isNaN(entryDate.getTime()) && daysBetween(now, entryDate) >= MIN_AGE_DAYS;
  });

  const allScored = (
    await Promise.all(
      eligibleEntries.flatMap((entry) => (entry.picks ?? []).map((pick) => scorePick(pick, contextByCode)))
    )
  ).filter((d) => d !== null);

  const result = {};
  for (const rating of SCORABLE_RATINGS) {
    const subset = allScored.filter((d) => d.rating === rating);
    if (subset.length < MIN_SAMPLE_SIZE) {
      result[rating] = null;
      continue;
    }

    const hits = subset.filter((d) => d.hit).length;
    result[rating] = {
      count: subset.length,
      hits,
      hitRatePercent: Math.round((hits / subset.length) * 100),
      avgReturnPercent: Math.round((subset.reduce((sum, d) => sum + d.returnPercent, 0) / subset.length) * 100) / 100,
    };
  }

  return result;
}

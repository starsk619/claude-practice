/**
 * Yahoo Finance 비공식 차트 API로 현재가/등락률/52주 범위 + 과거 일별 종가 기반
 * 연환산 변동성을 조회한다.
 *
 * - 무료, API 키 불필요. 다만 비공식 API라 예고 없이 스펙이 바뀌거나 막힐 수 있다
 *   (실패 시 null을 반환하고 예외를 던지지 않는다 - 호출부에서 "가격 정보 없음"으로 처리).
 * - 한국 종목은 종목코드 뒤에 시장 접미사가 붙는다: 코스피 "005930.KS", 코스닥 "035720.KQ".
 * - range=3mo&interval=1d를 붙이면 같은 응답에 meta(현재가 등)와 과거 일별 종가가 함께 와서,
 *   API 호출 한 번으로 가격 정보 + 변동성 계산 재료를 동시에 얻는다.
 */

const CHART_API_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const HISTORY_RANGE = '3mo';
const HISTORY_INTERVAL = '1d';
const TRADING_DAYS_PER_YEAR = 252;

/**
 * 일별 종가 배열로 연환산 변동성(%)을 계산한다 (일별 로그수익률의 표준편차 × sqrt(252) × 100).
 * @param {Array<number|null>} closes
 * @returns {number | null}
 */
function computeAnnualizedVolatilityPercent(closes) {
  const valid = (closes ?? []).filter((c) => typeof c === 'number' && c > 0);
  if (valid.length < 10) return null; // 너무 적은 데이터로 계산하면 신뢰도가 낮음

  const logReturns = [];
  for (let i = 1; i < valid.length; i++) {
    logReturns.push(Math.log(valid[i] / valid[i - 1]));
  }

  const mean = logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;
  const variance =
    logReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (logReturns.length - 1);
  const dailyStdDev = Math.sqrt(variance);

  return Math.round(dailyStdDev * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100 * 100) / 100;
}

/**
 * @param {string} code - 종목코드 (국내는 6자리 KRX 코드, 해외 상장은 티커 그대로 예: "CPNG")
 * @param {string | null} [suffix] - 'KS'(코스피) | 'KQ'(코스닥) | 'KN'(코넥스, 사실상 미지원).
 *   해외 상장 종목처럼 국가 접미사가 없는 경우 null/빈 값을 넘기면 종목코드 그대로 조회한다.
 * @returns {Promise<{
 *   currentPrice: number, changePercent: number|null, high52w: number|null, low52w: number|null,
 *   currency: string, annualizedVolatilityPercent: number|null
 * } | null>}
 */
export async function fetchPriceInfo(code, suffix) {
  if (!code) return null;

  const symbol = suffix ? `${code}.${suffix}` : code;
  try {
    const res = await fetch(
      `${CHART_API_BASE}${symbol}?range=${HISTORY_RANGE}&interval=${HISTORY_INTERVAL}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) {
      console.warn(`[priceData] "${symbol}" 가격 조회 실패: HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number') {
      return null;
    }

    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose ?? meta.previousClose;
    const changePercent =
      typeof previousClose === 'number' && previousClose !== 0
        ? ((currentPrice - previousClose) / previousClose) * 100
        : null;

    const closes = result?.indicators?.quote?.[0]?.close;

    return {
      currentPrice,
      changePercent: changePercent !== null ? Math.round(changePercent * 100) / 100 : null,
      high52w: meta.fiftyTwoWeekHigh ?? null,
      low52w: meta.fiftyTwoWeekLow ?? null,
      currency: meta.currency ?? 'KRW',
      annualizedVolatilityPercent: computeAnnualizedVolatilityPercent(closes),
    };
  } catch (error) {
    console.warn(`[priceData] "${symbol}" 가격 조회 중 오류:`, error?.message ?? error);
    return null;
  }
}

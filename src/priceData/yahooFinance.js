/**
 * Yahoo Finance 비공식 차트 API로 현재가/등락률/52주 범위를 조회한다.
 *
 * - 무료, API 키 불필요. 다만 비공식 API라 예고 없이 스펙이 바뀌거나 막힐 수 있다
 *   (실패 시 null을 반환하고 예외를 던지지 않는다 - 호출부에서 "가격 정보 없음"으로 처리).
 * - 한국 종목은 종목코드 뒤에 시장 접미사가 붙는다: 코스피 "005930.KS", 코스닥 "035720.KQ".
 */

const CHART_API_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';

/**
 * @param {string} code - 6자리 종목코드
 * @param {string} suffix - 'KS'(코스피) | 'KQ'(코스닥) | 'KN'(코넥스, 사실상 미지원)
 * @returns {Promise<{ currentPrice: number, changePercent: number, high52w: number, low52w: number, currency: string } | null>}
 */
export async function fetchPriceInfo(code, suffix) {
  if (!code || !suffix) return null;

  const symbol = `${code}.${suffix}`;
  try {
    const res = await fetch(`${CHART_API_BASE}${symbol}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) {
      console.warn(`[priceData] "${symbol}" 가격 조회 실패: HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number') {
      return null;
    }

    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose ?? meta.previousClose;
    const changePercent =
      typeof previousClose === 'number' && previousClose !== 0
        ? ((currentPrice - previousClose) / previousClose) * 100
        : null;

    return {
      currentPrice,
      changePercent: changePercent !== null ? Math.round(changePercent * 100) / 100 : null,
      high52w: meta.fiftyTwoWeekHigh ?? null,
      low52w: meta.fiftyTwoWeekLow ?? null,
      currency: meta.currency ?? 'KRW',
    };
  } catch (error) {
    console.warn(`[priceData] "${symbol}" 가격 조회 중 오류:`, error?.message ?? error);
    return null;
  }
}

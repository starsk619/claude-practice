/**
 * 원/달러 환율 컨텍스트.
 *
 * Yahoo Finance 차트 API는 개별 종목뿐 아니라 통화쌍도 "KRW=X"(달러 -> 원) 같은 티커로
 * 동일하게 제공한다. 새 API 연동 없이 기존 fetchPriceInfo(code, suffix)를 그대로
 * 재사용하면 현재가/전일대비 등락률/52주 레인지를 종목과 같은 방식으로 얻을 수 있다.
 *
 * 수출 비중이 큰 종목(반도체/자동차/조선)의 실적, 외국인 자금 유출입(marketContext의
 * foreignOwnershipRate와 직결)에 영향을 주는 거시 배경 지표라 리포트 최상단에 노출한다.
 */
import { fetchPriceInfo } from './yahooFinance.js';

const USD_KRW_TICKER = 'KRW=X';

/**
 * @typedef {Object} FxContext
 * @property {number} currentPrice - 원/달러 환율(1달러당 원)
 * @property {number|null} changePercent - 등락률(%). 비교 기준일은 previousCloseLabel 참고
 * @property {string|null} previousCloseLabel - "전일대비" 또는 "N/D 종가 대비"(휴장일 건너뜀)
 * @property {number|null} high52w
 * @property {number|null} low52w
 */

/**
 * @returns {Promise<FxContext | null>} 조회 실패 시 null(파이프라인은 계속 진행)
 */
export async function fetchFxContext() {
  const info = await fetchPriceInfo(USD_KRW_TICKER, null);
  if (!info) return null;

  const { currentPrice, changePercent, previousCloseLabel, high52w, low52w } = info;
  return { currentPrice, changePercent, previousCloseLabel, high52w, low52w };
}

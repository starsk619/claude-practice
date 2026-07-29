/**
 * priceData 모듈 진입점.
 *
 * 책임: analyst가 만든 StockPick[]에, 실제 주가 정보(현재가/등락률/52주 범위)를 붙인다.
 * "뉴스가 이미 주가에 반영됐는지" 감을 잡을 수 있게 하기 위한 보완 데이터 — 뉴스 텍스트만
 * 보고 판단하던 기존 analyst 결과의 가장 큰 약점을 메운다.
 *
 * 종목명 -> 종목코드 매핑(tickerLookup)과 가격 조회(yahooFinance) 둘 다 실패할 수 있는
 * 외부 의존성이라, 실패해도 pick.priceInfo를 null로 두고 파이프라인 전체는 계속 진행한다.
 */
import { findTicker } from './tickerLookup.js';
import { fetchPriceInfo } from './yahooFinance.js';

/**
 * @param {import('../types.js').StockPick[]} [picks]
 * @param {import('./marketContext.js').MarketContextEntry[]} [marketContext] - analyst 호출
 *   "전"에 이미 조회해둔 시세 스냅샷. 여기 있는 종목은 다시 fetch하지 않고 그대로 재사용한다
 *   (분석 전/후 두 번 조회하면 그 사이 실시간 가격이 바뀌어 리포트 한 카드 안에 "현재가"가
 *   두 개로 다르게 찍히는 문제가 있었음).
 * @returns {Promise<import('../types.js').StockPick[]>} priceInfo가 채워진 picks (원본은 변경하지 않음)
 */
export async function enrichPicksWithPriceData(picks, marketContext = []) {
  const list = Array.isArray(picks) ? picks : [];
  const contextByCode = new Map(marketContext.map((entry) => [entry.code, entry]));

  return Promise.all(
    list.map(async (pick) => {
      const ticker = findTicker(pick?.name);
      if (!ticker) {
        return { ...pick, priceInfo: null };
      }

      const cached = contextByCode.get(ticker.code);
      if (cached) {
        const { currentPrice, changePercent, high52w, low52w, currency, annualizedVolatilityPercent } = cached;
        return {
          ...pick,
          priceInfo: { currentPrice, changePercent, high52w, low52w, currency, annualizedVolatilityPercent },
        };
      }

      const priceInfo = await fetchPriceInfo(ticker.code, ticker.suffix);
      return { ...pick, priceInfo };
    })
  );
}

export default enrichPicksWithPriceData;

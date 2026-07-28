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
 * @returns {Promise<import('../types.js').StockPick[]>} priceInfo가 채워진 picks (원본은 변경하지 않음)
 */
export async function enrichPicksWithPriceData(picks) {
  const list = Array.isArray(picks) ? picks : [];

  return Promise.all(
    list.map(async (pick) => {
      const ticker = findTicker(pick?.name);
      if (!ticker) {
        return { ...pick, priceInfo: null };
      }
      const priceInfo = await fetchPriceInfo(ticker.code, ticker.suffix);
      return { ...pick, priceInfo };
    })
  );
}

export default enrichPicksWithPriceData;

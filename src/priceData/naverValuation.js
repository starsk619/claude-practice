/**
 * 네이버 금융 비공식 API로 PER/PBR/EPS/BPS 등 밸류에이션 지표를 조회한다.
 *
 * Yahoo Finance의 quoteSummary(PER 등 제공)는 최근 인증(Crumb) 없이는 막혀있어서,
 * 국내 종목에 한해 네이버 금융에서 대신 가져온다. 무료, 키 불필요, 비공식 API라
 * 실패할 수 있음(호출부에서 null로 안전하게 처리).
 */

const INTEGRATION_API_BASE = 'https://m.stock.naver.com/api/stock/';

/**
 * "17.78배", "12,372원", "0.76%" 같은 한글 단위가 붙은 문자열을 숫자로 변환한다.
 * "1,286조 1,813억"처럼 조/억 단위가 섞인 큰 숫자(시가총액)는 지원하지 않는다(사용처 없음).
 * @param {string} [raw]
 * @returns {number | null}
 */
function parseKoreanNumber(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, '').replace(/배|원|%/g, '').trim();
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

/**
 * @param {string} code - 6자리 종목코드 (코스피/코스닥만 해당, 해외 종목은 지원 안 함)
 * @returns {Promise<{ per: number|null, forwardPer: number|null, eps: number|null, pbr: number|null, bps: number|null, dividendYield: number|null } | null>}
 */
export async function fetchValuationInfo(code) {
  if (!code) return null;

  try {
    const res = await fetch(`${INTEGRATION_API_BASE}${code}/integration`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) {
      console.warn(`[priceData] "${code}" 밸류에이션 조회 실패: HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    const totalInfos = json?.totalInfos;
    if (!Array.isArray(totalInfos)) return null;

    const byCode = Object.fromEntries(totalInfos.map((item) => [item.code, item.value]));

    return {
      per: parseKoreanNumber(byCode.per),
      forwardPer: parseKoreanNumber(byCode.cnsPer),
      eps: parseKoreanNumber(byCode.eps),
      pbr: parseKoreanNumber(byCode.pbr),
      bps: parseKoreanNumber(byCode.bps),
      dividendYield: parseKoreanNumber(byCode.dividendYieldRatio),
    };
  } catch (error) {
    console.warn(`[priceData] "${code}" 밸류에이션 조회 중 오류:`, error?.message ?? error);
    return null;
  }
}

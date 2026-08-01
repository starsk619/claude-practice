/**
 * Yahoo Finance 비공식 차트 API로 현재가/등락률/52주 범위 + 과거 일별 종가 기반
 * 연환산 변동성을 조회한다.
 *
 * - 무료, API 키 불필요. 다만 비공식 API라 예고 없이 스펙이 바뀌거나 막힐 수 있다
 *   (실패 시 null을 반환하고 예외를 던지지 않는다 - 호출부에서 "가격 정보 없음"으로 처리).
 * - 한국 종목은 종목코드 뒤에 시장 접미사가 붙는다: 코스피 "005930.KS", 코스닥 "035720.KQ".
 * - range=1y&interval=1d를 붙이면 같은 응답에 meta(현재가 등)와 1년치 일별 종가가 함께 와서,
 *   API 호출 한 번으로 가격 정보 + 52주 고저 + 변동성 계산 재료를 동시에 얻는다.
 * - meta.fiftyTwoWeekHigh/Low, meta.chartPreviousClose는 비인증 요청에서 신뢰할 수 없는
 *   경우가 있어(0으로 오거나 액면분할/유상증자 보정이 안 됨) 쓰지 않고, 직접 받아온 종가
 *   배열에서 계산한다. 등락률/52주 고저/변동성 전부 액면분할·배당을 보정한 adjclose를
 *   기준으로 계산하고, 코스피/코스닥 상하한가(±30%)를 넘는 값은 기업행위/데이터 오류로
 *   보고 이상치로 제외한다.
 * - "전일 종가"가 정확히 어느 거래일인지는 가격(근사치 비교)이 아니라 result.timestamp
 *   (일별 종가 각각의 실제 날짜)로 판정한다. 주말/공휴일처럼 오늘이 휴장일이면 currentPrice가
 *   과거 종가 배열의 마지막 값과 우연히 같아지는데, 이때 가격만 보고 "오늘자 데이터"라고
 *   오판하면 실제로는 이틀 전 거래일과 비교하면서 "전일대비"라고 잘못 표시하는 문제가 있었다
 *   (예: 토요일에 실행하면 금요일 종가를 두 번째로 최근 거래일의 종가와 비교해버림). 그래서
 *   previousClose가 정말 "어제(오늘의 KST 날짜 - 1일)"인지도 함께 판정해서, 아니라면
 *   "N/D 종가 대비"처럼 실제 기준일을 명시하는 라벨을 함께 반환한다.
 */

const CHART_API_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const HISTORY_RANGE = '1y';
const HISTORY_INTERVAL = '1d';
const TRADING_DAYS_PER_YEAR = 252;
const VOLATILITY_WINDOW_DAYS = 63; // 약 3개월치 거래일
const KRX_DAILY_LIMIT_PERCENT = 30; // 코스피/코스닥 개별 종목 일일 상하한가
const KST_TIME_ZONE = 'Asia/Seoul';
const KST_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: KST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** @returns {string} KST 기준 "YYYY-MM-DD" */
function toKstDateString(date) {
  return KST_DATE_FORMATTER.format(date);
}

/**
 * 일별 종가 배열로 연환산 변동성(%)을 계산한다 (일별 로그수익률의 표준편차 × sqrt(252) × 100).
 * 코스피/코스닥 상하한가(±30%)를 넘는 하루 수익률은 기업행위/데이터 오류로 보고 제외한다.
 * @param {Array<number|null>} closes
 * @returns {number | null}
 */
function computeAnnualizedVolatilityPercent(closes) {
  const valid = (closes ?? []).filter((c) => typeof c === 'number' && c > 0);
  if (valid.length < 10) return null; // 너무 적은 데이터로 계산하면 신뢰도가 낮음

  const maxAbsLogReturn = Math.log(1 + KRX_DAILY_LIMIT_PERCENT / 100);
  const logReturns = [];
  for (let i = 1; i < valid.length; i++) {
    const logReturn = Math.log(valid[i] / valid[i - 1]);
    if (Math.abs(logReturn) > maxAbsLogReturn) continue;
    logReturns.push(logReturn);
  }
  if (logReturns.length < 10) return null;

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
 *   currentPrice: number, changePercent: number|null, previousCloseLabel: string|null,
 *   high52w: number|null, low52w: number|null, currency: string,
 *   annualizedVolatilityPercent: number|null
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
    const timestamps = result?.timestamp;
    const closes = result?.indicators?.quote?.[0]?.close;
    const adjCloses = result?.indicators?.adjclose?.[0]?.adjclose ?? closes;

    // 종가/조정종가/날짜(timestamp)를 하나의 배열로 묶어서 다룬다 - 세 배열이 같은 인덱스로
    // 정렬돼 있다는 전제(Yahoo 응답 구조)가 필요한데, filter를 각각 따로 하면 인덱스가
    // 어긋날 수 있어 반드시 함께 묶은 뒤에 필터링한다.
    const bars = (timestamps ?? [])
      .map((timestamp, i) => ({ timestamp, close: closes?.[i], adjClose: adjCloses?.[i] }))
      .filter(
        (bar) =>
          typeof bar.timestamp === 'number' &&
          typeof bar.close === 'number' &&
          bar.close > 0 &&
          typeof bar.adjClose === 'number' &&
          bar.adjClose > 0
      );
    const validAdjCloses = bars.map((bar) => bar.adjClose);

    // 52주 고/저는 raw close가 아니라 adjclose(분할/배당 보정 종가) 기준으로 계산한다.
    // raw close로 계산했더니, 조회 시점(1년) 안에 액면분할이 있었던 종목(예: SK하이닉스)에서
    // 분할 전/후 가격이 그대로 섞여 "52주 245,000~2,919,000원(약 12배 폭)"처럼 실제로는
    // 불가능한 범위가 나오는 문제가 실전 리포트에서 발견됐다(등락률/변동성엔 이미 adjclose를
    // 쓰고 있어서 문제없었는데 52주 고저만 이 사각지대에 남아있었음). adjclose는 오늘자에
    // 가까울수록 raw close와 거의 같아 표시 오차는 무시할 수준이다.
    // Yahoo가 내려주는 종가에 부동소수점 잔여값이 섞여 있는 경우가 있어(예: 236,666.672원),
    // 원화는 소수 단위가 없으므로 정수로 반올림해서 표시 오류를 없앤다.
    const currency = meta.currency ?? 'KRW';
    const roundToCurrencyUnit = (n) => (currency === 'KRW' ? Math.round(n) : Math.round(n * 100) / 100);
    const high52w = validAdjCloses.length ? roundToCurrencyUnit(Math.max(...validAdjCloses)) : null;
    const low52w = validAdjCloses.length ? roundToCurrencyUnit(Math.min(...validAdjCloses)) : null;

    // meta.chartPreviousClose는 "전일 종가"가 아니라 "조회 range 시작 직전 종가"라
    // range를 바꾸면 비교 기준 시점이 통째로 바뀌어버린다(range=1y일 땐 1년 전과 비교하는
    // 셈이 되어 거의 모든 종목이 이상치로 잡히는 문제가 있었음). 그래서 range와 무관하게
    // 항상 정확한 "직전 거래일 종가"를 가리키도록, 각 종가의 실제 날짜(timestamp)를 오늘의
    // KST 날짜와 직접 비교해서 판정한다(가격 근사치 비교는 주말/공휴일에 오작동하는 문제가
    // 있었음 - 파일 상단 설명 참고). raw close가 아니라 adjclose를 쓰는 이유: 액면분할
    // 당일엔 raw close가 분할 전/후로 섞여 거의 항상 ±30% 상하한가를 넘겨 "정보 없음"으로
    // 빠지는데, adjclose는 currentPrice와 같은(분할 반영된) 기준이라 분할 당일에도 정확한
    // 등락률을 낼 수 있다. 평소엔 adjclose가 raw close와 거의 같아 표시값에 차이가 없다.
    const now = new Date();
    const todayKst = toKstDateString(now);
    const yesterdayKst = toKstDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));

    const lastBar = bars[bars.length - 1];
    const lastBarIsToday = lastBar ? toKstDateString(new Date(lastBar.timestamp * 1000)) === todayKst : false;
    const previousBar = lastBarIsToday ? bars[bars.length - 2] : lastBar;
    const previousClose = previousBar?.adjClose;
    const previousCloseKst = previousBar ? toKstDateString(new Date(previousBar.timestamp * 1000)) : null;
    // 직전 거래일이 정말 "어제"면 "전일대비"라고 써도 되지만, 주말/공휴일을 건너뛴
    // 경우("금요일 종가"가 직전 거래일인데 오늘이 월요일 등)에는 착각하지 않도록 실제
    // 기준일을 명시한다.
    const previousCloseLabel =
      previousCloseKst && previousCloseKst !== yesterdayKst
        ? `${Number(previousCloseKst.slice(5, 7))}/${Number(previousCloseKst.slice(8, 10))} 종가 대비`
        : '전일대비';

    let changePercent =
      typeof previousClose === 'number' && previousClose !== 0
        ? ((currentPrice - previousClose) / previousClose) * 100
        : null;
    if (changePercent !== null && Math.abs(changePercent) > KRX_DAILY_LIMIT_PERCENT) {
      console.warn(
        `[priceData] "${symbol}" 등락률 ${changePercent.toFixed(2)}%는 KRX 상하한가(±${KRX_DAILY_LIMIT_PERCENT}%)를 초과해 이상치로 제외`
      );
      changePercent = null;
    }

    // 변동성은 분할/배당 보정된 adjclose로 계산해 기업행위로 인한 인위적 급등락을 배제한다.
    const recentAdjCloses = validAdjCloses.slice(-VOLATILITY_WINDOW_DAYS);

    return {
      currentPrice,
      changePercent: changePercent !== null ? Math.round(changePercent * 100) / 100 : null,
      // changePercent가 null이면(이상치 제외 등) 굳이 "전일대비"라고 표시할 근거도 없으므로
      // 라벨도 함께 비워서, 값 없이 라벨만 남는 어색한 표시를 방지한다.
      previousCloseLabel: changePercent !== null ? previousCloseLabel : null,
      high52w,
      low52w,
      currency,
      annualizedVolatilityPercent: computeAnnualizedVolatilityPercent(recentAdjCloses),
    };
  } catch (error) {
    console.warn(`[priceData] "${symbol}" 가격 조회 중 오류:`, error?.message ?? error);
    return null;
  }
}

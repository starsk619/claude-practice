/**
 * 팀 전체가 공유하는 데이터 계약(contract).
 * 각 모듈은 이 형태를 입력/출력으로 맞춰서 독립적으로 구현한다.
 */

/**
 * NewsItem.category / SummaryResult.categories 키로 쓰이는 값들의 실제 목록은
 * src/categories.js의 CATEGORIES(단일 출처)를 참고할 것. 현재: ai, stock, society,
 * economy, international, politics, itScience, entertainment.
 *
 * @typedef {Object} NewsItem
 * @property {string} title
 * @property {string} url
 * @property {string} source
 * @property {string} publishedAt - ISO 8601 날짜 문자열
 * @property {string} category - src/categories.js의 CATEGORIES 중 하나
 * @property {string} [snippet] - 본문 일부 요약(있으면)
 */

/**
 * @typedef {Object} SummaryResult
 * @property {string} generatedAt - ISO 8601 날짜 문자열
 * @property {Object<string, string>} categories - src/categories.js의 CATEGORIES 각 키별 한글 요약
 * @property {NewsItem[]} sourceItems - 요약에 사용된 원본 뉴스 목록
 */

/**
 * @typedef {Object} StockPick
 * @property {string} ticker
 * @property {string} name
 * @property {'매수 고려'|'관망'|'주의'} rating
 * @property {string} rationale - 근거(수치/출처/날짜 인용)
 * @property {string} risk - 리스크 요인
 * @property {'강함'|'중간'|'약함'} confidence
 * @property {PriceInfo|null} [priceInfo] - src/priceData가 채워주는 실제 시세(뉴스 텍스트만으로는
 *   알 수 없는 "이미 주가에 반영됐는지" 감을 잡기 위함). 종목명 매핑/시세 조회 실패 시 null.
 */

/**
 * @typedef {Object} PriceInfo
 * @property {number} currentPrice
 * @property {number|null} changePercent - 등락률(%). 비교 기준일은 previousCloseLabel 참고
 * @property {string|null} previousCloseLabel - "전일대비"(직전 거래일이 정말 어제인 경우) 또는
 *   "N/D 종가 대비"(주말/공휴일을 건너뛰어 직전 거래일이 어제가 아닌 경우)
 * @property {number|null} high52w
 * @property {number|null} low52w
 * @property {string} currency
 */

/**
 * @typedef {Object} AnalystResult
 * @property {string} generatedAt
 * @property {string} headline - 오늘 시장을 한 문장으로 요약하는 총평(종목명 나열 없이, 20~30자 내외)
 * @property {string} shortTermOutlook - 1일~1개월 전망(근거 포함)
 * @property {string} longTermOutlook - 6개월~1년+ 전망(근거 포함)
 * @property {StockPick[]} picks
 * @property {string} disclaimer - 투자 자문이 아니라는 면책 문구
 * @property {import('./priceData/fxContext.js').FxContext | null} [fxContext] - 원/달러 환율
 *   (조회 실패 시 null)
 * @property {Object<string, import('./pickHistory/trackRecord.js').RatingPerformanceStat|null>} [ratingPerformance] -
 *   판단 유형(rating)별 누적 성과(자기 보정 참고용, 표본 부족한 등급은 null)
 */

export {};

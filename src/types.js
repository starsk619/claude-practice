/**
 * 팀 전체가 공유하는 데이터 계약(contract).
 * 각 모듈은 이 형태를 입력/출력으로 맞춰서 독립적으로 구현한다.
 */

/**
 * @typedef {Object} NewsItem
 * @property {string} title
 * @property {string} url
 * @property {string} source
 * @property {string} publishedAt - ISO 8601 날짜 문자열
 * @property {'ai'|'stock'|'society'} category
 * @property {string} [snippet] - 본문 일부 요약(있으면)
 */

/**
 * @typedef {Object} SummaryResult
 * @property {string} generatedAt - ISO 8601 날짜 문자열
 * @property {Object} categories
 * @property {string} categories.ai - AI 뉴스 카테고리 요약(한글)
 * @property {string} categories.stock - 주식 뉴스 카테고리 요약(한글)
 * @property {string} categories.society - 사회 뉴스 카테고리 요약(한글)
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
 */

/**
 * @typedef {Object} AnalystResult
 * @property {string} generatedAt
 * @property {string} shortTermOutlook - 1일~1개월 전망(근거 포함)
 * @property {string} longTermOutlook - 6개월~1년+ 전망(근거 포함)
 * @property {StockPick[]} picks
 * @property {string} disclaimer - 투자 자문이 아니라는 면책 문구
 */

export {};

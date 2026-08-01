# priceData 모듈

## 1. 목적

`analyst`가 만드는 `AnalystResult`는 원래 뉴스 텍스트만 근거로 삼았다. 하지만 뉴스만 보고는
"이 호재/악재가 이미 주가에 반영됐는지", "지금 밸류에이션이 부담스러운 수준인지", "변동성이
얼마나 큰 종목인지"를 알 수 없다는 근본적인 한계가 있었다. `priceData` 모듈은 무료 비공식
API(Yahoo Finance 차트 API, 네이버 금융)로 실제 시세/밸류에이션/변동성 데이터를 가져와 이
공백을 메운다.

이 모듈은 데이터를 두 시점에 공급한다.

- **판단 "전"** (`marketContext.js`의 `buildMarketContext`) — analyst가 종목을 고르기 전에
  오늘 뉴스에 언급된 종목 + "핵심 관심 종목"(`watchlist.js`)의 시세/밸류에이션을 미리 모아
  프롬프트에 판단 근거로 제공한다. Gemini를 추가 호출하지 않으므로 하루 2회(요약 1 + 분석 1)
  호출 구조와 할당량에는 영향이 없다.
- **판단 "후"** (`index.js`의 `enrichPicksWithPriceData`) — analyst가 고른 `picks[]`에 화면
  표시용 `priceInfo`를 붙인다. 이때 "전" 단계에서 이미 조회해둔 `marketContext` 스냅샷을
  최우선으로 재사용하고, 거기 없는 종목만 새로 조회한다(아래 "설계 판단" 참고 — 두 번 따로
  조회하면 카드 하나에 서로 다른 "현재가"가 찍히는 문제가 있었음).

또한 "종목 하나하나의 손절선"과는 별개로 **포트폴리오 레벨** 리스크(오늘 "매수 고려" 종목들이
특정 섹터에 몰려 있는지)를 점검하는 `portfolioRisk.js`도 이 모듈에 함께 둔다 — 판단에 쓰는
"핵심 관심 종목" 섹터 그룹 데이터를 그대로 재사용하기 때문이다.

## 2. 세부 진행 내역

### 파일 구성

| 파일 | 역할 |
|---|---|
| `src/priceData/yahooFinance.js` | `fetchPriceInfo(code, suffix)` — 현재가/등락률/52주 고저/연환산 변동성 조회 (Yahoo Finance 비공식 차트 API). |
| `src/priceData/naverValuation.js` | `fetchValuationInfo(code)` — PER/추정PER/EPS/PBR/BPS/배당수익률/외국인 보유율 조회 (네이버 금융 비공식 API, 국내 종목 전용). |
| `src/priceData/candidateExtractor.js` | `findMentionedCompanies(newsItems, options)` — 오늘 뉴스 제목/스니펫에서 KRX 상장기업명이 언급된 종목을 문자열 포함 검사로 찾아 언급 횟수순 정렬. |
| `src/priceData/tickerLookup.js` | `findTicker(name)` — 종목명 → `{ code, suffix }` 조회 (`src/data/krxListedCompanies.json` 기반). |
| `src/priceData/watchlist.js` | `CORE_WATCHLIST_SECTORS`/`CORE_WATCHLIST_NAMES`/`SECTOR_BY_NAME`/`CORE_WATCHLIST_OVERRIDES` — 뉴스 언급 여부와 무관하게 매일 훑어보는 "핵심 관심 종목" 목록(섹터별 그룹) + 이름→섹터 조회 맵. |
| `src/priceData/marketContext.js` | `buildMarketContext(newsItems, options)` — 뉴스 언급 종목 + 핵심 관심 종목을 합쳐 시세/밸류에이션을 미리 조회(판단 "전"). |
| `src/priceData/portfolioRisk.js` | `findSectorConcentration(picks)` — "매수 고려" 종목이 같은 섹터에 몰려 있는지 점검. |
| `src/priceData/fxContext.js` | `fetchFxContext()` — 원/달러 환율(현재가/등락률/52주 레인지) 조회, `fetchPriceInfo`를 `'KRW=X'` 티커로 재사용(새 API 불필요). |
| `src/priceData/index.js` | `enrichPicksWithPriceData(picks, marketContext)` — `picks[]`에 표시용 `priceInfo` 부여(판단 "후"), marketContext 스냅샷 우선 재사용. |

### 함수 시그니처

```js
// src/priceData/yahooFinance.js
/**
 * @param {string} code - 종목코드(국내 6자리 KRX 코드, 해외 상장은 티커 그대로 예: "CPNG")
 * @param {string | null} [suffix] - 'KS'(코스피) | 'KQ'(코스닥) | 'KN'(코넥스). 해외 상장은 null.
 * @returns {Promise<{
 *   currentPrice: number, changePercent: number|null, high52w: number|null, low52w: number|null,
 *   currency: string, annualizedVolatilityPercent: number|null
 * } | null>}
 */
export async function fetchPriceInfo(code, suffix) { ... }
```

```js
// src/priceData/naverValuation.js
/**
 * @param {string} code - 6자리 종목코드(코스피/코스닥 전용, 해외 종목 미지원)
 * @returns {Promise<{ per, forwardPer, eps, pbr, bps, dividendYield, foreignOwnershipRate } | null>}
 */
export async function fetchValuationInfo(code) { ... }
```

```js
// src/priceData/marketContext.js
/**
 * @param {import('../types.js').NewsItem[]} newsItems
 * @param {{ maxCandidates?: number }} [options]
 * @returns {Promise<MarketContextEntry[]>} 가격 조회 성공한 종목만 포함
 */
export async function buildMarketContext(newsItems, options = {}) { ... }
```

```js
// src/priceData/portfolioRisk.js
/**
 * @param {import('../types.js').StockPick[]} [picks]
 * @returns {{ sector: string, names: string[] }[]} 집중된 섹터 목록(없으면 빈 배열)
 */
export function findSectorConcentration(picks) { ... }
```

```js
// src/priceData/index.js
/**
 * @param {import('../types.js').StockPick[]} [picks]
 * @param {MarketContextEntry[]} [marketContext] - 판단 "전" 단계에서 이미 조회해둔 스냅샷
 * @returns {Promise<import('../types.js').StockPick[]>}
 */
export async function enrichPicksWithPriceData(picks, marketContext = []) { ... }
```

### 핵심 설계 판단

- **`meta.fiftyTwoWeekHigh`/`meta.fiftyTwoWeekLow`를 신뢰하지 않음** — 비공식 Yahoo 차트 API가
  비인증 요청에서 이 필드를 `0`으로 내려주는 것을 확인했다. 대신 `HISTORY_RANGE = '1y'`로 받아온
  일별 종가 배열에서 직접 `Math.max`/`Math.min`으로 계산한다. 부동소수점 잔여값(예:
  "236,666.672원")이 섞이는 경우가 있어 통화 단위에 맞게 반올림(KRW는 정수, 그 외는 소수 2자리)
  해서 표시한다.
- **`meta.chartPreviousClose`도 신뢰하지 않음** — 이 필드는 "전일 종가"가 아니라 "조회
  `range` 시작 직전 종가"라서, `range`를 `'3mo'`→`'1y'`로 늘리자 거의 모든 종목이 1년 전과
  비교하는 셈이 되어 등락률이 폭주하는(예: +519.97%) 회귀 버그가 실제 GitHub Actions 테스트에서
  발견됐다. 그래서 range와 무관하게 항상 "어제 종가"를 가리키도록, 받아온 일별 종가 배열의
  마지막 두 값을 직접 비교해서 도출한다(마지막 값이 `currentPrice`와 0.5% 이내로 같으면
  "오늘자"로 보고 한 칸 더 앞을 전일 종가로 사용).
- **등락률/변동성 계산에는 adjclose(분할·배당 보정 종가) 우선 사용** — raw close는 액면분할/
  유상증자 시점에 인위적인 등락으로 보일 수 있어, `result.indicators.adjclose[0].adjclose`가
  있으면 그것으로 계산하고 없으면 raw close로 폴백한다. 52주 고저는 반대로 실제 거래가(raw
  close) 기준이 자연스러워 그대로 사용한다.
- **KRX 상하한가(±30%) 이상치 필터링** — 코스피/코스닥 개별 종목은 구조적으로 하루 ±30%를 넘을
  수 없다. `changePercent`가 이를 넘으면 데이터 오류로 보고 `null` 처리 + `console.warn`
  로그를 남긴다. 변동성 계산의 일별 로그수익률에도 동일 기준(`Math.log(1.3)`)으로 이상치를
  걸러낸다(`computeAnnualizedVolatilityPercent`).
- **`KRX_SUFFIXES` 가드로 해외 상장 종목 밸류에이션 조회 스킵** — `fetchValuationInfo`(네이버
  금융)는 6자리 KRX 코드 전용인데, `watchlist.js`의 해외 상장 override(쿠팡 `CPNG`, suffix
  `null`)까지 호출하면 매번 HTTP 409가 발생했다. `marketContext.js`에서 `candidate.suffix`가
  `'KS'`/`'KQ'`/`'KN'` 중 하나일 때만 호출하도록 가드를 추가했다.
- **marketContext 스냅샷 재사용으로 카드 내 시세 불일치 제거** — 원래 `enrichPicksWithPriceData`가
  `analystResult.picks`에 대해 항상 새로 `fetchPriceInfo`를 호출했는데, 이게 "판단 전"
  조회(marketContext)와 시간차(Gemini 호출 20~40초)를 두고 또 조회하는 것이라, 시장이 급변동하는
  날엔 카드 상단 시세와 근거 문장 속 시세가 서로 다른 값으로 찍히는 문제가 실제 리포트에서
  발견됐다. `enrichPicksWithPriceData(picks, marketContext)`가 `code`를 key로 한 `Map`을 만들어
  marketContext에 이미 있는 종목은 그 값을 그대로 재사용하고, 없는 종목(뉴스에도 없고 핵심
  관심 종목도 아닌 경우)만 새로 조회하도록 변경했다.
- **watchlist의 섹터 그룹이 portfolioRisk에 그대로 재사용됨** — `watchlist.js`는 종목을
  섹터별로 그룹화해두는데, 이는 표시(주석)용이 아니라 `portfolioRisk.findSectorConcentration`이
  오늘 "매수 고려" 종목들이 같은 섹터에 몰려있는지 판단할 때 `SECTOR_BY_NAME` 맵을 그대로
  사용하기 때문이다. 워치리스트 밖 종목(오늘 뉴스에만 언급된 경우)은 미분류로 집계에서 제외된다.
- **"핵심 관심 종목" 워치리스트를 둔 이유** — 원래 `marketContext`는 오늘 뉴스에 언급된 종목만
  다뤘는데, 이러면 커버리지가 "오늘 RSS가 우연히 다룬 회사"에 좌우돼 매일 추천 종목이 근거 없이
  들쭉날쭉해 보였다. 실제 베테랑 애널리스트처럼 뉴스 언급 여부와 무관하게 매일 훑어보는 대표
  대형주 그룹을 두어, 뉴스에 안 나와도 항상 데이터가 제공되도록 했다. 종목은 "이름을 들으면 바로
  아는" 잘 알려진 대형주 위주로만 선정한다(시가총액이 매우 작거나 생소한 회사는 제외 — 사용자가
  "너무 모르는 종목까지 가면 걱정된다"고 명시적으로 우려한 부분을 반영).
- **`src/data/krxListedCompanies.json`을 코드에 하드코딩하지 않고 조회** — 워치리스트 이름
  자체를 코드로 박아두는 대신 `findTicker()`로 런타임에 확인해서, 상장폐지/이름 변경이 있어도
  안전하게 `null`을 반환하고 넘어가도록 설계했다.

### 검증한 내용

- `fetchPriceInfo`를 삼성전자(005930.KS)·HD현대일렉트릭(267260.KS)·한화시스템(272210.KS) 등
  실제 종목코드로 직접 호출해, `changePercent`/변동성이 ±30% 이내 합리적 범위로 나오고
  `high52w > low52w`(더 이상 0이 아님)인지 확인.
- `HISTORY_RANGE`를 `'1y'`로 바꾼 뒤 GitHub Actions 실행에서 `chartPreviousClose` 회귀
  버그(24개 이상 종목에서 이상치 발생)를 실제로 발견 → previousClose를 종가 배열 기반으로
  다시 구현 → 재실행으로 이상치 재발 없음 확인.
- `marketContext.js` 수정 후 CPNG(watchlist override)을 포함해 `buildMarketContext` 호출 시
  `"CPNG" 밸류에이션 조회 실패` 경고가 더 이상 출력되지 않음을 확인.
- `enrichPicksWithPriceData` 수정 후 GitHub Actions 실제 실행으로 카드 상단 시세와 근거 문장
  속 시세가 동일한 값으로 나오는지 최종 확인.
- 워치리스트 확장(15개→43개→54개) 시마다 `src/data/krxListedCompanies.json`에 실제로 존재하는
  이름인지 전수 확인(0건 누락).
- 이 모듈에 대한 별도 단위테스트는 없음(다른 모듈과 동일하게, 실제 GitHub Actions 실행으로
  검증하는 방식을 택함 — 비공식 API 응답 형태를 로컬에서 정확히 모킹하기 어렵기 때문).

## 3. 변경 이력 (Changelog)

### 2026-07-29 — 최초 구현 (실제 주가 데이터 + 포지션 리스크관리)
- `src/priceData/yahooFinance.js`, `tickerLookup.js`, `index.js` 최초 작성. `enrichPicksWithPriceData`로
  `analystResult.picks`에 현재가/등락률/52주 범위를 붙이는 기능 구현("뉴스가 이미 주가에
  반영됐는지" 감을 잡기 위한 보완 데이터).
- 종목명이 KRX 목록에 없거나 가격 조회가 실패해도 `priceInfo: null`로 파이프라인은 계속 진행.

### 2026-07-29 — 판단 "전" 시세/밸류에이션 데이터 제공 (marketContext)
- `candidateExtractor.js`, `naverValuation.js`, `marketContext.js` 신규 작성.
- `buildMarketContext(newsItems)`로 analyst가 종목을 고르기 **전에** 오늘 뉴스 언급 종목의
  시세/PER/PBR/변동성을 미리 조회해 프롬프트에 판단 근거로 제공하도록 파이프라인 변경
  (`src/index.js`에서 `analyzeInvestment` 호출 전에 실행).

### 2026-07-29 — 핵심 관심 종목 워치리스트 도입 (15개 → 43개)
- `watchlist.js` 신규 작성. `CORE_WATCHLIST_NAMES`/`CORE_WATCHLIST_OVERRIDES`로 뉴스 언급
  여부와 무관하게 항상 데이터를 조회하는 "핵심 관심 종목" 개념 도입, `marketContext.js`가
  뉴스 후보와 합쳐서 조회하도록 변경.
- 이후 사용자 요청으로 15개 → 43개로 확장, 해외 상장(쿠팡 CPNG)용 `CORE_WATCHLIST_OVERRIDES`
  구조 추가(suffix `null`로 Yahoo 조회 시 국가 접미사 생략).

### 2026-07-29 — 액면분할/유상증자 미보정으로 인한 이상 등락률·변동성 수정
- 실제 GitHub Actions 리포트를 투자 전문가 관점으로 리뷰한 결과, KRX 상하한가(±30%)를 넘는
  등락률(예: -43.05%, -48.96%)과 우량주치고 비정상적으로 높은 변동성(71~98%)을 발견.
- `computeAnnualizedVolatilityPercent`에 adjclose(분할/배당 보정 종가) 우선 사용 + KRX
  ±30% 초과 로그수익률 이상치 제외 로직 추가.
- 52주 고/저가 `meta.fiftyTwoWeekHigh/Low`(항상 0으로 확인됨)를 신뢰하지 않고 받아온 종가
  배열에서 직접 계산하도록 변경, 이를 위해 `HISTORY_RANGE`를 `'3mo'` → `'1y'`로 확장.

### 2026-07-29 — 등락률 계산에서 range 의존적인 chartPreviousClose 제거
- `HISTORY_RANGE`를 `'1y'`로 확장한 여파로, `meta.chartPreviousClose`가 "전일 종가"가 아니라
  "range 시작 직전 종가"라는 사실이 드러나며 다수 종목에서 등락률이 폭주하는 회귀를 실제
  Actions 실행에서 발견(예: +519.97%).
- `chartPreviousClose` 의존을 완전히 제거하고, 받아온 일별 종가 배열의 마지막 두 값 + "마지막
  값이 오늘자인지" 판정 로직으로 range와 무관하게 항상 전일 종가를 도출하도록 재구현.
- 52주 고/저 표시 시 raw close의 부동소수점 잔여값(예: "236,666.672원")을 통화 단위 기준으로
  반올림하는 로직도 함께 추가(KRW는 정수).

### 2026-07-29 — 종목 카드 시세 중복 조회 제거
- 같은 종목 카드 안에서 상단 시세와 근거 문장 속 시세가 다르게 표시되는 문제를 실제 리포트에서
  발견(분석 전/후 두 번 따로 조회하는 사이 실시간 가격이 변동).
- `enrichPicksWithPriceData(picks, marketContext = [])`로 시그니처 변경 — marketContext에
  이미 있는 종목은 재조회하지 않고 그대로 재사용, 없는 종목만 폴백으로 새로 조회.
- `src/index.js`의 호출부를 `enrichPicksWithPriceData(analystResult.picks, marketContext)`로 변경.

### 2026-07-29 — 투자자문자료 보완: 섹터 집중도 + 외국인 보유율
- `portfolioRisk.js` 신규 작성. `findSectorConcentration(picks)`로 오늘 "매수 고려" 종목이
  같은 섹터(watchlist.js의 `SECTOR_BY_NAME`)에 2개 이상 몰려 있으면 집중 리스크로 표시.
- 이를 위해 `watchlist.js`를 `CORE_WATCHLIST_SECTORS`(섹터별 그룹) 구조로 리팩터링하고
  `SECTOR_BY_NAME` 맵을 새로 export(`CORE_WATCHLIST_NAMES`는 이로부터 파생).
- `naverValuation.js`에 `foreignOwnershipRate`(외국인 보유율) 필드 추가, `MarketContextEntry`
  JSDoc 타입에도 반영.

### 2026-07-29 — 핵심 관심 종목 워치리스트 43개 → 54개 확장
- 사용자가 커버리지 확대를 요청, "너무 생소한 종목"에 대한 우려를 반영해 잘 알려진 대형주
  위주로만 선정. 반도체장비/전자부품/인터넷금융/엔터테인먼트/IT서비스 등 5개 섹터 신설 +
  바이오제약/에너지유틸리티/지주기타 3개 섹터에 종목 추가(총 22개 섹터).
- 확장 전 `src/data/krxListedCompanies.json`에 실제로 존재하는 이름인지 전수 검증(0건 누락).

### 2026-07-29 — 원/달러 환율(fxContext) 추가
- 사용자가 "30년차 전문가라면 환율도 봐야 하지 않냐"고 지적 — 기존 리포트는
  `shortTermOutlook`/`longTermOutlook` 문장에 "환율 변동성"이 막연한 배경 서술로만 언급되고
  실제 숫자 근거는 없는 상태였음.
- `fxContext.js` 신규 작성. Yahoo Finance가 통화쌍도 `'KRW=X'` 티커로 개별 종목과 동일한
  방식(`fetchPriceInfo`)으로 제공하는 것을 활용 — 새 API 연동 없이 기존 함수를 그대로
  재사용해서 현재가/전일대비 등락률/52주 레인지를 얻음.
  `docs/roadmap.md`에 먼저 조사/설계를 기록해두고, 같은 날 바로 구현까지 진행.
- `src/index.js`에서 `buildMarketContext`와 `Promise.all`로 병렬 조회(서로 독립적인 작업),
  결과를 `analystResultWithPrices.fxContext`에 포함. 조회 실패 시 `null`로 파이프라인은
  계속 진행.
- `analyzeInvestment`/`buildUserPrompt`(`docs/analyst.md`), `generateReport`의 리포트
  히어로 영역(`docs/notifier.md`)에도 함께 반영 — 자세한 내용은 각 문서 참고.

### 2026-07-31 — 52주 고/저가 raw close → adjclose로 변경 (분할 미보정 재발)
- 사용자가 실제 배포된 리포트(2026-07-31)를 투자 전문가 관점으로 리뷰하다가, 삼성전자
  52주 67,600~362,500원(약 5.4배), SK하이닉스 245,000~2,919,000원(약 12배), 삼성전기
  143,300~2,270,000원(약 16배)처럼 대형 우량주치고 불가능한 수준으로 넓은 52주 범위를
  발견 — 뉴스 요약 어디에도 이런 극단적 등락을 뒷받침하는 서술이 없어 실제 시세 변동이
  아니라 데이터 버그로 판단.
- 원인: 등락률/변동성은 이미 adjclose(분할·배당 보정 종가)를 쓰도록 고쳐뒀지만
  (`docs/priceData.md`의 "액면분할/유상증자 미보정으로 인한 이상 등락률·변동성 수정" 항목
  참고), 52주 고/저가만은 "실제 거래가 기준이 자연스럽다"는 이유로 의도적으로 raw close를
  쓰고 있었음 — 최근 1년 안에 액면분할이 있었던 종목은 분할 전/후 가격이 그대로 섞여 실제로는
  불가능한 범위가 나오는 사각지대가 남아 있었음.
- `high52w`/`low52w` 계산을 raw `close` 대신 `adjclose`(이미 변동성 계산용으로 fetch해두던
  값) 기준으로 변경. adjclose는 오늘자에 가까울수록 raw close와 거의 같아 정상 종목의
  표시값에는 사실상 영향이 없고, 분할이 있었던 종목만 범위가 정상화됨.
- 모의(mock) 데이터로 검증: 200일은 분할 전(raw 2,000,000/adj 200,000), 60일은 분할 후
  (raw/adj 150,000~160,000)로 구성한 시나리오에서, 수정 전 로직이라면 52주 고가가
  2,000,000으로 나올 상황이 수정 후 200,000으로 정상화됨을 확인(고저 비율 2배 미만).
  기존 `fetchFxContext`/`computeRatingPerformance` 관련 회귀 테스트도 재실행해 영향 없음을 확인.

### 2026-07-31 — 일별 등락률도 adjclose 기준으로 변경
- 52주 고/저가 fix와 같은 원인의 남은 사각지대: 일별 등락률(`changePercent`)의 "전일 종가"
  판정(`lastCloseIsToday`)과 `previousClose`가 여전히 raw close를 쓰고 있어서, 액면분할
  당일에는 분할 전/후 가격이 그대로 비교돼 거의 항상 KRX ±30% 상하한가에 걸려 "정보 없음"으로
  빠지는 문제가 있었음(틀린 값이 아니라 값이 안 보이는 형태로 나타나 지금까지는 눈에 덜 띄었음).
- `lastCloseIsToday` 판정과 `previousClose` 도출을 raw `close` 대신 `adjclose` 기준으로
  변경(52주 고/저와 동일한 근거) — 분할 당일에도 정확한 등락률이 나오고, 평소엔 adjclose가
  raw close와 거의 같아 표시값 차이가 없음. 더 이상 쓰이지 않게 된 `validCloses`(raw close
  전용 배열)는 제거.
- 모의(mock) 분할 시나리오(전일 raw 2,000,000/adj 200,000, 오늘 현재가 205,000)로 검증:
  수정 전이라면 이상치로 null 처리됐을 상황에서 수정 후 정확히 +2.5%가 나오는 것을 확인.
  평소(비분할) 케이스도 기존과 동일하게 동작하는지 함께 확인, 기존 환율/52주고저/피드백루프
  회귀 테스트도 전부 재실행해 영향 없음을 확인.

### 2026-08-01 — 휴장일(주말) 등락률 오표시 수정 (timestamp 기반 판정으로 전환)
- 사용자가 8월 1일(토) 실전 리포트를 리뷰하다가, 삼성전자 카드 상단은 "+26.81%"인데 근거
  문장의 "지난 리포트(7/31, 259,500원) 대비 262,500원"은 실제로는 +1.16%라며 같은 카드
  안에서 등락률이 두 가지로 모순되게 나오는 문제를 발견. SK하이닉스도 동일한 패턴(상단
  +29.95% vs 근거 문장 +0.29%) 확인.
- 원인: `previousClose` 판정이 "currentPrice가 종가 배열의 마지막 값과 0.5% 이내로 비슷하면
  그 값은 오늘자 데이터"라는 **가격 근사치 비교** 방식이었는데, 코스피가 휴장인 토요일에
  실행하면 currentPrice가 그냥 금요일 종가 그대로라 배열의 마지막 값(역시 금요일 종가)과
  똑같이 나옴 → "오늘자 데이터"로 오판해 한 칸 더 앞(목요일 종가)을 전일 종가로 사용 →
  실제로는 이틀치(목→금) 변동인데 "전일대비"라는 이름을 달고 나온 것.
- 가격 근사치 비교를 완전히 버리고, Yahoo 응답의 `result.timestamp`(각 종가의 실제 날짜)를
  오늘의 KST 날짜와 직접 비교하는 방식으로 교체. `close`/`adjclose`/`timestamp` 세 배열을
  인덱스가 어긋나지 않도록 `bars` 배열 하나로 묶어서 함께 필터링.
- 부가적으로 `previousCloseLabel` 필드를 추가해 direct close가 정말 "어제"인지, 아니면
  휴장일을 건너뛴 "N/D 종가"인지를 명시적으로 반환하도록 함 — 사용자가 "주말에도 뉴스는
  봐야 하니 계속 돌리되, 정확하게 라벨링해달라"고 요청한 것을 반영. `marketContext.js`/
  `fxContext.js`/`priceData/index.js`가 이 필드를 그대로 전달하도록 수정.
- `src/analyst/userPrompt.js`/`systemPrompt.js`, `src/reporter/index.js`도 하드코딩된
  "전일대비" 대신 이 라벨을 쓰도록 변경(자세한 내용은 각각 `docs/analyst.md`,
  `docs/notifier.md` 참고) — 모델이 생성하는 근거 문장도 실제 기준일과 다른 라벨을 쓰지
  않도록 지침 추가.
- 모의(mock) 데이터로 3가지 시나리오 검증: (1) 장중 조회(평소), (2) 장마감 후 조회(평소),
  (3) 실제 버그 재현 시나리오(휴장일, currentPrice == 3일 전 종가) — (3)에서 수정 전이라면
  이틀치 변동이 섞여 나왔을 상황이 수정 후 등락률 0%(휴장이라 실제로 변동 없음) + "N/D 종가
  대비" 라벨로 정확하게 나오는 것을 확인. 기존 회귀 테스트도 timestamp 필드를 추가해 전부
  재통과 확인.

> 앞으로 이 모듈을 수정할 때마다 위 형식(날짜 + 변경 내용)으로 이 섹션에 계속 추가할 것.

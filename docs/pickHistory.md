# pickHistory 모듈

## 1. 목적

리포트가 매일 "매수 고려"/"관망"/"주의" 판단을 새로 내리는데, 어제/지난주 판단과 근거 없이
계속 뒤집히면 신뢰할 수 없는 리포트가 된다. `pickHistory` 모듈은 이 "판단 이력(트랙레코드)"을
관리해서 두 가지를 가능하게 한다.

- **일관성 유지**: 최근 판단 이력을 `analyst` 프롬프트에 참고 자료로 넘겨, 새로운 뉴스/데이터
  근거 없이 판단이 매일 뒤집히지 않도록 유도한다(`src/analyst/userPrompt.js`의
  "최근 리포트에서의 판단 이력" 섹션 참고).
- **실적 검증**: 과거 판단이 실제로 맞았는지(1주일 전 "매수 고려" 이후 정말 올랐는지 등)를
  실제 주가와 대사해서 리포트에 "지난 판단 성과" 형태로 보여준다 — 사용자가 "투자 자문자료로
  쓰려면 어떤 보완이 필요한지" 물었을 때 나온 개선사항 중 하나(트랙레코드 검증)로 도입됐다.

GitHub Actions는 매 실행마다 완전히 새로운 러너에서 돌기 때문에 로컬 파일시스템에 어제 기록이
남아있지 않다. 리포트 HTML을 GitHub Pages로 공개 배포하는 것과 같은 방식으로, 판단 이력
JSON(`pick-history.json`)도 함께 공개 배포해두고 다음 실행 때 그 URL에서 다시 읽어오는 방식으로
별도 DB/저장소 쓰기 권한 없이 최소한의 지속성을 확보한다.

## 2. 세부 진행 내역

### 파일 구성

| 파일 | 역할 |
|---|---|
| `src/pickHistory/index.js` | 이력 조회(`fetchPickHistory`)/생성(`buildHistoryEntry`)/추가(`appendPickHistory`)/저장(`savePickHistoryToFile`), 공개 URL 유추(`derivePickHistoryUrl`). |
| `src/pickHistory/trackRecord.js` | `computeTrackRecord(history, marketContext)` — 1주일/1개월 전 판단을 실제 주가와 대사해 적중률 계산. |

### 함수 시그니처

```js
// src/pickHistory/index.js
export function derivePickHistoryUrl(reportPublicUrl) { ... }         // reportPublicUrl과 같은 디렉터리의 pick-history.json URL 유추
export async function fetchPickHistory(url) { ... }                   // 실패/404 시 빈 배열로 안전하게 대체
export function buildHistoryEntry(analystResultWithPrices) { ... }    // 이번 실행 결과 -> PickHistoryEntry
export function appendPickHistory(history, newEntry, maxEntries) { ... } // 추가 후 오래된 것부터 잘라냄
export async function savePickHistoryToFile(history, options) { ... }  // reports/pick-history.json 저장
export const PROMPT_HISTORY_ENTRIES = 7; // analyst 프롬프트에 넘기는 개수(전체 이력과 분리)
```

```js
// src/pickHistory/trackRecord.js
/**
 * @param {PickHistoryEntry[]} [history]
 * @param {MarketContextEntry[]} [marketContext]
 * @returns {Promise<{ oneWeek: TrackRecordStat|null, oneMonth: TrackRecordStat|null }>}
 */
export async function computeTrackRecord(history, marketContext = []) { ... }
```

### 저장 개수 이원화 (`DEFAULT_MAX_ENTRIES` vs `PROMPT_HISTORY_ENTRIES`)

이력을 얼마나 오래 보관할지와, `analyst` 프롬프트에 얼마나 넘길지는 목적이 달라 상수를
분리했다.

- `DEFAULT_MAX_ENTRIES = 40` — 저장(`appendPickHistory`) 시 유지하는 최대 개수. `trackRecord.js`가
  "1개월 전 판단"까지 대사해야 하므로 최소 한 달치(+하루에 여러 번 테스트 실행하는 경우의
  여유분)를 남겨둔다.
- `PROMPT_HISTORY_ENTRIES = 7` — `analyst` 프롬프트에 실제로 넣어주는 "최근 판단 이력" 개수.
  전체 40건을 다 넘기면 프롬프트 길이가 폭주하므로, `src/index.js`에서
  `pickHistory.slice(-PROMPT_HISTORY_ENTRIES)`로 잘라서 넘긴다.

### 트랙레코드 검증 로직 (`trackRecord.js`)

- **적중 판정 기준**: "매수 고려"는 이후 주가가 올랐으면 적중, "주의"는 이후 주가가 내렸으면
  적중(원했던 방향으로 움직였는지가 기준). "관망"은 방향성 판단이 아니므로 `SCORABLE_RATINGS`
  (`매수 고려`, `주의`)에서 제외해 집계하지 않는다.
- **`HORIZONS`**: `{ key: 'oneWeek', targetDays: 7, toleranceDays: 2 }`,
  `{ key: 'oneMonth', targetDays: 30, toleranceDays: 5 }` 두 개만 지원(사용자가 "1주일 +
  1개월 둘 다" 검증을 원해서 이렇게 결정, 1일 단위 검증은 채택하지 않음).
- **`findClosestEntry(history, now, targetDays, toleranceDays)`**: 정확히 `targetDays` 전
  기록이 없을 수 있으므로(주말/휴장, 테스트로 하루에 여러 번 실행 등), 허용오차
  (`toleranceDays`) 안에서 목표일에 가장 가까운 기록 하나를 선택한다.
- **`scorePick(pick, contextByCode)`**: 판단 당시 가격(`pick.price`)과 현재가를 비교해
  수익률을 계산한다. 현재가는 `marketContext`에 이미 조회해둔 스냅샷이 있으면 재사용하고
  (중복 조회 방지 — `priceData`의 카드 시세 중복 조회 버그를 고칠 때와 같은 원칙), 없는
  종목만 `fetchPriceInfo`로 새로 조회한다.
- 결과는 `{ label, asOfDate, count, hits, hitRatePercent, avgReturnPercent, details }` 형태의
  `TrackRecordStat`으로, 리포트(`src/reporter/index.js`의 `renderTrackRecord`)가 그대로
  렌더링한다. 해당 기간에 대사할 기록이 없거나 스코어링 가능한 pick이 하나도 없으면
  `null`(리포트에서 자동 생략).

### 공개 이력 조회/저장 흐름

1. `src/index.js`가 `derivePickHistoryUrl(config.reportPublicUrl)`로 `pick-history.json`
   URL을 유추 (리포트 HTML과 같은 디렉터리).
2. `fetchPickHistory(url)`로 공개 배포된 이력을 읽어온다. 아직 배포된 적이 없거나(404) 네트워크
   오류가 나도 빈 배열로 조용히 대체해 파이프라인이 죽지 않는다.
3. 이번 실행 결과로 `buildHistoryEntry(analystResultWithPrices)`를 만들어
   `appendPickHistory(history, newEntry)`로 추가(오래된 것부터 40건 초과분 제거).
4. `savePickHistoryToFile(...)`로 `reports/pick-history.json`에 저장 — 리포트 HTML과 함께
   GitHub Actions 워크플로에서 Pages 아티팩트로 복사되어 배포된다.

## 3. 변경 이력 (Changelog)

### 2026-07-29 — 최초 구현 (판단 이력 저장/조회)
- `src/pickHistory/index.js` 신규 작성. `derivePickHistoryUrl`/`fetchPickHistory`/
  `buildHistoryEntry`/`appendPickHistory`/`savePickHistoryToFile` 구현.
- GitHub Actions가 매 실행마다 새 러너인 문제를 GitHub Pages 공개 배포 이력 재조회 방식으로 해결.
- `src/analyst/userPrompt.js`에 "최근 리포트에서의 판단 이력" 섹션을 추가해 최근 판단을
  프롬프트에 참고 자료로 제공(일관성 유지 목적).

### 2026-07-29 — 트랙레코드 검증(1주일/1개월) 추가
- `src/pickHistory/trackRecord.js` 신규 작성. 사용자가 "투자 자문자료로 쓰려면 어떤 보완이
  필요한지" 물었을 때 나온 개선사항(트랙레코드 검증)을 반영, 검증 기준으로 1주일 + 1개월
  둘 다 확인하는 방식을 선택.
- `PROMPT_HISTORY_ENTRIES = 7`을 신설하고 `DEFAULT_MAX_ENTRIES`를 7 → 40으로 확대(1개월 전
  판단까지 대사해야 해서 저장 기간을 프롬프트 전달 개수와 분리).
- `src/index.js`에서 `analyzeInvestment`와 `computeTrackRecord`를 `Promise.all`로 동시 실행
  (서로 독립적인 작업이라 병렬화), 결과를 `analystResultWithPrices.trackRecord`에 포함.
- `src/reporter/index.js`에 `renderTrackRecord`를 추가해 "지난 판단 성과" 형태로 리포트에 표시
  (자세한 내용은 `docs/notifier.md` 변경 이력 참고).

> 앞으로 이 모듈을 수정할 때마다 위 형식(날짜 + 변경 내용)으로 이 섹션에 계속 추가할 것.

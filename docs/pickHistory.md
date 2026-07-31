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

### 2026-07-29 — 판단 유형별 누적 성과 집계 (자기 보정 피드백 루프)
- 사용자가 "환율까지 추가했는데 점수가 왜 거의 안 오르냐"고 물어서, "지금 설계로는 몇 주가
  지나도 종목 선정 자체가 자동으로 더 정확해지지 않는다 — Gemini는 매일 독립 호출되는
  stateless 모델이라 훈련/학습 루프가 없고, `trackRecord`는 '맞았는지 보여주는' 용도일 뿐
  '다음 판단을 바꾸는' 루프가 없다"고 정직하게 설명한 뒤, 사용자가 "그럼 피드백 루프를
  추가해달라"고 요청해서 구현.
- **중요한 전제**: 이건 모델 재훈련/파인튜닝이 아니다. Gemini API 특성상 진짜 학습 루프는
  불가능하고, 가능한 건 "과거 판단 유형별 실제 성과를 프롬프트에 자기 성찰 자료로 제공하고
  그에 맞춰 확신도/등급 기준을 스스로 보정하도록 명시적으로 지시하는" 프롬프트 레벨의
  자기 보정(self-calibration)뿐이다. 데이터를 프롬프트에 넣는다고 모델이 자동으로 반영한다는
  보장도 없다(일 변동성 인용 지시를 따로 추가해야 했던 사례와 동일한 한계, `docs/analyst.md`
  참고) — 코드가 rating/confidence를 강제로 덮어쓰는 로직은 의도적으로 넣지 않았다.
- `computeRatingPerformance(history, marketContext)` 신규 작성(`trackRecord.js`에 추가).
  `computeTrackRecord`가 "가장 가까운 판단 1건"만 보는 것과 달리, 표본을 늘리기 위해
  `MIN_AGE_DAYS`(3일) 이상 지난 판단을 전부(여러 날짜에 걸쳐) `SCORABLE_RATINGS`(매수 고려/
  주의)별로 모아 집계한다. 등급별 표본이 `MIN_SAMPLE_SIZE`(10건) 미만이면 그 등급은 `null`
  반환(표본 부족으로 아직 근거로 쓰지 말라는 의미) — 초기 며칠간 표본 2~3건으로 억지 결론을
  내리는 걸 방지.
- 알려진 한계: 판단 시점부터 경과일이 제각각인 판단들을 섞어서 집계하므로 "정확히 N일 후
  수익률"이 아니라 "방향성이 맞았는지"에 가까운 느슨한 지표다. 등급별 성향을 보는 용도로는
  충분하다고 판단.
- `src/index.js`의 파이프라인 순서 변경: 기존에는 `analyzeInvestment`/`computeTrackRecord`를
  `Promise.all`로 병렬 실행했는데, `computeRatingPerformance` 결과는 프롬프트에 직접 들어가야
  해서 `analyzeInvestment` 호출 **전에** 먼저 `await`하도록 변경(marketContext/fxContext
  확보 이후 지점). `computeTrackRecord`는 여전히 표시 전용이라 병렬 유지.
- 프롬프트/시스템 지침 반영은 `docs/analyst.md`, 리포트 표시는 `docs/notifier.md` 참고.
- 모의(mock) 데이터로 검증: 표본 10건 이상인 등급(적중 10/12, 83%)은 정확히 계산되고,
  10건 미만인 등급은 `null`, 3일 이내 최신 항목은 집계에서 제외되는지 확인.

### 2026-07-31 — scorePick에 비현실적 수익률 이상치 필터 추가 (액면분할 사각지대)
- `priceData`의 52주 고저/일별 등락률 액면분할 버그를 고치면서, 같은 원인이 세 번째로
  이 모듈에도 남아있다는 걸 발견: `scorePick`이 `pick.price`(판단 당시 raw 현재가, 과거
  시점에 저장됨)와 지금의 raw 현재가를 그대로 빼서 수익률을 계산하는데, 그 사이에 액면분할이
  있었으면 며칠~한 달 만에 -80~-90% 같은 터무니없는 수익률이 나올 수 있음 — 이게 그대로
  `computeTrackRecord`(리포트에 표시)와 `computeRatingPerformance`(자기 보정 피드백 루프)를
  둘 다 오염시킬 수 있었음.
- `priceData`처럼 adjclose로 사후 보정하는 방법은 여기선 못 씀(당시 분할 비율을 모르고,
  `pick.price`는 이미 그 시점의 raw 값 하나로 저장돼버렸기 때문). 대신
  `MAX_PLAUSIBLE_RETURN_PERCENT = 80`을 넘는 수익률은 실제 시세 변동이라기보다 데이터
  불일치(분할 등) 가능성이 훨씬 크다고 보고 `scorePick`이 `null`을 반환해 집계에서 제외하도록
  방어(경고 로그 남김).
- 모의(mock) 데이터로 검증: 정상 픽 12건 사이에 분할로 인한 이상치 1건을 섞었을 때, 이상치가
  `count`/`avgReturnPercent`에서 정상적으로 빠지고 나머지 12건만 집계되는 것을 확인.

> 앞으로 이 모듈을 수정할 때마다 위 형식(날짜 + 변경 내용)으로 이 섹션에 계속 추가할 것.

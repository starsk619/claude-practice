# notifier / reporter 모듈

## 1. 목적

`news-bot-team` 파이프라인은 `collector → summarizer → analyst → notifier/reporter` 순서로
데이터를 넘긴다. 이 중 마지막 단계인 `reporter`와 `notifier`는 다음 문제를 해결한다.

- **왜 필요한가**: `analyst`까지 만들어진 `SummaryResult`/`AnalystResult`는 구조화된
  데이터일 뿐, 사람이 바로 읽을 수 있는 형태가 아니다. 특히 "뉴스를 잘 안 읽거나
  투자를 잘 모르는 사람"도 매일 아침 한눈에 결론(오늘 뭘 보면 되는지)을 파악할 수 있어야
  한다는 요구가 있었다.
- **무엇을 해결하는가**:
  - `reporter`: `SummaryResult` + `AnalystResult` → 보기 쉬운 self-contained HTML 리포트
    (신호등 배지, 단기/장기 전망 표, 용어 설명, 면책 문구 등 매일 동일한 구조)로 변환.
  - `notifier`: 그 리포트를 실제로 사람에게 전달한다. 메신저(Slack/Telegram)에는
    스크롤 없이 읽을 수 있는 짧은 헤드라인만, 상세 내용은 HTML 파일 첨부로 분리해서
    "메시지가 길어지면 안 읽는다"는 우려를 해소한다. 또한 `node-cron`으로 매일 정해진
    시각에 자동 실행되도록 스케줄링한다.
- **팀 내 위치**: 공유 계약(`src/types.js`)의 `SummaryResult`/`AnalystResult`를
  **입력으로만** 소비하며, 그 계약이나 `collector`/`summarizer`/`analyst`/`scripts`/`docs`의
  다른 문서/파일은 건드리지 않는다. `src/notifier/`, `src/reporter/`, 그리고 본 문서
  (`docs/notifier.md`)만 소유한다.

## 2. 세부 진행 내역

### 파일 구성

| 파일 | 역할 |
|---|---|
| `src/reporter/index.js` | `generateReport(summaryResult, analystResult)` — HTML 리포트 생성. `saveReportToFile(html, options)`로 파일 저장. |
| `src/reporter/htmlUtils.js` | `escapeHtml`, `escapeAndBreak`, `formatKoreanDate`, `formatShortDate` — XSS 방지용 이스케이프 및 날짜 포맷 유틸. |
| `src/reporter/ratings.js` | `StockPick.rating`(매수 고려/관망/주의) → 신호등 색상(초록/노랑/빨강) 매핑, 확신도(강함/중간/약함) → 점(●) 표시 매핑. |
| `src/reporter/headline.js` | `buildHeadline(analystResult)` — 전문용어 없는 한줄 결론 생성. `buildShortDigest(summaryResult, analystResult)` — 메신저용 3~5줄 다이제스트 생성. `countByRating(picks)` — rating별 개수 집계. |
| `src/notifier/index.js` | 모듈 진입점. `sendMessage(channel, payload)`, `sendDailyReport({channels, summaryResult, analystResult, reportPath})` export. |
| `src/notifier/channels.js` | 채널 어댑터 레지스트리(`registerChannel`, `getChannel`, `listChannels`) — 공통 인터페이스로 채널 추가/교체 가능. |
| `src/notifier/adapters/slack.js` | Slack 어댑터 (`sendText`/`sendFile`). |
| `src/notifier/adapters/telegram.js` | Telegram 어댑터 (`sendText`/`sendFile`). |
| `src/notifier/adapters/kakao.js` | 카카오톡 "나에게 보내기" 어댑터 (`sendText`/`sendFile`). |
| `src/notifier/scheduler.js` | `scheduleDailyRun(runFn, options)` — `node-cron` 기반 매일 실행 스케줄러. |

### 함수 시그니처

```js
// src/reporter/index.js
/**
 * @param {SummaryResult} summaryResult
 * @param {AnalystResult} analystResult
 * @returns {string} HTML 문서 문자열 (self-contained, 인라인 CSS)
 */
export function generateReport(summaryResult, analystResult) { ... }

/**
 * @param {string} html
 * @param {{ dir?: string, generatedAt?: string }} [options]
 * @returns {Promise<string>} 저장된 파일의 절대 경로 (기본: <cwd>/reports/YYYY-MM-DD.html)
 */
export async function saveReportToFile(html, options) { ... }
```

```js
// src/notifier/index.js
/**
 * @param {string} channel - 'slack' | 'telegram' | 'kakao' (추후 다른 채널도 추가 가능)
 * @param {{ text?: string, filePath?: string, filename?: string, caption?: string }} payload
 */
export async function sendMessage(channel, payload) { ... }

/**
 * @param {{ channels: string[], summaryResult: SummaryResult, analystResult: AnalystResult, reportPath: string }} params
 * @returns {Promise<Array<{channel: string, ok: boolean, error?: string}>>}
 */
export async function sendDailyReport({ channels, summaryResult, analystResult, reportPath }) { ... }
```

```js
// src/notifier/scheduler.js
/**
 * @param {() => Promise<void> | void} runFn
 * @param {{ schedule?: string, timezone?: string, runImmediately?: boolean }} [options]
 * @returns {import('node-cron').ScheduledTask}
 */
export function scheduleDailyRun(runFn, options) { ... }
```

### 리포트 템플릿 구조 (고정 섹션 순서)

`generateReport`가 만드는 HTML은 매일 **아래 순서를 100% 동일하게 유지**한다 — 뉴스나 투자에
익숙하지 않은 사람도 "오늘은 어디를 보면 되는지"가 매일 같은 자리에서 눈에 들어오게 하기 위함.

1. **최상단 히어로 영역** — 오늘 날짜(한글, 예: "2026년 7월 28일 (화)") + `buildHeadline()`이
   만든 전문용어 없는 한줄 결론 (예: "오늘의 한줄 결론: 매수 고려 1개, 관망 1개, 주의 1개 —
   긍정적인 신호가 조금 더 많아요."). 결론이 항상 맨 먼저 나오도록 배치.
2. **종목별 신호등 배지** — `StockPick[]` 각각을 배지로 렌더링. `ratings.js`의 매핑에 따라
   매수 고려=초록(`#34a853`), 관망=노랑(`#f9ab00`), 주의=빨강(`#e53935`) 배경/테두리 색 적용.
   범례(legend)도 함께 표시.
3. **단기/장기 전망 표** — CSS Grid(`grid-template-columns: 1fr 1fr`)로 두 카드를 나란히 배치
   (`shortTermOutlook` "1일~1개월" / `longTermOutlook` "6개월~1년+"). 폭이 좁은 화면
   (`max-width: 560px`)에서는 미디어 쿼리로 세로 스택 전환.
4. **뉴스 요약 + 애널리스트 근거 상세** — `SummaryResult.categories.ai`/`.stock` 요약 카드,
   원본 기사 목록(`sourceItems`)은 `<details>` 아코디언(순수 HTML, JS 불필요)으로 접어둠.
   그 아래 `StockPick`별 근거(`rationale`)/리스크(`risk`)/확신도(`confidence`, ● 점 표시)를
   신호등 색 테두리 카드로 상세 표시.
5. **최하단 용어설명 박스 + disclaimer** — "매수 고려/관망/주의/단기 전망/장기 전망/확신도/
   리스크 요인"을 쉬운 말로 설명하는 용어 박스, 그 아래 `AnalystResult.disclaimer` 문구를
   그대로 노출하는 노란색 경고 박스("투자 자문이 아닙니다").

모든 동적 텍스트(뉴스 제목, 근거 문구 등)는 `escapeHtml`/`escapeAndBreak`을 거쳐 삽입한다
(외부 뉴스 텍스트에 HTML 태그가 섞여 있어도 안전). 폰트/이미지/스크립트 등 외부 리소스
의존 없이 `<style>` 블록 하나에 인라인 CSS만 사용(self-contained).

### Slack/Telegram 발송 구현 방식

공통 인터페이스: 모든 어댑터는 `{ name, sendText(text), sendFile({filename, caption, fileBuffer}) }`
형태를 따른다. `channels.js`가 이름→어댑터 레지스트리 역할을 하며, `sendMessage(channel, payload)`가
`payload.filePath` 유무로 텍스트/파일 발송을 분기한다. `sendDailyReport()`는
`buildShortDigest()`로 만든 3~5줄 헤드라인을 먼저 보내고, 이어서 `saveReportToFile()`로
저장된 HTML 파일을 첨부 발송한다. 채널 하나가 실패해도 나머지 채널은 계속 시도(부분 실패 허용).

- **Telegram** (`adapters/telegram.js`): `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`만으로
  `sendMessage`(텍스트)와 `sendDocument`(파일, `multipart/form-data` via 네이티브 `FormData`/`Blob`)를
  모두 지원 — 계약된 env만으로 요구사항을 100% 만족.
- **Slack** (`adapters/slack.js`): 텍스트는 `SLACK_WEBHOOK_URL`(Incoming Webhook)로 발송.
  **주의**: Slack Incoming Webhook은 플랫폼 자체적으로 파일 업로드를 지원하지 않는다.
  실제 파일 첨부(`files.getUploadURLExternal` → 업로드 → `files.completeUploadExternal`
  3단계 플로우)를 하려면 Bot Token이 필요해, 선택적으로 `process.env.SLACK_BOT_TOKEN`/
  `process.env.SLACK_CHANNEL_ID`를 추가로 읽도록 구현했다. 이 두 값은 `.env.example`에는
  아직 없음(이 파일은 수정 범위 밖) — 정식으로 쓰려면 리더가 `.env.example`에 추가할지
  결정 필요. 값이 없으면 에러로 전체를 죽이지 않고, webhook으로 "파일 첨부를 건너뛴다"는
  안내 텍스트만 보내는 것으로 안전하게 degrade 한다.
- 모든 토큰/웹훅 URL은 `process.env`로만 읽으며, 코드에 하드코딩된 값 없음.

### cron 스케줄러 동작

`scheduleDailyRun(runFn, options)`는 `options.schedule ?? process.env.CRON_SCHEDULE ?? '0 8 * * *'`
순으로 크론 표현식을 결정하고, `node-cron`의 `cron.validate()`로 형식을 검증한 뒤
(`invalid`면 즉시 에러) `cron.schedule()`로 등록한다. 타임존은
`options.timezone ?? process.env.CRON_TIMEZONE ?? 'Asia/Seoul'`. 등록된 작업은
매 스케줄마다 `runFn()`을 호출하며, `runFn` 내부에서 발생한 에러는 `try/catch`로 흡수해
`console.error`로만 남기고 스케줄러 자체는 죽지 않는다. `options.runImmediately`가 true면
등록과 별개로 `runFn()`을 즉시 한 번 더 실행(로컬 테스트 편의용).

### 검증한 내용

- `node --check`로 reporter/notifier 전 파일(9개) 문법 오류 없음 확인.
- 목(mock) `SummaryResult`/`AnalystResult` 데이터로 스모크 테스트 수행:
  - `generateReport()`가 `<!DOCTYPE html>`로 시작하는 완전한 HTML 문자열을 생성함을 확인.
  - 뉴스 요약 텍스트에 `<script>` 태그를 섞어 넣어도 이스케이프되어 실행되지 않음을 확인.
  - `buildShortDigest()`가 정확히 5줄 이하를 반환함을 확인(헤더 1 + 결론 1 + 종목 최대 3).
  - `saveReportToFile()`이 `YYYY-MM-DD.html` 파일명으로 정상 저장됨을 확인.
- env 변수 없는 상태에서 `sendMessage('slack', ...)`, `sendMessage('telegram', ...)` 호출 시
  하드코딩된 값 없이 "환경변수가 설정되지 않았습니다" 형태의 명확한 에러를 던짐을 확인
  (파이프라인이 알 수 없는 이유로 죽지 않도록 에러 메시지가 원인을 바로 알려줌).
  존재하지 않는 채널(`'kakao'`) 호출 시에도 등록된 채널 목록을 포함한 명확한 에러 확인.
  잘못된 크론 표현식(`'not-a-cron'`) 전달 시 즉시 에러, 정상 표현식(`'0 8 * * *'`)은
  스케줄 등록 및 `task.stop()` 정상 동작 확인.
- 실제 Slack/Telegram으로의 네트워크 발송 성공 여부(webhook/봇 토큰 유효성 등)는
  실제 자격 증명이 없어 검증하지 못함 — 요청 구성/에러 처리 경로만 확인됨.

## 3. 변경 이력 (Changelog)

### 2026-07-28 — 최초 구현

- `src/reporter/index.js`, `htmlUtils.js`, `ratings.js`, `headline.js` 최초 작성.
  `generateReport(summaryResult, analystResult)`로 고정 5단계 구조(한줄 요약 → 신호등 배지 →
  단기/장기 전망 표 → 뉴스 요약+근거 상세 → 용어설명+disclaimer)의 self-contained HTML 리포트
  생성 기능 구현, `saveReportToFile()`로 `reports/YYYY-MM-DD.html` 저장 기능 구현.
- `src/notifier/index.js`, `channels.js`, `scheduler.js`, `adapters/slack.js`,
  `adapters/telegram.js` 최초 작성. `sendMessage(channel, payload)` 공통 인터페이스로
  Slack/Telegram 어댑터 분리(카카오 등 추후 채널 추가 시 어댑터 파일 하나 + 레지스트리 등록
  한 줄로 확장 가능하도록 설계), `sendDailyReport()`로 3~5줄 헤드라인 + HTML 파일 첨부 발송
  구현, `scheduleDailyRun()`으로 `CRON_SCHEDULE` 기반 `node-cron` 매일 실행 스케줄러 구현.
- 토큰/웹훅 URL은 전부 `process.env`로만 읽도록 구현(하드코딩 없음). Slack Incoming Webhook의
  파일 업로드 미지원이라는 플랫폼 제약을 확인하고, Bot Token 기반 업로드로 best-effort 지원 +
  토큰 없을 시 안전한 텍스트 안내로 degrade하는 방식으로 처리.
- `node --check` 문법 검증 및 목 데이터 기반 스모크 테스트(HTML 이스케이프, 다이제스트 줄 수,
  파일 저장, env 누락/미등록 채널/잘못된 크론 표현식에 대한 에러 처리) 완료.

### 2026-07-28 — 카카오톡 "나에게 보내기" 채널 추가
- 사용자가 회사 Slack/Teams 접속이 막혀(관리자 승인 필요 추정) 카카오톡을 알림 채널로 선택 (리더가 직접 작업).
- `src/notifier/adapters/kakao.js` 신규 작성: Kakao Login의 `refresh_token`으로 매 발송 시 `access_token`을 새로 발급받아 `https://kapi.kakao.com/v2/api/talk/memo/default/send`로 text 템플릿 전송. 처음 설계했던 `sendMessage(channel, payload)` 공통 인터페이스에 그대로 꽂아 넣기만 하면 됐음(설계 의도대로 확장 가능함을 확인).
- 카카오 메모 API는 파일 첨부를 지원하지 않아, `sendFile()`은 Slack의 파일첨부 제약과 동일한 패턴으로 "리포트가 로컬에 저장됐다"는 안내 텍스트로 degrade.
- `scripts/kakao-auth.js` 신규 작성: Kakao Login(OAuth) 최초 1회 인증(로컬 콜백 서버로 authorization code 수신 → token 교환)을 사람이 브라우저로 진행하게 돕는 1회성 CLI. 이후로는 `kakao.js` 어댑터가 `refresh_token`으로 자동 갱신하므로 재실행 불필요.
- API 스펙(엔드포인트, 헤더, OAuth 파라미터)은 추측하지 않고 developers.kakao.com 공식 문서를 직접 확인 후 구현.
- `channels.js`에 등록, `.env.example`/`src/config.js`(env 검증에 kakao 조합 추가)/`scripts/check-secrets.js`(민감 키 목록에 추가)/`src/index.js`(활성 채널 판단) 반영.
- `KAKAO_REST_API_KEY`/`KAKAO_REFRESH_TOKEN` 없는 상태에서 어댑터가 명확한 에러를 던지는지 재검증 완료.

### 2026-07-28 — 리포트 공개 링크(GitHub Pages) 지원 + 고정 파일명으로 변경
- 카카오는 파일 첨부가 안 되므로, 대신 공개 링크(GitHub Pages 등)를 보낼 수 있도록 배선 (리더가 직접 작업).
- `reporter.saveReportToFile()`이 이제 두 파일을 함께 저장: 날짜별 이력 파일(`reports/YYYY-MM-DD.html`, 로컬 보관용)과 매일 덮어써지는 고정 파일 `reports/daily-briefing.html`(공개 배포용 — 이 파일만 배포하면 외부에는 항상 "오늘 것"만 보이고 과거 이력은 노출 안 됨). 반환값이 `string`에서 `{ historyPath, latestPath }`로 변경(호출부인 `src/index.js`도 함께 수정).
- `sendMessage(channel, payload)`/`sendDailyReport(...)`에 `url` / `reportUrl` 파라미터 추가 → 파일 첨부가 안 되는 채널(kakao)의 `sendFile()`이 이 url을 받아 링크 형태로 대체 발송할 수 있게 함. Slack/Telegram은 그대로 실제 파일을 첨부(추가 파라미터는 그냥 무시됨).
- `src/config.js`에 `REPORT_PUBLIC_URL`(선택) 추가 — 값이 있으면 `runDailyPipeline()`이 `sendDailyReport`에 넘겨줌.
- 파일명은 원래 `latest.html`이었으나 사용자 피드백으로 `daily-briefing.html`로 변경 (`LATEST_REPORT_FILENAME` 상수 하나만 바꾸면 되도록 설계).
- Mock 채널로 두 파일이 실제로 다르게 저장되는지, `reportUrl`이 어댑터의 `sendFile`까지 정확히 전달되는지 end-to-end 검증 완료.
- GitHub Pages 활성화 자체(저장소 Settings → Pages)는 사람이 웹 UI에서 직접 해야 하는 수동 단계라 이 세션에서 대신 해줄 수 없음 — `docs/kakao-setup.md`에 안내 추가.

### 2026-07-29 — 리포트에 "리스크 참고" 섹션 추가 (섹터 집중도 + 트랙레코드)
- 투자 자문자료로서의 완성도를 보완하는 작업(자세한 배경은 `docs/priceData.md`,
  `docs/pickHistory.md` 참고)의 일환으로, 종목 하나하나의 손절선과는 별개인 **포트폴리오 레벨**
  참고 정보 두 가지를 리포트에 추가.
- `src/reporter/index.js`에 `renderRiskNotes(analystResult)` 신규 작성 — 배지 섹션
  (`renderBadges`) 바로 아래 "리스크 참고" 섹션으로 삽입.
  - `renderSectorConcentration(sectorConcentration)`: 오늘 "매수 고려" 종목이 같은 섹터에
    몰려 있으면(`src/priceData/portfolioRisk.js`의 `findSectorConcentration` 결과) 경고
    문구 + 종목 목록을 표시.
  - `renderTrackRecord(trackRecord)`: 1주일/1개월 전 판단의 적중률·평균 수익률
    (`src/pickHistory/trackRecord.js`의 `computeTrackRecord` 결과)을 표시.
  - 둘 다 데이터가 없으면(첫 실행, 대사할 과거 기록 없음 등) 함수가 빈 문자열을 반환해
    섹션 자체가 생략되도록 처리(불필요한 빈 박스가 뜨지 않음).
- `.risk-note`/`.concentration-note`/`.track-record-note` CSS 클래스 추가(경고색/참고색 배경).
- GitHub Actions 실제 실행으로 두 섹션이 실제 데이터와 함께 렌더링되는지, 데이터가 없는
  케이스(트랙레코드용 과거 기록이 아직 없는 초기 상태)에서 섹션이 정상적으로 생략되는지 확인.

### 2026-07-29 — 히어로 영역에 원/달러 환율 표시
- 사용자가 "환율도 리포트에서 보고 싶다"고 요청. `renderHeader`에 `renderFxContext(fxContext)`
  호출을 추가해, headline(오늘의 한줄 결론) 바로 아래 고정 위치에 "💱 원/달러 환율: N원
  (전일대비 ±N%)" 한 줄과 52주 레인지를 표시.
  - 위치를 히어로 영역으로 정한 이유: 환율은 개별 종목이 아니라 시장 전체를 보는 배경
    지표라, 종목 배지나 "리스크 참고"(포트폴리오 전용) 섹션보다 위, 시장 총평과 같은
    급에 두는 게 리포트의 "매일 같은 자리에 같은 정보" 원칙에 맞음(자세한 배경은
    `docs/roadmap.md`에 먼저 남겨둔 조사/제안 참고).
  - `fxContext`(`src/priceData/fxContext.js`)가 `null`이면(조회 실패) `renderFxContext`가
    빈 문자열을 반환해 조용히 생략.
  - `.hero-fx`/`.fx-up`/`.fx-down` CSS 클래스 추가(등락 방향에 따라 색상 구분).
- 마스크(모의) 데이터로 fxContext가 있을 때 `<div class="hero-fx">`가 실제 값과 함께
  렌더링되고, `null`일 때는 해당 div 자체가 아예 생략되는지 확인.

### 2026-07-29 — 리스크 참고 섹션에 "판단 유형별 누적 성과" 추가
- 사용자가 요청한 자기 보정 피드백 루프(자세한 배경은 `docs/pickHistory.md`,
  `docs/analyst.md` 참고)의 표시 부분. `renderRiskNotes`에 `renderRatingPerformance`를
  추가해, 기존 섹터 집중도/트랙레코드와 함께 "판단 유형별 누적 성과 (자기 보정 참고용)"를
  같은 "리스크 참고" 섹션 안에 표시.
- 등급별로 표본이 확보된 것만(`ratingPerformance[rating] !== null`) 목록에 표시하고, 전부
  표본 부족이면 이 소섹션 자체를 생략. `renderRiskNotes`의 "데이터 없으면 섹션 전체 생략"
  가드도 세 소섹션(집중도/트랙레코드/누적성과) 기준으로 확장.
- `.risk-note.rating-performance-note` CSS 클래스 추가(연두색 계열 배경으로 다른 두 소섹션과
  구분).
- 모의(mock) 데이터로 표본 있는 등급만 렌더링되고, 전부 표본 부족이면 div 자체가 생략되는지
  확인.

### 2026-07-30 — 히어로 영역 환율 표시 가시성 개선
- 실제 배포된 리포트 스크린샷을 사용자가 확인해보니, 환율 줄이 헤드라인과 붙어 있고
  등락률 색상(`#82b1ff` 등)이 히어로 배경(짙은 남색 그라디언트)과 대비가 약해 잘 안 보이는
  문제 발견.
- `renderFxContext`가 환율 줄을 반투명 흰색 배경의 `.hero-fx-chip` 박스로 감싸도록 변경해
  헤드라인과 시각적으로 분리, 폰트 크기/굵기도 살짝 키움.
- `.fx-up`/`.fx-down` 색상을 더 밝은 톤(`#ffcdb2`/`#bbe3ff`)으로 변경해 짙은 남색 배경 대비
  가독성 확보.
- 처음엔 `border-radius: 999px`(완전한 알약 모양, `.badge`와 동일한 스타일)로 만들었으나,
  사용자가 "배경이랑 비슷한 모양으로 통일성 맞춰달라"고 요청 — 리포트의 다른 정보 박스들
  (`.risk-note`, `.outlook-card` 등)이 전부 각진 둥근 사각형(10~12px)을 쓰는 것과 맞춰
  `border-radius: 10px`로 변경(`.risk-note`와 동일한 반경).
- Playwright로 실제 값(1,441.98원, -0.77%, 52주 1,378~1,554원)을 넣어 렌더링한 스크린샷으로
  가독성 개선과 모양 통일성을 직접 확인.

### 2026-08-01 — 휴장일 등락률 라벨 표시 (renderPriceInfo/renderFxContext)
- `priceData`의 휴장일 등락률 오표시 수정(`docs/priceData.md` 참고)에 맞춰, 리포트에서도
  하드코딩된 "전일대비" 대신 `priceInfo.previousCloseLabel`/`fxContext.previousCloseLabel`을
  사용하도록 변경.
- `renderPriceInfo`(종목 카드 "시세" 줄)는 평소(라벨이 "전일대비"인 경우)엔 기존과 동일하게
  `+N%`만 표시하고, 휴장일을 건너뛴 경우에만 `+N%, 7/29 종가 대비`처럼 기준일을 덧붙여
  표시(평소 표시가 불필요하게 장황해지지 않도록).
- `renderFxContext`(히어로 영역 환율)도 동일하게 라벨을 반영.

<!-- 이 모듈을 수정할 때마다 아래에 "### YYYY-MM-DD — 변경 요약" 형식으로 새 항목을 추가할 것 -->

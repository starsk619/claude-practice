# summarizer 모듈

## 1. 목적

`news-bot-team` 파이프라인은 `collector → summarizer → analyst → notifier/reporter` 순서로 데이터를 넘긴다.
이 중 `summarizer` 모듈은 `collector`가 수집한 원본 뉴스(`NewsItem[]`)를 그대로 알림에 쓰기에는
너무 많고 산발적이라는 문제를 해결하기 위한 단계다.

- **왜 필요한가**: 매일 AI 뉴스 + 주식 뉴스를 사람이 일일이 읽고 정리하는 수고를 없애기 위해,
  Google Gemini API(무료 티어)를 이용해 카테고리별로 사람이 읽기 좋은 한글 요약을 자동 생성한다.
  (2026-07-28: 원래는 Anthropic API였으나 무료로 운영하고 싶다는 요청에 따라 Gemini로 전환 —
  자세한 내용은 하단 변경 이력 참고.)
- **무엇을 해결하는가**: 개별 기사 나열이 아니라 "오늘 AI 쪽엔 이런 흐름이 있었다",
  "오늘 주식 쪽엔 이런 이슈가 있었다" 수준의 종합된 요약을 만들어, 이후 단계
  (`analyst`의 투자 분석, `notifier`/`reporter`의 다이제스트·HTML 리포트)가 소비할 수 있는
  일관된 형태(`SummaryResult`)로 표준화한다.
- **팀 내 위치**: 공유 계약(`src/types.js`)의 `NewsItem` → `SummaryResult` 변환만 책임지며,
  투자 판단(`analyst`)이나 발송(`notifier`)에는 관여하지 않는다. 다른 모듈 파일은 건드리지 않는다.

## 2. 세부 진행 내역

### 파일 구성

| 파일 | 역할 |
|---|---|
| `src/summarizer/index.js` | 모듈 진입점. `summarizeNews(newsItems)` export. |
| `src/summarizer/promptBuilder.js` | 카테고리별 요약 프롬프트 문자열 생성. |
| `src/summarizer/geminiClient.js` | `@google/genai` 클라이언트 생성/캐싱, 모델명 상수. |
| `src/summarizer/summarizer.md` | 본 문서. |

### 함수 시그니처

```js
// src/summarizer/index.js
/**
 * @param {NewsItem[]} [newsItems]
 * @returns {Promise<SummaryResult>}
 */
export async function summarizeNews(newsItems) { ... }
export default summarizeNews;
```

```js
// src/summarizer/promptBuilder.js
/**
 * @param {'ai'|'stock'} category
 * @param {NewsItem[]} items
 * @returns {string} - 프롬프트 문자열
 */
export function buildCategorySummaryPrompt(category, items) { ... }
```

```js
// src/summarizer/geminiClient.js
export const SUMMARIZER_MODEL = 'gemini-2.5-flash';

/** @returns {GoogleGenAI} - 캐시된 클라이언트, 키 없으면 throw */
export function getGeminiClient() { ... }

/** 캐시 초기화 (테스트용) */
export function resetGeminiClientCache() { ... }
```

`NewsItem`, `SummaryResult` 타입은 모두 `src/types.js`에 정의된 공유 계약을 그대로 따른다
(직접 수정하지 않고 JSDoc `@typedef` import로만 참조).

### 처리 흐름

1. `summarizeNews(newsItems)` 호출 시 입력을 배열로 방어적 정규화(`Array.isArray` 체크,
   아니면 빈 배열로 처리) — `undefined`/`null`/빈 배열 모두 에러 없이 처리.
2. `NewsItem.category` (`'ai'` | `'stock'`) 기준으로 항목을 필터링해 카테고리별로 분리.
3. 카테고리에 뉴스가 하나도 없으면 API 호출 없이 `"오늘 수집된 뉴스가 없습니다."` 문구로 대체.
4. 뉴스가 있으면 `promptBuilder.buildCategorySummaryPrompt(category, items)`로 프롬프트를 만들고
   `geminiClient.getGeminiClient()`로 얻은 클라이언트의 `models.generateContent()`를 호출.
5. 응답의 `response.text`(SDK가 제공하는 텍스트 getter)를 그대로 사용.
6. API 호출이 실패(키 없음, 크레딧 없음, 네트워크 오류 등)하면 예외를 밖으로 던지지 않고
   `try/catch`로 흡수 → 에러 메시지를 요약 문자열 자리에 담아 반환. 한 카테고리의 실패가
   다른 카테고리나 전체 함수 실행에 영향을 주지 않음(카테고리별 독립 처리).
7. 최종적으로 `{ generatedAt: new Date().toISOString(), categories: { ai, stock }, sourceItems: items }`
   형태의 `SummaryResult`를 반환.

### 프롬프트 구조 (`buildCategorySummaryPrompt`)

- 역할 지시: "매일 아침 바쁜 독자를 위해 뉴스를 요약하는 전문 에디터" 페르소나.
- 입력 데이터: 해당 카테고리 `NewsItem[]`을 번호 매김 텍스트로 변환
  (`제목 / 출처 / 날짜 / URL / (있으면) 본문 일부`).
- 작성 규칙(모델에게 명시):
  - 3~6문장 또는 3~6개 불릿포인트로 종합 요약 (개별 기사 나열 금지)
  - 뉴스 목록에 없는 내용 추측 금지, 사실관계는 목록 근거로만 언급
  - 중립적 어조, 과장/낙관 편향 금지
  - 마지막 줄에 `"(총 N건)"` 형식으로 참고 기사 수 표기
  - 요약 텍스트만 출력(머리말/인사말 금지)

### API 키 및 모델 관리

- API 키는 오직 `process.env.GEMINI_API_KEY`로만 읽는다. 코드에 하드코딩된 키 없음.
- 키가 없으면 `getGeminiClient()`가 즉시 명확한 에러를 던지고, 이 에러는 `index.js`의
  `summarizeCategory`에서 잡혀 사용자에게 노출 가능한 문자열로 변환된다(파이프라인 크래시 방지).
- 모델은 `SUMMARIZER_MODEL = 'gemini-2.5-flash'` 상수 하나로 관리 — 추후 모델 변경 시
  이 상수만 수정하면 됨.

### 검증한 내용

- `node --check`로 전 파일 문법 오류 없음을 확인.
- 실제 Node 실행으로 스모크 테스트 수행:
  1. 빈 배열(`[]`) 입력 → API 호출 없이 두 카테고리 모두 "오늘 수집된 뉴스가 없습니다." 반환.
  2. `GEMINI_API_KEY` 없는 상태에서 뉴스 입력 → 예외 없이 `SummaryResult` 형태 유지,
     각 카테고리 요약 자리에 에러 메시지 문자열이 채워짐.
- 실제 Gemini API 호출 성공 여부(응답 품질, 토큰 사용량 등)는 유효한 API 키가 없어
  검증하지 못함 — 코드 구조와 에러 처리 경로만 확인됨.

## 3. 변경 이력 (Changelog)

### 2026-07-28 — 최초 구현
- `src/summarizer/index.js`, `src/summarizer/promptBuilder.js`, `src/summarizer/anthropicClient.js` 최초 작성.
- `summarizeNews(newsItems)` 함수로 `NewsItem[]` → `SummaryResult` 변환 기능 구현.
- 카테고리(ai/stock)별 독립적인 에러 처리, 빈 배열/뉴스 없음 케이스 처리 포함.
- API 키는 `process.env.ANTHROPIC_API_KEY`로만 읽도록 구현(하드코딩 없음), 모델은 `claude-sonnet-5`로 지정.

### 2026-07-28 — Anthropic → Gemini 전환
- 사용자가 완전 무료로 운영하길 원해 Anthropic API에서 Google Gemini API(무료 티어)로 전환 (리더가 직접 작업).
- `anthropicClient.js` 삭제, `geminiClient.js` 신규 작성 (`@google/genai`, `GEMINI_API_KEY`, 모델 `gemini-2.5-flash`).
- `index.js`의 API 호출부를 `client.messages.create()` → `client.models.generateContent()`로 변경, 응답 파싱을 `response.text`로 단순화.
- `promptBuilder.js`는 순수 텍스트 프롬프트만 만들기 때문에 변경 없음(프로바이더 무관).
- `GEMINI_API_KEY` 없는 상태에서 동일한 폴백 동작(에러 메시지로 대체) 재검증 완료.

### 2026-07-28 — 모델명을 latest 별칭으로 변경
- 실제 사용자 키로 `node src/index.js --once` 테스트 중 `gemini-2.5-flash`가 "신규 사용자에게는 더 이상 제공되지 않음(404)" 에러 발생. Google 모델 목록 API(`models?key=...`)로 실제 사용 가능한 모델을 직접 조회하고 `generateContent`로 실동작까지 확인한 뒤, 특정 버전 고정 대신 `gemini-flash-latest`(항상 현재 권장 flash 모델을 가리키는 별칭)로 변경 — 이후 Google이 특정 버전을 또 폐기해도 자동으로 최신 모델을 쓰게 됨.

### 2026-07-28 — 카테고리 8개 확장 + 요약 호출을 1번으로 묶음
- 뉴스 카테고리가 3개(ai/stock/society)에서 8개로 늘어나면서(`src/categories.js` 참고),
  기존처럼 카테고리마다 따로 `generateContent`를 호출하면 한 번 실행에 최대 8번 호출 —
  Gemini 무료 티어의 모델당 하루 20건 제한을 실행 몇 번 만에 소진해버리는 문제 발생
  (실제로 반복 테스트 중 `RESOURCE_EXHAUSTED` 429 에러로 확인).
- `promptBuilder.buildCategorySummaryPrompt(category, items)` → `buildBatchSummaryPrompt(itemsByCategory)`로
  교체: 뉴스가 있는 카테고리를 전부 모아 프롬프트 하나에 넣고, `schema.js`(신규)의
  `buildSummaryResponseSchema(activeCategories)`로 카테고리별 JSON 응답을 한 번에 받도록 변경
  (analyst 모듈의 responseSchema 패턴과 동일).
- 트레이드오프: 카테고리별 독립 실패 처리는 포기(호출 자체가 하나이므로 실패하면 그 회차에
  뉴스가 있던 모든 카테고리가 같은 에러 메시지로 채워짐). 대신 API 호출 횟수가 최대 8번 → 1번으로
  줄어 할당량 소모가 크게 감소.

<!-- 이 모듈을 수정할 때마다 아래에 "### YYYY-MM-DD — 변경 요약" 형식으로 새 항목을 추가할 것 -->

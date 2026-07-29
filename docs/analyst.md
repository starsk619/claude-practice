# analyst 모듈

## 1. 목적

`summarizer`가 만든 `SummaryResult`(AI 뉴스/주식 뉴스 카테고리별 한글 요약 + 원본 뉴스 목록)를
입력받아, **"30년 경력 투자 전문가" 페르소나**로 투자 분석(`AnalystResult`)을 생성하는 모듈이다.

단순히 뉴스를 요약하는 것을 넘어, 사용자가 "오늘 어떤 종목을 주목해야 하는지 / 지금 시장을
어떻게 봐야 하는지"에 대한 **1차 판단 근거**를 매일 자동으로 받아볼 수 있게 하는 것이 목적이다.
다만 이것이 실제 투자 자문으로 오인되어 사용자가 근거 없이 맹신하는 것은 반드시 막아야 하는
리스크이므로, 이 모듈의 설계는 "그럴듯하게 들리는 낙관적 결론"보다 "근거와 리스크를 함께
보여주는 정직한 분석"을 최우선 목표로 삼는다.

계약(`src/types.js`)상 이 모듈은:
- 입력: `SummaryResult` (categories.ai, categories.stock, sourceItems)
- 출력: `AnalystResult` (generatedAt, shortTermOutlook, longTermOutlook, picks[], disclaimer)

## 2. 세부 진행 내역 (프롬프트/설계 방식)

### 구조 개요 (2026-07-28 Gemini 전환 이후 기준)
- `client.js` — `GEMINI_API_KEY`(env)로만 Gemini 클라이언트 생성. 키 없으면 즉시 명확한
  에러로 fail-fast. 모델은 `gemini-2.5-flash` 기본값(env `GEMINI_ANALYST_MODEL`로 오버라이드 가능).
- `systemPrompt.js` — "30년 경력 투자 전문가" 페르소나 + 핵심 요구사항 5가지를 시스템 프롬프트에
  명시적으로 지시.
- `userPrompt.js` — `SummaryResult`를 모델이 근거로 삼을 수 있는 형태(카테고리 요약 + 원본 뉴스
  제목/출처/날짜/스니펫 목록, 최대 30건)로 직렬화. 현재 시각을 함께 넘겨 "단기/장기" 계산의
  기준점으로 삼게 함.
- `schema.js` (구 `tool.js`) — 모델이 자유 텍스트가 아니라 **Gemini의 `responseSchema` 구조화
  출력**으로만 답하도록 강제하는 JSON 스키마(`Type.OBJECT`/`Type.ARRAY`/`Type.STRING` 등).
  `rating`/`confidence`는 스키마 레벨에서 `enum`으로 제한.
- `normalize.js` — 모델 응답(JSON.parse된 객체)을 계약(`AnalystResult`)에 맞게 검증/정규화하는
  **최종 방어선**. 프롬프트만으로는 모델이 규칙을 어길 수 있으므로, 여기서 코드 레벨로 한 번 더 강제.
- `index.js` — 위 조각들을 조립해 `analyzeInvestment(summaryResult)`를 노출.

### 핵심 요구사항별 처리 방식

1. **낙관 편향 금지 / 근거 우선 인용**
   - 시스템 프롬프트에서 "결론을 먼저 말하고 근거를 끼워 맞추지 말 것", "구체적 수치/출처/날짜를
     먼저 인용한 뒤 결론을 도출하는 순서로 서술"을 명시적으로 지시.
   - 인용할 구체적 수치가 없으면 "구체적 수치 없음"이라고 명시하도록 지시 — 없는 통계를
     지어내는 것(hallucination)을 방지.
   - `userPrompt.js`가 원본 뉴스(sourceItems)의 제목/출처/날짜/스니펫을 그대로 모델에 전달해,
     모델이 실제로 인용할 수 있는 재료를 제공.

2. **리스크 요인 병기**
   - 시스템 프롬프트: "모든 전망과 모든 종목 분석에는 긍정적 시나리오만이 아니라 리스크 요인
     (거시경제/실적 불확실성/밸류에이션 부담/규제 리스크 등)을 반드시 함께 제시"하도록 지시.
   - tool 스키마의 `risk` 필드는 `picks[]`의 필수(required) 필드로 강제 — 모델이 아예 생략할
     수 없는 구조.

3. **단기/장기 전망 분리 + 예상 수익률 범위**
   - tool 스키마에 `shortTermOutlook`(1일~1개월)과 `longTermOutlook`(6개월~1년+)을 별도
     필드로 분리해 각각 필수로 요구.
   - 각 필드의 description에 "예상 수익률 범위(예: -3%~+2%)를 명시적으로 언급"하도록 지시해,
     모호한 정성적 서술("좋아질 것")로 끝나지 않게 유도.

4. **confidence로 추측/데이터 기반 구분**
   - `picks[].confidence`를 `강함/중간/약함` 3단계 enum으로 스키마에서 강제.
   - 시스템 프롬프트에서 "데이터/수치 기반 = 강함, 정황상 추론 = 중간, 근거 빈약한 추측 = 약함"
     기준을 명시.
   - `normalize.js`에서 스키마 밖의 값이 들어오면 가장 보수적인 값(`약함`)으로 강제 치환 —
     모델이 스키마를 어겨도 계약을 절대 깨지 않도록 보장.

5. **면책 문구(disclaimer)**
   - 프롬프트 지시만으로는 신뢰할 수 없다고 판단해, **코드 레벨(normalize.js)에서 최종
     보증**하는 방식을 택함: 모델이 반환한 disclaimer에 "투자 자문" + "참고"라는 키워드가
     모두 포함되어 있는지 검사하고, 하나라도 빠지면 고정 문구
     `"이 분석은 투자 자문이 아니며 참고용입니다. 최종 투자 판단과 그 결과에 대한 책임은
     투자자 본인에게 있습니다."`를 앞에 덧붙인다. 따라서 이 모듈을 통과한 `AnalystResult`는
     프롬프트 튜닝과 무관하게 **항상** 면책 문구를 포함하는 것이 코드로 보증됨.

### 기타 설계 판단
- **Gemini `responseSchema` 구조화 출력** 방식을 택한 이유: 자유 텍스트 응답을 정규식/JSON.parse로
  파싱하면 모델이 형식을 살짝 벗어났을 때 파싱이 깨질 수 있음. `config.responseMimeType:
  'application/json'` + `config.responseSchema`로 강제하면 `response.text`가 항상 스키마에 맞는
  JSON 문자열로 나와서 신뢰성 있게 파싱할 수 있음.
- **generatedAt은 모델이 아니라 코드가 직접 생성** (`new Date().toISOString()`) — 모델이 잘못된
  타임스탬프를 만들어낼 위험을 원천 차단.
- **rating/confidence는 스키마(enum) + normalize.js 이중 검증** — 스키마 강제만으로는 모델이
  스키마를 완전히 무시하거나 스키마 밖 값을 낼 가능성을 배제할 수 없으므로 이중 방어.
- 모델은 기본값 `gemini-2.5-flash` 사용 — 무료 티어 한도가 넉넉하고 하루 1회 호출이라 속도/비용
  이점이 큼. 더 깊은 분석이 필요하면 `GEMINI_ANALYST_MODEL=gemini-2.5-pro`로 오버라이드 가능.

## 3. 변경 이력 (Changelog)

### 2026-07-28 — 최초 구현
- `src/analyst/` 모듈 최초 작성: `client.js`, `systemPrompt.js`, `userPrompt.js`, `tool.js`,
  `normalize.js`, `index.js`.
- `analyzeInvestment(summaryResult)` 함수 구현 — `SummaryResult` -> `AnalystResult`.
- tool_choice로 구조화된 출력 강제, normalize.js에서 disclaimer/rating/confidence 코드 레벨
  검증 및 강제 보정 로직 추가.
- 모든 파일 `node --check`로 문법 검증 완료.

### 2026-07-28 — Anthropic → Gemini 전환
- 사용자가 완전 무료로 운영하길 원해 Anthropic API에서 Google Gemini API(무료 티어)로 전환 (리더가 직접 작업).
- `client.js`를 Gemini 클라이언트 생성으로 재작성 (`@google/genai`, `GEMINI_API_KEY`, 모델 `gemini-2.5-flash`).
- `tool.js`(Anthropic tool_use 스키마)를 삭제하고 `schema.js`(Gemini `responseSchema`, `Type` enum 기반)로 대체.
- `normalize.js`는 `import`만 `schema.js`로 변경, 검증 로직 자체는 그대로 유지(입력이 이미 파싱된 JS 객체라는 점은 동일).
- `systemPrompt.js`의 "도구를 호출해서 답하라" 지시를 "JSON 스키마로 자동 강제된다"는 문구로 수정(더 이상 tool 개념이 없으므로).
- `index.js`를 `client.models.generateContent({..., config: { systemInstruction, responseMimeType, responseSchema }})` 방식으로 재작성, 응답을 `JSON.parse(response.text)` 후 `normalizeAnalystResult()`에 전달.
- `GEMINI_API_KEY` 없는 상태에서 `analyzeInvestment()`가 명확한 에러를 던지는지(파이프라인이 이상하게 죽지 않는지) 재검증 완료.

### 2026-07-28 — 모델명을 latest 별칭으로 변경
- 실사용 중 `gemini-2.5-flash` 404(신규 사용자 지원 종료) 발생 — summarizer와 동일한 원인. Google 모델 목록 API로 실제 사용 가능한 모델을 확인하고 `gemini-flash-latest`로 변경(`GEMINI_ANALYST_MODEL` 환경변수로 여전히 오버라이드 가능).

### 2026-07-29 — 실제 시세/밸류에이션 데이터를 판단 근거로 제공 + picks 개수 유연화
- `userPrompt.js`에 `marketContext`(오늘 뉴스 언급 종목 + 핵심 관심 종목의 실제 시세/PER/PBR/
  변동성, `src/priceData/marketContext.js` 참고) 섹션을 추가해, 뉴스 텍스트뿐 아니라 실제
  시장 데이터도 판단 근거로 쓰도록 프롬프트 확장. `pickHistory`(최근 판단 이력) 섹션도 함께
  추가해 일관성 유지 지침을 명시(자세한 내용은 `docs/pickHistory.md` 참고).
- `systemPrompt.js`에 picks 등급별 개수를 "정확히 N개"가 아니라 등급당 0~3개로 유연하게
  구성하도록 지침 변경, 뉴스에 언급됐다는 이유만으로 생소한 회사를 채우지 말고 "이름을 들으면
  바로 아는" 잘 알려진 기업 위주로 선정하도록 지침 추가.
- `positionGuidance`가 확신도뿐 아니라 제공된 연환산 변동성 수치에도 맞춰 비중/손절선을
  제시하도록 지침 추가(변동성 높은 종목은 더 보수적으로).
- 리포트 용어 설명 박스(`docs/notifier.md`)에 PER/PBR/변동성/배당수익률 설명 추가와 함께,
  headline(한줄 총평)을 애널리스트가 직접 생성한 20~30자 시장 총평으로 교체.

### 2026-07-29 — 일 변동성 인용 지시 추가
- `userPrompt.js`의 연환산 변동성 데이터 문자열에 일 변동성을 괄호로 병기(`XX%(일 변동성 약
  ±Y.Y%)`)하도록 이미 반영했으나, 실제 생성된 리포트 확인 결과 `positionGuidance` 문장에는
  여전히 연환산 수치만 언급되고 일 변동성은 인용되지 않는 문제 발견 — 데이터에 값이 들어간다고
  모델이 자동으로 그걸 문장에 옮겨 적는 건 아니라는 걸 확인.
- `systemPrompt.js`의 positionGuidance 지침에 "괄호 안의 일 변동성 수치도 함께 인용해서
  독자가 체감할 수 있게 쓰라"는 지시를 명시적으로 추가, 재실행으로 실제 문장에 반영됨을 확인.

### 2026-07-29 — 외국인 보유율 해석 가이드 추가 (투자자문자료 보완)
- 사용자가 "투자 자문자료로 쓰려면 어떤 보완이 필요한지" 물었을 때 나온 개선사항 중 하나로,
  `src/priceData/naverValuation.js`에 추가된 `foreignOwnershipRate`를 `userPrompt.js`의
  `marketContext` 서술에 "외국인 보유율: N%"로 병기.
- `systemPrompt.js`에 외국인 보유율을 스마트머니 동향 참고 지표로 활용하는 해석 가이드 추가
  (급락에도 외국인 보유율이 유지/상승 중이면 매도세가 국내 수급 위주라는 신호, 함께 하락 중이면
  펀더멘털 우려가 반영되고 있다는 신호로 볼 수 있음 — 단, 데이터가 없거나 변화가 미미하면
  억지로 의미를 부여하지 말라는 단서도 함께 명시).
- 같은 커밋에서 판단 이력 기반 트랙레코드 검증(`src/pickHistory/trackRecord.js`)과 포트폴리오
  섹터 집중도 점검(`src/priceData/portfolioRisk.js`)도 함께 도입 — 두 기능 자체는 analyst
  프롬프트/스키마를 건드리지 않고 `src/index.js`/`src/reporter/index.js`에서 조립되므로 자세한
  내용은 각각 `docs/pickHistory.md`, `docs/notifier.md` 참고.

### 2026-07-29 — 원/달러 환율(fxContext) 프롬프트 반영
- `analyzeInvestment`/`buildUserPrompt`에 4번째 인자 `fxContext`(`src/priceData/fxContext.js`
  참고) 추가. `userPrompt.js`에 "오늘의 원/달러 환율" 섹션을 신설해 뉴스/종목 데이터보다
  먼저(시장 전체 배경) 제공.
- `systemPrompt.js`에 해석 가이드 추가: 원화 약세는 수출 비중이 큰 종목(반도체/자동차/조선)
  실적엔 우호적이지만 외국인 자금 이탈 압력을 키우고, 원화 강세는 반대라는 해석을 기존
  외국인 보유율 가이드와 함께 활용하도록 지시. 데이터가 없거나 변동이 미미하면 억지로
  의미를 부여하지 말라는 단서도 동일하게 포함.
- 마스크(모의) fetch로 fxContext가 있을 때/없을 때 각각 프롬프트에 올바른 섹션(값 또는
  "환율 조회에 실패했습니다" 폴백)이 포함되는지 확인.

> 앞으로 이 모듈을 수정할 때마다 위 형식(날짜 + 변경 내용)으로 이 섹션에 계속 추가할 것.

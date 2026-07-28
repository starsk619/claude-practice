# news-bot-team 작업 기록

## 1. 프로젝트 의도 및 계획

### 배경
사용자는 매일 AI 뉴스와 주식 관련 뉴스를 직접 찾아보는 게 번거롭고, 투자 판단에 참고할 근거 있는 요약이 필요하다고 판단해 이 봇을 기획함. 목표는 "매일 자동으로 수집 → 요약 → (선택) 투자 관점 분석 → 알림"까지 사람 개입 없이 도는 Node.js 봇.

### 대화를 통해 정리된 요구사항
- **수집**: RSS/웹 뉴스에서 AI 뉴스 + 주식 뉴스를 매일 수집
- **요약**: AI API로 뉴스를 카테고리별(AI/주식)로 요약 (최초 Anthropic → 2026-07-28 무료 운영을 위해 Google Gemini로 전환, 아래 개입 기록 참고)
- **투자 분석** (추가 요청): 30년 경력 투자 전문가 페르소나로 현재 전망과 매수 후보를 제시하되,
  - 낙관 편향 금지 — 근거(수치/출처/날짜)를 반드시 인용
  - 단기(1일~1개월)와 장기(6개월~1년+) 전망을 분리해서 제시
  - 리스크 요인을 항상 병기, 확신도(강함/중간/약함) 표시
  - 법적/책임 소재를 위해 "투자 자문 아님" 면책 문구 자동 포함
- **알림 방식** (논의 후 결정):
  - Slack/Telegram에 짧은 헤드라인 다이제스트만 발송 (메시지가 길어지면 안 읽는다는 우려 반영)
  - 상세 내용은 **HTML 리포트**로 별도 생성 후 첨부/링크 — PDF보다 가벼움(헤드리스 브라우저 불필요)
  - 매일 **동일한 템플릿 구조** 유지 → 신호등 색(매수 고려/관망/주의), 한줄 요약 위치 고정 → 뉴스나 투자에 익숙하지 않은 사람도 한눈에 파악 가능하게
  - 카카오톡: "나에게 보내기" API로 무료 가능하지만 OAuth 토큰 갱신 유지보수 부담이 있어 **1차 범위에서는 제외**, 추후 확장 가능하도록 notifier를 인터페이스 기반으로 설계
- **보안** (추가 요청): API 키/웹훅 URL 등 민감 정보가 git에 절대 올라가지 않도록 보호 장치 필요
  - `.env`는 `.gitignore` 처리, `.env.example`에는 값 없이 키 이름만
  - 커밋 전 시크릿 패턴 검사(pre-commit hook), 앱 구동 시 필수 env var 누락되면 즉시 에러

### 결정된 아키텍처 (모듈 분리 = 팀원 소유 경계)
| 모듈 | 경로 | 책임 |
|---|---|---|
| collector | `src/collectors/` | RSS/뉴스 수집 → `NewsItem[]` |
| summarizer | `src/summarizer/` | `NewsItem[]` → 카테고리별 요약 (`SummaryResult`) |
| analyst | `src/analyst/` | `SummaryResult` → 투자 전문가 분석 (`AnalystResult`) |
| notifier | `src/notifier/`, `src/reporter/` | HTML 리포트 생성 + Slack/Telegram/카카오톡 발송 + cron 스케줄 |
| security | `.env.example`, `scripts/`, `docs/SECURITY.md` | 시크릿 보호 장치, env 검증 |

공유 계약은 [src/types.js](../src/types.js)에 JSDoc으로 정의(리더가 사전 작성) — 각 팀원은 이 계약만 보고 독립적으로 구현해 파일 충돌 없이 병렬 작업.

문서화 방식: 처음엔 각 팀원의 코드 폴더 안에 자기 이름의 .md를 두기로 했으나, 정리된 문서만 모아서 보기 쉽게 이 `docs/` 폴더 하나로 통합하기로 변경함. `docs/` 폴더는 원래 security 팀원의 `docs/SECURITY.md`(토큰 관리 가이드) 용도로 만든 폴더였는데, 지금부터는 팀 전체 문서(이 파일 포함 각 팀원 작업 로그)를 모아두는 폴더로 겸용.

### 실행 방식
- 에이전트 팀(Agent Teams) 기능 사용, 팀 이름은 사용자 요청에 따라 **news-bot-team**으로 통칭 (내부적으로는 세션 기준 이름이 자동 생성되지만 본 문서/커뮤니케이션에서는 news-bot-team으로 부름)
- `settings.json`에 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, `teammateMode: tmux` 설정 완료
- 5명의 팀원(collector, summarizer, analyst, notifier, security)을 병렬로 생성해 각자 담당 폴더만 작업 → 파일 충돌 방지
- 리더(이 세션)가 공유 작업 목록(Task List)에 작업을 등록하고 팀원에게 할당, 완료 후 통합
- 리더는 팀원들의 진행 상황을 주기적으로 확인하고, 방향이 계약(계획)과 어긋나면 즉시 메시지로 재지정

---

## 2. 작업 분배 및 진행 로그

> 아래는 실제 작업이 진행되며 갱신됩니다.

### Phase 0 — 공유 스캐폴딩 (리더 직접 수행)
- [x] `package.json`, `.gitignore`, `.env.example`, `src/types.js` 작성 완료

### Phase 1 — 팀원별 작업 (병렬)

| 팀원 | 담당 작업 | 상태 | 완료 내용 |
|---|---|---|---|
| collector | RSS/뉴스 수집기 구현 (task #1) | ✅ 완료 | feeds.js(공개 RSS 5개: TechCrunch AI/VentureBeat AI/한국경제·매일경제 증권/연합뉴스 경제)+normalize.js+index.js. 실제 네트워크 호출로 247건 수집 확인. [collector.md](collector.md) 작성 완료 |
| summarizer | AI 요약 모듈 구현 (task #2) | ✅ 완료 | index.js+promptBuilder.js+geminiClient.js(구 anthropicClient.js). 빈 배열/키 없음 케이스 모두 예외 없이 계약 형태 반환 확인. [summarizer.md](summarizer.md) 작성 완료 |
| analyst | 투자 분석 모듈 구현 (task #3) | ✅ 완료 | client.js/schema.js(구 tool.js)/systemPrompt.js/userPrompt.js/normalize.js/index.js. Gemini responseSchema 강제로 구조화된 응답 보장, disclaimer·confidence는 코드 레벨로도 이중 검증. [analyst.md](analyst.md) 작성 완료 |
| (리더) | Anthropic → Gemini 전환 (task #7) | ✅ 완료 | 사용자가 무료 운영을 원해 summarizer/analyst의 AI 호출을 Gemini API로 교체. 아래 개입 기록 참고 |
| notifier | 리포트+발송+스케줄러 구현 (task #4) | ✅ 완료 | reporter(HTML, 5단 고정 구조)+notifier(sendMessage 공통 인터페이스, 채널 어댑터 레지스트리, cron). Slack은 웹훅으로 텍스트만, 파일첨부는 선택적 Bot Token 방식. [notifier.md](notifier.md) 작성 완료 |
| security | 시크릿 보호 장치 구현 (task #5) | ✅ 완료 | check-secrets.js(pre-commit hook)+config.js(env 검증)+docs/SECURITY.md. 실제 가짜 시크릿으로 커밋 차단까지 확인. 5개 모듈 코드 감사 결과 하드코딩된 시크릿 없음. [security-log.md](security-log.md), [SECURITY.md](SECURITY.md) 작성 완료 |

5명 모두 병렬로 생성되어 각자 담당 폴더에서 독립적으로 작업 시작, 전원 완료함. 리더는 각 팀원이 SendMessage로 완료 보고를 보내거나 작업이 유휴 상태가 될 때 자동으로 알림을 받아 확인하고, 계약(src/types.js)과 어긋나는 방향이 감지되면 즉시 메시지로 재지정함.

### 리더의 개입/재지정 기록
- **공유 작업 목록 도구 부재**: 백그라운드 팀원 세션에는 리더가 가진 TaskGet/TaskUpdate 도구가 없다는 걸 collector가 가장 먼저 보고함. 전체 팀원에게 "태스크보드는 리더가 대신 관리하니 신경 쓰지 말라"고 안내하고, 이후 모든 task 상태 갱신은 리더가 보고 내용을 검증한 뒤 직접 처리.
- **문서 위치 재조정**: 처음엔 각자 폴더에 자기 이름 .md를 두기로 했으나, 사용자가 "정리된 문서만 모아두는 폴더가 있으면 좋겠다"고 요청 → `docs/`를 팀 전체 문서 폴더로 통합 결정. 이미 완료된 collector.md/summarizer.md는 리더가 직접 이동, 아직 작업 중이던 analyst/notifier에게는 SendMessage로 경로를 `docs/analyst.md`, `docs/notifier.md`로 재지정함(analyst는 이미 src/analyst/analyst.md로 써서 리더가 이동, notifier는 재지정을 받아 바로 docs/notifier.md로 작성).
- **Slack 파일 첨부 env var 결정**: notifier가 "Slack Incoming Webhook은 파일 업로드를 지원하지 않는다"며 선택적 `SLACK_BOT_TOKEN`/`SLACK_CHANNEL_ID` 추가 여부를 리더 판단에 맡김 (security도 동일 사항을 감사 중 발견해 참고 보고). 리더가 `.env.example`에 두 값을 "선택 사항"으로 추가해 해결 — 값이 없으면 텍스트 안내로 자연스럽게 대체되도록 이미 구현되어 있어 하위 호환 문제 없음.
- **`docs/SECURITY.md` vs `security.md` 대소문자 충돌**: security 팀원이 macOS(APFS) 볼륨이 대소문자를 구분하지 않아 `docs/security.md`가 이미 만든 `docs/SECURITY.md`와 같은 파일로 충돌한다는 걸 스스로 발견하고 `docs/security-log.md`로 대체 — 리더 개입 없이 팀원이 자체적으로 올바르게 처리.
- **Anthropic → Gemini 전환 (완료 후 발생)**: 통합까지 끝난 뒤 사용자가 "완전 무료로 하고 싶다"고 요청. Anthropic API는 유료(크레딧 충전) 전용이라, Google Gemini API(무료 티어) vs Ollama(로컬 모델, 완전 무료지만 실행 시각에 컴퓨터가 켜져 있어야 함) 두 옵션을 제시하고 사용자가 Gemini를 선택. 팀원 재소집 없이 리더가 직접 `summarizer`/`analyst`의 클라이언트·스키마·index.js를 Gemini 방식으로 재작성 (`@anthropic-ai/sdk` 제거, `@google/genai` 추가). 실제 npm 패키지 존재 여부와 SDK 사용법은 추측하지 않고 `npm view`/설치된 타입 정의(`node_modules/@google/genai/dist/node/node.d.ts`)를 직접 확인해서 정확한 API(`ai.models.generateContent`, `config.responseSchema`, `Type` enum)로 구현.
- **회사 Slack/Teams 시도 → 카카오톡으로 전환 (완료 후 발생)**: 회사 워크스페이스가 IT 정책(Intune 등 MDM)으로 앱 설치/웹훅 생성을 막아둔 것으로 추정, 여러 차례 시도했으나 진행 불가 확인. Slack/Teams/Telegram 외 대안으로 텔레그램(이미 구현됨)/디스코드/카카오톡을 제시했고 사용자가 평소 자주 쓰는 카카오톡을 선택. `src/notifier/adapters/kakao.js`(카카오톡 "나에게 보내기" 어댑터)와 `scripts/kakao-auth.js`(OAuth 1회성 인증 CLI)를 리더가 직접 신규 구현 — 애초에 notifier를 채널 어댑터 레지스트리 패턴으로 설계해둔 덕분에 파일 하나 추가 + 레지스트리 등록 한 줄로 확장됨(설계 의도가 실제로 검증된 사례). API 스펙은 developers.kakao.com 공식 문서를 직접 확인 후 구현. 카카오 메모 API가 파일 첨부를 지원하지 않는다는 제약을 확인하고 `docs/kakao-setup.md`에 사용자용 설정 가이드를 별도로 작성.
- **"노트북이 꺼져 있어도 자동으로 도나?" 질문**: 현재 구조(node-cron)는 프로세스가 로컬에서 계속 실행 중이어야만 동작하므로, 노트북을 끄면 예약 발송이 안 된다는 한계를 사용자에게 명확히 안내. GitHub Actions로 옮기면 무료로 노트북 없이 돌릴 수 있다고 제안 (다음 작업으로 진행 예정).
- **카카오 앱 설정 삽질**: 카카오 개발자 콘솔 UI가 예상과 달라 Redirect URI 등록 위치를 여러 차례 잘못 짚음(로그아웃 리다이렉트 URI, 문서 확인 페이지의 예시 이미지 등과 혼동). 최종적으로 공식 문서(WebFetch)로 정확한 위치(`[플랫폼 키] > REST API 키 상세 > 카카오 로그인 리다이렉트 URI`) 확인. 이후 Client Secret 활성화로 인한 KOE010(invalid_client)도 `.env`에 `KAKAO_CLIENT_SECRET` 추가로 해결.
- **Gemini 모델 404 (실사용 중 발견)**: 첫 실제 실행(`node src/index.js --once`)에서 `gemini-2.5-flash`가 "신규 사용자에게 더 이상 제공되지 않음" 404 발생. 추측하지 않고 사용자의 실제 `GEMINI_API_KEY`로 Google 모델 목록 API를 직접 조회 + `generateContent` 실호출까지 검증한 뒤, 특정 버전 대신 `gemini-flash-latest`(latest 별칭)로 변경 — 향후 모델 폐기에도 자동 대응.
- **✅ 첫 end-to-end 실전 테스트 성공 (2026-07-28)**: 뉴스 247건 수집 → 요약 → 투자 분석(종목 3건) → 리포트 저장 → 카카오톡 발송까지 실제 데이터로 전부 성공.

### Phase 2 — 통합 (리더 직접 수행)
- [x] `src/index.js` 작성: `validateEnv()` → `collectNews()` → `summarizeNews()` → `analyzeInvestment()` → `generateReport()`+`saveReportToFile()` → (설정된 채널이 있으면) `sendDailyReport()` 순서로 연결. `node src/index.js --once`로 즉시 1회 실행, 인자 없이 실행하면 `scheduleDailyRun()`으로 매일 예약.
- [x] end-to-end 배선 검증 완료: `collectNews()` 실제 네트워크 호출로 247건 수집 확인, `summarizeNews()`가 API 키 없는 상황에서도 계약 형태를 깨지 않고 폴백 처리하는 것 확인, mock 채널 어댑터를 임시 등록해 `generateReport → saveReportToFile → sendDailyReport`까지 실제 파일 생성/발송 로직이 정상 동작하는 것을 확인(PASS). `analyzeInvestment()`는 실제 `ANTHROPIC_API_KEY`가 있어야 완전한 검증이 가능해 이번엔 목 데이터로 대체 — 실사용 시 `.env`에 유효한 키를 넣으면 `validateEnv()`가 먼저 이를 강제하므로 안전.
- [x] `.gitignore`/`git status`/`check-secrets.js` 재확인: `.env`가 추적되지 않고, 스테이징 없이도 시크릿 스캐너가 정상 종료(exit 0)하는 것 확인.

## 3. 사용 방법 요약
1. `.env.example`을 복사해 `.env`를 만들고 최소 `GEMINI_API_KEY`([aistudio.google.com/apikey](https://aistudio.google.com/apikey)에서 무료 발급) + (Slack, Telegram, 카카오톡 중 하나)를 채운다. 카카오톡 설정은 [docs/kakao-setup.md](kakao-setup.md) 참고.
2. `npm install` (이미 base 의존성은 설치되어 있고, `husky` prepare 스크립트가 pre-commit hook을 자동 연결한다).
3. 한 번만 실행해보려면 `node src/index.js --once`, 매일 자동 실행하려면 `node src/index.js` (단, 노트북이 꺼지면 예약 실행이 멈춘다 — 상시 자동화하려면 GitHub Actions 등 클라우드 스케줄러 필요).

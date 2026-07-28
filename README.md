# news-bot

매일 AI 뉴스 + 주식 뉴스를 자동으로 수집 → 요약 → 투자 관점 분석 → Slack/Telegram/카카오톡으로 알려주는 개인용 Node.js 봇.

## 무엇을 요청했나

- RSS/웹 뉴스에서 AI 뉴스 + 주식 뉴스를 매일 수집
- AI API로 카테고리별(AI/주식) 요약
- "30년 경력 투자 전문가" 페르소나로 현재 시장 전망과 매수 후보 제시 — 단, 낙관 편향 없이 근거(수치/출처/날짜) 기반으로, 단기(1일~1개월)/장기(6개월~1년+) 전망을 분리하고 리스크를 항상 함께 표시
- API 키/웹훅 토큰 같은 민감 정보가 git에 절대 올라가지 않게 보호
- 뉴스나 투자에 익숙하지 않은 사람도 한눈에 이해할 수 있는, 매일 같은 구조의 리포트

## 어떻게 진행했나

Claude Code의 [Agent Teams](https://code.claude.com/docs/ko/agent-teams) 기능으로 진행했습니다. 리더(메인 세션)가 공유 계약(`src/types.js`)을 먼저 정의해두고, 5명의 팀원을 병렬로 생성해 각자 다른 폴더를 담당하게 해서 파일 충돌 없이 동시에 개발했습니다:

| 팀원 | 담당 |
|---|---|
| collector | RSS 뉴스 수집 (`src/collectors/`) |
| summarizer | AI 요약 (`src/summarizer/`) |
| analyst | 투자 분석 (`src/analyst/`) |
| notifier | 리포트 생성 + 발송 + 스케줄러 (`src/notifier/`, `src/reporter/`) |
| security | 시크릿 보호 (`.env.example`, `scripts/`, `docs/SECURITY.md`) |

이후 리더가 전체 파이프라인을 통합(`src/index.js`)하고 실제로 실행해 검증했습니다. 전체 작업 분배·진행 로그는 [docs/news_bot_team.md](docs/news_bot_team.md)에 자세히 정리되어 있습니다.

## 진행하며 부딪힌 문제들과 해결 방식

처음 설계와 실제로 쓰면서 바뀐 부분들입니다 (전부 대화 중 발견/결정된 것):

1. **완전 무료로 운영하고 싶다** → 원래 Anthropic API로 만들었으나 유료(크레딧 충전) 전용이라, Google Gemini API(무료 티어)로 전체 AI 호출을 교체. (Ollama 로컬 모델도 검토했으나, 실행 시각에 컴퓨터가 켜져 있어야 해서 제외)
2. **회사 Slack/Teams는 IT 정책 때문에 막힘** → Incoming Webhook 생성에 관리자 승인이 필요한 것으로 추정되어 여러 방법(데스크톱/모바일 브라우저, Workflow Builder)을 시도했지만 결국 포기. 대신 개인 계정으로 완전히 자유로운 **카카오톡 "나에게 보내기"**로 전환.
3. **카카오톡은 파일 첨부가 안 됨** → 카카오 메모 API는 텍스트/링크만 지원하는 플랫폼 제약이 있어, 상세 HTML 리포트는 GitHub Pages에 공개 링크로 배포하고 그 링크를 카카오로 보내는 방식으로 대체.
4. **공개 링크인데 과거 이력이 다 보이면 안 되지 않나?** → 매번 새 파일을 쌓지 않고, 공개용 파일(`reports/daily-briefing.html`)은 매일 덮어써서 항상 "오늘 것"만 보이게 하고, 날짜별 이력은 로컬(`reports/YYYY-MM-DD.html`)에만 남기기로 함.
5. **노트북이 꺼져 있으면 예약 실행이 안 됨** → 현재는 `node-cron`이 로컬 프로세스가 켜져 있을 때만 동작. GitHub Actions로 옮겨서 노트북과 무관하게 클라우드에서 매일 자동 실행되도록 하는 작업이 다음 단계로 예정되어 있음 (진행 상황은 [docs/news_bot_team.md](docs/news_bot_team.md) 참고).

## 빠른 시작

```bash
cp .env.example .env
# .env를 열어 최소 GEMINI_API_KEY + 알림 채널(Slack, Telegram, 카카오 중 하나)을 채운다
npm install
node src/index.js --once   # 한 번만 실행해서 테스트
node src/index.js          # 매일 자동 실행 (프로세스가 계속 켜져 있어야 함)
```

- `GEMINI_API_KEY`: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)에서 무료 발급
- 카카오톡 채널을 쓰려면 [docs/kakao-setup.md](docs/kakao-setup.md) 먼저 따라가기

## 더 자세히 확인하고 싶으면

| 궁금한 것 | 볼 파일 |
|---|---|
| 전체 요구사항, 팀 구성, 작업 분배/진행 로그, 리더의 개입 기록 | [docs/news_bot_team.md](docs/news_bot_team.md) |
| 각 모듈이 왜/어떻게 만들어졌는지 (목적, 설계, 변경 이력) | [docs/collector.md](docs/collector.md), [docs/summarizer.md](docs/summarizer.md), [docs/analyst.md](docs/analyst.md), [docs/notifier.md](docs/notifier.md) |
| 시크릿/토큰 관리, 노출됐을 때 대처법 | [docs/SECURITY.md](docs/SECURITY.md) |
| 카카오톡 채널 설정 방법 (단계별) | [docs/kakao-setup.md](docs/kakao-setup.md) |
| 어떤 env 변수가 필요한지 | [.env.example](.env.example) |

# 보안 가이드 — 시크릿 보호

이 문서는 `news-bot` 프로젝트에서 API 키, 웹훅 URL, 봇 토큰 같은 민감 정보를
git 저장소에 절대 올리지 않기 위한 규칙과, 실수로 노출됐을 때 해야 할 일을
정리한 것입니다.

## 1. 왜 `.env`를 git에 올리면 안 되는가

- `.env`에는 `GEMINI_API_KEY`, `SLACK_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN` 등
  실제 값이 들어갑니다. 이 값들이 git 히스토리에 한 번이라도 커밋되면,
  이후에 파일을 지우거나 `.gitignore`에 추가해도 **과거 커밋 기록에는 그대로 남아**
  저장소 클론/포크/GitHub 검색 등으로 언제든 다시 노출될 수 있습니다.
- 특히 public 저장소라면 커밋 직후 몇 분 안에 크롤러가 토큰을 수집해
  악용하는 사례가 실제로 많습니다.
- 따라서 `.env`는 `.gitignore`에 등록되어 있고 (`node_modules/`, `*.log`와 함께),
  이 파일은 **항상 로컬(또는 배포 환경의 시크릿 매니저)에만 존재**해야 합니다.

## 2. `.env.example` 사용법

`.env.example`은 어떤 환경 변수가 필요한지 "키 이름만" 보여주는 템플릿입니다.
값은 절대 채우지 않습니다.

```
GEMINI_API_KEY=
SLACK_WEBHOOK_URL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
CRON_SCHEDULE=0 8 * * *
NEWS_RSS_FEEDS=
```

로컬에서 실행하려면:

```bash
cp .env.example .env
# .env 를 열어 실제 값을 채운다 (이 파일은 git에 절대 add 하지 않는다)
```

`CRON_SCHEDULE`, `NEWS_RSS_FEEDS`처럼 민감하지 않은 값은 `.env.example`에
기본값을 채워 넣어도 되지만, API 키/토큰/웹훅 URL류는 항상 비워둡니다.

## 3. pre-commit hook이 자동으로 막아주는 것

`husky` + `scripts/check-secrets.js` 조합으로 커밋 시 자동 검사가 동작합니다.

- `git commit` 실행 시 `.husky/pre-commit`이 `node scripts/check-secrets.js`를 실행
- 이 스크립트는 **스테이징된(staged) 파일의 내용만** 검사 (워킹 디렉토리가 아니라
  `git show ":<path>"`로 커밋될 실제 내용을 읽음)
- 아래 패턴 중 하나라도 걸리면 어떤 파일의 몇 번째 줄인지 출력하고 커밋을 중단시킵니다:
  - `sk-`로 시작하는 API 키 형태의 문자열
  - Slack 토큰 (`xoxb-`, `xoxp-`, `xoxa-`, `xoxr-`, `xoxs-`)
  - Telegram 봇 토큰 (`숫자:영숫자35자` 형태)
  - `GEMINI_API_KEY=`, `SLACK_WEBHOOK_URL=`, `TELEGRAM_BOT_TOKEN=`,
    `TELEGRAM_CHAT_ID=` 뒤에 값이 실제로 채워진 경우
- `.env.example`처럼 값이 비어 있는 경우(`KEY=`)는 통과합니다.
- 수동으로도 언제든 확인 가능: `npm run check-secrets`

이 훅은 **완벽한 방어막이 아니라 마지막 안전망**입니다. 패턴에 걸리지 않는
새로운 형태의 시크릿은 통과할 수 있으니, 커밋 전 `git diff --cached`로
스스로 한 번 더 확인하는 습관을 들이세요.

## 4. 앱 실행 시 필수 환경 변수 검증

`src/config.js`의 `validateEnv()`는 앱 시작 시 다음을 확인합니다.

- `GEMINI_API_KEY`는 항상 필수
- 알림 채널은 `SLACK_WEBHOOK_URL` 또는 (`TELEGRAM_BOT_TOKEN` +
  `TELEGRAM_CHAT_ID` 둘 다) 중 최소 하나가 필요

누락되면 어떤 변수가 빠졌는지 콘솔에 출력하고 `process.exit(1)`로 즉시
종료합니다. 값이 없는 상태로 배포되어 조용히 실패하는 상황을 막기 위함입니다.

## 5. 토큰/키가 실수로 노출됐을 때 즉시 해야 할 일

혹시 pre-commit hook을 우회했거나(`--no-verify`), 이미 push까지 된 경우:

1. **즉시 토큰을 재발급(rotate)한다.** git 히스토리에서 지우는 것보다
   토큰 자체를 무효화하는 게 훨씬 빠르고 확실합니다.
   - Google AI Studio: 노출된 API 키를 삭제(delete)하고 새 키 발급
   - Slack: 해당 Incoming Webhook을 삭제하고 새로 생성
   - Telegram: `@BotFather`에게 `/revoke`로 봇 토큰 재발급
2. 새 값으로 로컬 `.env`(그리고 배포 환경의 시크릿 저장소)를 갱신한다.
3. 저장소가 public이었거나 이미 push된 경우, 히스토리에서 완전히 제거할지
   검토한다 (`git filter-repo` 등). 단, 이미 재발급했다면 히스토리에 남은
   옛 값은 더 이상 유효하지 않으므로 위험도는 크게 낮아진다.
4. 언제, 어떤 값이, 어디까지 노출됐는지 팀에 공유하고 원인을 기록한다
   (예: 이번 저장소의 `docs/security-log.md`).

**핵심은 순서입니다: 히스토리 정리보다 토큰 재발급이 항상 먼저입니다.**

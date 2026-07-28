# security 팀원 작업 로그

> 사용자 대상 가이드는 [`docs/SECURITY.md`](./SECURITY.md)를 참고. 이 문서는
> `security` 팀원(나)의 작업 이력을 기록하는 내부 로그다.
>
> 참고: 이 프로젝트가 올라가 있는 macOS/APFS 볼륨은 기본적으로
> **대소문자를 구분하지 않는(case-insensitive)** 파일 시스템이라
> `docs/SECURITY.md`와 `docs/security.md`는 같은 파일로 충돌한다(실측 확인함:
> `docs/`에 `SECURITY.md`를 만든 뒤 `security.md`로 접근해도 동일 파일이 조회됨).
> 그래서 코디네이터가 요청한 "작업 로그용 `docs/security.md`"는 이 파일
> (`docs/security-log.md`)로 이름을 바꿔 만들었다.

## 1. 목적

이 프로젝트(`news-bot`)는 Anthropic API 키, Slack Webhook URL, Telegram
봇 토큰처럼 노출되면 즉시 악용 가능한 민감 정보를 다룬다. 팀 회의(계획
문서 `news_bot_team.md` 참고)에서 정리된 요구사항은 다음과 같다.

- `.env`는 절대 git에 커밋되면 안 된다 (`.gitignore` 처리).
- `.env.example`에는 키 이름만 있고 값은 비어 있어야 한다.
- 커밋 전 시크릿 패턴을 자동으로 검사해 실수로라도 올라가지 못하게 막는
  안전망(pre-commit hook)이 있어야 한다.
- 앱 구동 시 필수 환경 변수가 없으면 조용히 실패하지 않고 즉시 명확한
  에러로 알려줘야 한다.

이 문서는 그 요구사항을 어떻게 구현했는지, 왜 그렇게 했는지를 남겨서
이후에 이 영역을 수정할 사람(나 자신 포함)이 맥락을 다시 파악하지 않아도
되게 하기 위한 것이다.

## 2. 세부 진행 내역

### 2.1 pre-commit hook 동작 방식

- `husky`를 devDependency로 설치 (`npm install -D husky`, dependencies
  섹션은 건드리지 않음).
- `package.json`의 `scripts.prepare`에 `"husky"`를 추가해서, 누군가
  `npm install`을 실행하면 자동으로 `.husky/`가 셋업되고 git의
  `core.hooksPath`가 `.husky/_`로 연결되도록 함.
- `.husky/pre-commit` 파일 내용은 한 줄: `node scripts/check-secrets.js`
- 즉, `git commit`을 실행하는 순간 husky가 이 스크립트를 실행하고,
  스크립트가 0이 아닌 코드로 종료하면 커밋 자체가 중단된다.
- 실제로 로컬에서 가짜 시크릿(`ANTHROPIC_API_KEY=sk-ant-...`)을 담은
  파일을 스테이징하고 `git commit`을 실행해 **커밋이 실제로 막히는 것**을
  확인했고, 정상 파일(`.env.example`)은 통과하는 것도 확인했다.

### 2.2 `scripts/check-secrets.js` 검증 로직

- 대상: `git diff --cached --name-only --diff-filter=ACM`으로 얻은
  스테이징된(added/copied/modified) 파일 목록. 삭제된 파일은 제외.
- 각 파일은 워킹 디렉토리가 아니라 `git show ":<path>"`로 **스테이징된
  내용(인덱스)**을 읽어서 검사한다 — 부분 스테이징(`git add -p`) 상황에서도
  실제로 커밋될 내용만 검사하기 위함.
- 검사 패턴:
  1. `sk-`로 시작하는 16자 이상 API 키형 문자열 (Anthropic/OpenAI류)
  2. Slack 토큰: `xoxb-`/`xoxp-`/`xoxa-`/`xoxr-`/`xoxs-`
  3. Telegram 봇 토큰: `숫자(6~10자리):영숫자35자` 형태
  4. `ANTHROPIC_API_KEY` / `SLACK_WEBHOOK_URL` / `TELEGRAM_BOT_TOKEN` /
     `TELEGRAM_CHAT_ID` 가 `KEY=값` 형태로 등장하고 값이 비어있지 않은 경우
     (따옴표는 벗겨내고 판단, 주석(`#`)으로 시작하는 줄은 제외)
- `.env.example`처럼 `KEY=`만 있고 값이 없는 줄은 위 4번 규칙에서
  값 길이가 0이므로 통과한다 (요구사항대로 정상 동작 확인).
- 하나라도 걸리면 `파일:줄번호 [규칙]`과 해당 줄 내용을 출력하고
  `process.exit(1)`. 스테이징된 게 없으면 조용히 `exit(0)`.
- 수동 실행: `npm run check-secrets` (package.json에 이미 등록되어 있었음).

### 2.3 `src/config.js` 검증 항목

- `dotenv/config`로 `.env`를 로드.
- `validateEnv()` 함수가 다음을 검증:
  - `ANTHROPIC_API_KEY`: 항상 필수.
  - 알림 채널: `SLACK_WEBHOOK_URL` 단독, 또는 `TELEGRAM_BOT_TOKEN` +
    `TELEGRAM_CHAT_ID` 조합(**둘 다** 있어야 유효) 중 최소 하나.
  - Telegram 쪽 값이 절반만 채워진 경우(토큰만 있고 chat id가 없는 등)도
    구체적으로 어떤 변수가 부족한지 메시지에 명시.
- 누락 시 콘솔에 부족한 항목을 나열하고 `.env.example` 참고 안내 후
  `process.exit(1)`.
- 검증을 통과하면 `config` 객체(anthropicApiKey, slackWebhookUrl,
  telegramBotToken, telegramChatId, cronSchedule, newsRssFeeds)를 export.
- 로컬 테스트: 모두 비움(차단 확인), Slack만 채움(통과), Telegram
  토큰만 채우고 chat id 누락(구체적 에러 메시지 확인) 세 가지 케이스를
  직접 실행해 확인함.

### 2.4 코드 감사(audit) 결과

`src/collectors`, `src/summarizer`, `src/analyst`, `src/notifier`,
`src/reporter`에 대해 아래 패턴으로 `grep -rE` 감사 수행 (파일은 직접
수정하지 않음, 발견 시 SendMessage로만 보고하기로 되어 있음):

- `sk-` API 키 패턴
- Slack 토큰 패턴 (`xox[baprs]-`)
- Telegram 봇 토큰 패턴
- 하드코딩된 `hooks.slack.com` webhook URL
- 하드코딩된 `api.telegram.org/bot<token>` URL
- `API_KEY|SECRET|TOKEN|WEBHOOK_URL|CHAT_ID` 등이 리터럴 문자열에
  직접 대입된 경우

**결과: 위 다섯 디렉토리 전체에서 하드코딩된 시크릿은 발견되지 않았다.**
`process.env.*`로 값을 읽는 지점들을 확인했고, 모두 환경 변수 참조만
사용하고 있었다 (`src/summarizer/anthropicClient.js`, `src/analyst/client.js`
는 코드 주석에도 "API 키는 반드시 process.env로만 읽는다. 하드코딩 금지"라고
명시되어 있어 계약을 잘 지키고 있음).

참고(문제 보고 대상은 아니지만 기록): `src/notifier/adapters/slack.js`
주석에 `SLACK_BOT_TOKEN` / `SLACK_CHANNEL_ID`라는 이름이 언급되는데,
현재 `.env.example`/`config.js`는 `SLACK_WEBHOOK_URL` 체계를 쓴다. 시크릿
노출은 아니고 notifier 팀원 소관이라 직접 손대지 않았지만, 통합 단계에서
변수명 계약이 어긋나지 않는지 한 번 더 확인이 필요해 보여 참고용으로 남김.

## 3. 변경 이력 (Changelog)

### 2026-07-28 — 최초 구현

- `scripts/check-secrets.js` 작성 (staged 파일 시크릿 패턴 검사).
- `husky` devDependency 추가, `package.json`의 `scripts.prepare`에
  `"husky"` 추가, `.husky/pre-commit`에서 `node scripts/check-secrets.js`
  실행하도록 연결.
- `src/config.js` 작성 (`validateEnv()`, `config` export).
- `docs/SECURITY.md` 작성 (사용자 대상 가이드).
- `docs/security-log.md`(본 문서) 작성 (팀원 작업 로그, 파일명은 위
  APFS 대소문자 충돌 이슈로 `docs/security.md` 대신 사용).
- `src/collectors`, `src/summarizer`, `src/analyst`, `src/notifier`,
  `src/reporter`에 대해 하드코딩 시크릿 `grep -rE` 감사 수행 — 문제 없음
  확인, SendMessage로 main에게 보고.

앞으로 이 영역을 수정할 때는 이 섹션에 `날짜 — 요약` 형식으로 계속
추가할 것.

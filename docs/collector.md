# collectors 모듈

## 1. 목적

`news-bot`은 매일 AI 뉴스와 주식(증권/경제) 뉴스를 모아 요약·분석한 뒤 Slack/Telegram으로
알려주는 봇이다. 이 모듈(`src/collectors/`)은 그 파이프라인의 가장 앞단으로,
공개 RSS 피드에서 원본 뉴스 아이템을 가져와 팀 공용 계약인 `src/types.js`의
`NewsItem` 형태로 정규화하는 역할을 한다.

풀어야 하는 문제:
- 서로 형식이 다른 여러 RSS 피드(TechCrunch, VentureBeat, 국내 경제지 등)를
  하나의 일관된 데이터 모양(`NewsItem`)으로 통일해야, 뒤따르는
  `summarizer`/`analyst`/`notifier`/`reporter` 모듈이 소스에 신경 쓰지 않고
  동작할 수 있다.
- 운영 중 RSS 소스를 바꾸고 싶을 때 코드를 고치지 않고 `.env`의
  `NEWS_RSS_FEEDS`만 바꿔서 대응할 수 있어야 한다.
- 피드 하나가 죽거나 타임아웃 나더라도 전체 수집이 죽지 않아야 한다
  (매일 새벽 크론으로 자동 실행되는 특성상 부분 실패에 강해야 함).
- 이 모듈은 공개 RSS만 읽으므로 API 키/토큰이 전혀 필요 없다.

## 2. 세부 진행 내역

### 파일 구성

- `feeds.js` — 기본 RSS 소스 목록(`DEFAULT_FEEDS`)을 하드코딩한 설정 파일.
  각 항목은 `{ url, source, category }` 형태(`FeedConfig`).
- `normalize.js` — rss-parser가 반환하는 원본 아이템을 `NewsItem`으로
  변환하는 순수 함수 모음. 날짜 변환, 스니펫 추출, URL 기반 카테고리/출처
  추정 로직을 담당하며 네트워크 호출은 하지 않는다(테스트하기 쉬운 구조).
- `index.js` — `collectNews()`를 export하는 진입점. 피드 목록 결정,
  `rss-parser`로 실제 fetch, 결과 병합/에러 처리를 담당한다.

### 선택한 RSS 소스 (DEFAULT_FEEDS, 총 5개)

| 분류 | 출처 | URL |
|---|---|---|
| ai | TechCrunch AI | `https://techcrunch.com/category/artificial-intelligence/feed/` |
| ai | VentureBeat AI | `https://venturebeat.com/category/ai/feed/` |
| stock | 한국경제 증권 | `https://www.hankyung.com/feed/finance` |
| stock | 매일경제 증권 | `https://www.mk.co.kr/rss/50200011/` |
| stock | 연합뉴스 경제 | `https://www.yna.co.kr/rss/economy.xml` |

선정 기준: 실제로 존재하고 안정적으로 서비스되는 공개 RSS 위주로 골랐다.
"연합인포맥스"는 정확한 RSS 엔드포인트를 확신할 수 없어 제외하고, 대신
확실한 연합뉴스 경제 섹션(`yna.co.kr/rss/economy.xml`)으로 대체했다.
TechCrunch AI 피드는 실제 네트워크 호출로 정상 동작(아이템 다수 수신,
`NewsItem` 형태 일치)까지 확인했다.

### 함수 구조

- `resolveFeedList()` (`index.js`)
  - `.env`의 `NEWS_RSS_FEEDS`(콤마로 구분된 URL 목록)가 비어있지 않으면
    그 값으로 **기본 목록 전체를 오버라이드**한다(추가가 아니라 교체).
  - 오버라이드된 URL에는 `source`/`category` 메타데이터가 없으므로
    `normalize.js`의 `guessSourceFromUrl`(호스트명 사용)과
    `guessCategoryFromUrl`(URL 문자열 키워드 매칭, 불확실하면 `'ai'`로
    보수적 폴백)로 최선의 추정치를 채운다.
  - 그 외에는 `feeds.js`의 `DEFAULT_FEEDS`를 그대로 사용한다.
- `collectFromFeed(feedConfig)` (`index.js`, 비공개)
  - `rss-parser`의 `parseURL`로 피드 하나를 가져와
    `normalize.js`의 `normalizeItem`으로 각 아이템을 변환한다.
  - 네트워크/파싱 에러가 나면 예외를 던지지 않고 `console.error`로 로그만
    남긴 뒤 빈 배열을 반환한다 — 한 피드의 실패가 전체 수집을 막지 않도록.
- `collectNews()` (`index.js`, 공개 진입점)
  - `resolveFeedList()`로 얻은 모든 피드를 `Promise.all`로 병렬 fetch하고
    결과를 `flat()`으로 합쳐 `NewsItem[]`을 반환한다.
- `normalizeItem(item, feedConfig)` (`normalize.js`)
  - `title`/`url`/`source`/`publishedAt`/`category`/`snippet`을
    `NewsItem` 계약에 맞게 조립한다.
- `toIsoDate(value)` (`normalize.js`)
  - RSS의 다양한 날짜 포맷(RFC822/ISO 등)을 ISO 8601 문자열로 변환하고,
    파싱 불가 시 현재 시각으로 폴백한다.
- `buildSnippet(item)` (`normalize.js`)
  - `contentSnippet`/`summary`/`content` 중 있는 값을 공백 정리 후
    최대 200자로 잘라 스니펫을 만든다. 내용이 없으면 `undefined`
    (계약상 `snippet`은 선택 필드).

### 설계 원칙 / 제약

- `package.json`, `.env.example`, `.gitignore`, `src/types.js` 및 다른
  모듈(`summarizer`, `analyst`, `notifier`, `reporter`, `scripts`, `docs`)은
  전혀 수정하지 않았다. `src/collectors/` 하위 파일만 생성했다.
- API 키/토큰을 전혀 사용하지 않는다(공개 RSS만 읽음).
- `node --check`로 세 파일 모두 문법 검증 완료.

## 3. 변경 이력 (Changelog)

앞으로 이 모듈을 수정할 때마다 아래에 날짜 + 변경 내용을 계속 추가한다.

- **2026-07-28** (최초 구현, collector)
  - `src/collectors/feeds.js`, `src/collectors/normalize.js`,
    `src/collectors/index.js` 최초 작성.
  - `DEFAULT_FEEDS`에 AI 2개 + 증권/경제 3개, 총 5개 실제 공개 RSS 소스 하드코딩.
  - `collectNews()` export: `NewsItem[]` 반환, 개별 피드 실패 시 로그만
    남기고 전체 수집은 계속 진행하도록 구현.
  - `.env`의 `NEWS_RSS_FEEDS`로 기본 목록을 오버라이드하는 기능 구현
    (URL 기반 source/category 추정 포함).
  - `node --check` 문법 검증 통과, 실제 네트워크 호출로 TechCrunch AI 피드
    기준 247개 아이템 정상 수집 확인.

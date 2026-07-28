# 카카오톡 "나에게 보내기" 설정 가이드

## 1. 카카오 개발자 앱 만들기
1. [developers.kakao.com](https://developers.kakao.com) 접속 → 로그인 → **내 애플리케이션** → **애플리케이션 추가하기**
2. 앱 이름 아무거나 입력 (예: `news-bot`)
3. 생성된 앱 클릭 → **앱 키** 메뉴에서 **REST API 키** 복사 → `.env`의 `KAKAO_REST_API_KEY`에 붙여넣기
4. (선택) 앱 아이콘: [assets/kakao-app-icon.png](../assets/kakao-app-icon.png) 로 만들어둔 아이콘을 **앱 설정 > 일반**에서 업로드 가능

## 2. 카카오 로그인 활성화 + Redirect URI 등록
1. 왼쪽 메뉴 **카카오 로그인** → 활성화 스위치 켜기
2. **Redirect URI** 등록란에 정확히 아래 값을 추가:
   ```
   http://localhost:3000/oauth/callback
   ```
   (포트를 바꾸고 싶으면 `.env`의 `KAKAO_REDIRECT_URI`도 같이 바꿔야 함)

## 3. "카카오톡 메시지 전송" 동의항목 켜기
1. 왼쪽 메뉴 **카카오 로그인 > 동의항목**
2. **카카오톡 메시지 전송(talk_message)** 항목을 찾아 **필수 동의**로 설정
   - 개인 개발자 앱은 별도 검수 없이 본인 계정으로는 바로 사용 가능합니다 (다른 사람에게 보내는 게 아니라 "나에게 보내기"라서).

## 4. (선택) Client Secret
보안 강화를 위해 Client Secret을 켰다면, **보안** 메뉴에서 값 확인 후 `.env`의 `KAKAO_CLIENT_SECRET`에 붙여넣기. 켜지 않았다면 비워둬도 됩니다.

## 5. 1회성 인증 실행
```bash
node scripts/kakao-auth.js
```
- 콘솔에 뜨는 URL을 브라우저에서 열기
- 카카오 로그인 → 동의 화면에서 **동의하고 계속하기**
- 터미널에 `KAKAO_REFRESH_TOKEN=...` 값이 출력되면 그대로 복사해서 `.env`에 붙여넣기

## 6. 확인
```bash
node src/index.js --once
```
실행 후 카카오톡 "나에게 보내기"(카카오톡 앱에서 본인과의 채팅방, 보통 상단 고정된 "나와의 채팅")로 메시지가 오면 성공입니다.

## 참고: 카카오는 파일 첨부가 안 됨 → 링크로 대체
카카오톡 메모 API는 텍스트/링크 형태만 지원하고 실제 파일(HTML 리포트)을 첨부할 수 없습니다. 대신 `.env`에 `REPORT_PUBLIC_URL`을 설정해두면, 카카오로 그 링크가 옵니다(링크 탭하면 리포트가 브라우저에서 바로 열림).

### GitHub Pages로 링크 만들기 (무료, 1회만 설정)
1. GitHub 저장소 페이지 → **Settings** → **Pages**
2. **Build and deployment** → Source를 **GitHub Actions**로 선택 (branch 방식이 아니라 Actions 방식 추천 — 뒤에서 만들 자동화 워크플로와 자연스럽게 연결됨)
3. 이 저장소 기준 리포트 URL은 다음과 같습니다 (이미 `.env.example`에 기본값으로 채워둠):
   ```
   https://starsk619.github.io/claude-practice/reports/daily-briefing.html
   ```
4. `.env`의 `REPORT_PUBLIC_URL`에 위 값을 채우기 (또는 `.env.example` 기본값 그대로 사용)

**중요**: 이 URL은 저장소가 private이어도 **링크를 아는 사람은 누구나 볼 수 있는 공개 URL**입니다(완전 비공개 아님, 검색엔진 노출은 막을 수 있음). 매일 `daily-briefing.html` 하나만 덮어써서 배포하기 때문에, 과거 리포트 이력이 이 링크로 누적 노출되지는 않습니다.

실제로 매일 자동 배포까지 되려면 GitHub Actions 워크플로가 필요합니다 — 이건 "노트북 꺼져 있어도 자동 실행" 설정과 함께 이어서 진행합니다.

### 파일까지 로컬에서 직접 보고 싶다면
노트북에서 직접 실행한 경우, `reports/YYYY-MM-DD.html`(날짜별 이력)이 그대로 남아있어 언제든 열어볼 수 있습니다. 텔레그램을 함께 설정해두면 그 파일 자체를 매번 전달받을 수도 있습니다 (`sendDailyReport`는 등록된 모든 채널에 동시 발송함).

## 토큰 만료 시
`refresh_token`은 보통 몇 달간 유효합니다. 유효기간이 다 되면 `node scripts/kakao-auth.js`를 다시 실행해서 새로 발급받으면 됩니다. 유효기간이 1개월 미만으로 남았을 때 자동 발송 과정에서 새 `refresh_token`이 발급되면, 콘솔(로그)에 경고와 함께 새 값이 출력되니 그때 `.env`를 갱신해주세요.

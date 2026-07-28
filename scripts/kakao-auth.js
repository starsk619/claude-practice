#!/usr/bin/env node
/**
 * 카카오톡 "나에게 보내기" 1회성 인증 스크립트.
 *
 * Kakao Login은 OAuth 방식이라 최초 1번은 사람이 브라우저에서 로그인/동의를 해줘야
 * refresh_token을 받을 수 있다(이후로는 이 스크립트를 다시 실행할 필요 없이,
 * notifier의 kakao 어댑터가 refresh_token으로 access_token을 자동 갱신한다).
 *
 * 사전 준비 (developers.kakao.com):
 *   1. 애플리케이션 추가 → REST API 키 확인 → .env의 KAKAO_REST_API_KEY에 입력
 *   2. 카카오 로그인 활성화 → Redirect URI에 아래 KAKAO_REDIRECT_URI 값을 정확히 등록
 *      (기본값: http://localhost:3000/oauth/callback)
 *   3. 카카오 로그인 > 동의항목에서 "카카오톡 메시지 전송"(talk_message) 항목을 "필수 동의"로 설정
 *   4. (선택) 보안 > Client Secret을 활성화했다면 KAKAO_CLIENT_SECRET도 .env에 입력
 *
 * 실행: node scripts/kakao-auth.js
 *   → 콘솔에 뜨는 URL을 브라우저에서 열어 카카오 로그인/동의
 *   → 이 스크립트가 자동으로 refresh_token을 받아 콘솔에 출력
 *   → 출력된 값을 .env의 KAKAO_REFRESH_TOKEN에 복사
 */
import 'dotenv/config';
import http from 'node:http';

const REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET; // 선택 사항
const REDIRECT_URI = process.env.KAKAO_REDIRECT_URI || 'http://localhost:3000/oauth/callback';

if (!REST_API_KEY) {
  console.error('[kakao-auth] KAKAO_REST_API_KEY가 .env에 없습니다. 먼저 설정하세요.');
  process.exit(1);
}

const redirectUrl = new URL(REDIRECT_URI);
const port = Number(redirectUrl.port) || 80;
const callbackPath = redirectUrl.pathname;

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: REST_API_KEY,
    redirect_uri: REDIRECT_URI,
    code,
  });
  if (CLIENT_SECRET) {
    body.set('client_secret', CLIENT_SECRET);
  }

  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`토큰 교환 실패: ${JSON.stringify(json)}`);
  }
  return json;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname !== callbackPath) {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(
      `<h2>인증 실패</h2><p>${error}</p><p>터미널을 확인하세요.</p>`
    );
    console.error('[kakao-auth] 카카오가 에러를 반환했습니다:', error);
    server.close(() => process.exit(1));
    return;
  }

  if (!code) {
    res.writeHead(400).end('code 파라미터가 없습니다.');
    return;
  }

  try {
    const token = await exchangeCodeForToken(code);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(
      '<h2>인증 완료!</h2><p>터미널로 돌아가서 refresh_token을 .env에 복사하세요. 이 창은 닫아도 됩니다.</p>'
    );

    console.log('\n[kakao-auth] 인증 성공. 아래 값을 .env의 KAKAO_REFRESH_TOKEN에 붙여넣으세요:\n');
    console.log(`KAKAO_REFRESH_TOKEN=${token.refresh_token}\n`);
    console.log(
      `(참고: access_token은 ${token.expires_in}초, refresh_token은 ${token.refresh_token_expires_in}초 동안 유효합니다. ` +
        'access_token은 notifier가 매번 자동으로 새로 발급받으므로 저장할 필요 없습니다.)\n'
    );
  } catch (err) {
    console.error('[kakao-auth] 토큰 교환 중 오류:', err.message);
    res.writeHead(500).end('토큰 교환 실패. 터미널을 확인하세요.');
  } finally {
    server.close(() => process.exit(0));
  }
});

server.listen(port, () => {
  const authorizeUrl = new URL('https://kauth.kakao.com/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', REST_API_KEY);
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'talk_message');

  console.log('\n[kakao-auth] 아래 URL을 브라우저에서 열어 카카오 로그인/동의를 진행하세요:\n');
  console.log(authorizeUrl.toString());
  console.log(`\n(로컬에서 ${REDIRECT_URI} 콜백을 기다리는 중...)\n`);
});

/**
 * 카카오톡 "나에게 보내기" 어댑터.
 *
 * - Kakao Login(OAuth)의 refresh_token으로 매 발송마다 새 access_token을 발급받아
 *   https://kapi.kakao.com/v2/api/talk/memo/default/send 로 text 템플릿을 전송한다.
 * - refresh_token 최초 발급은 사람이 브라우저로 1회 로그인해야 하므로 scripts/kakao-auth.js로
 *   따로 진행한다(이 어댑터는 이미 발급된 KAKAO_REFRESH_TOKEN이 있다고 가정).
 * - 카카오 "나에게 보내기" 메모 API는 파일 첨부를 지원하지 않는다(텍스트/링크형 템플릿만 가능).
 *   그래서 sendFile()은 실제 파일을 못 올리는 대신, 리포트가 로컬에 저장됐다는 안내 텍스트만 보낸다
 *   (Slack의 파일첨부 제약과 동일한 패턴으로 조용히 실패하지 않고 안내로 대체).
 */

const REST_API_KEY_ENV = 'KAKAO_REST_API_KEY';
const CLIENT_SECRET_ENV = 'KAKAO_CLIENT_SECRET'; // 선택 사항 (앱에서 활성화한 경우에만)
const REFRESH_TOKEN_ENV = 'KAKAO_REFRESH_TOKEN';

const TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const MEMO_SEND_URL = 'https://kapi.kakao.com/v2/api/talk/memo/default/send';
const TEXT_MAX_LENGTH = 200; // 카카오 text 템플릿 최대 길이
const FALLBACK_LINK = 'https://developers.kakao.com/'; // link는 필수 필드라 마땅한 대상이 없을 때 사용

function requireConfig() {
  const restApiKey = process.env[REST_API_KEY_ENV];
  const refreshToken = process.env[REFRESH_TOKEN_ENV];
  if (!restApiKey) throw new Error(`${REST_API_KEY_ENV} 환경변수가 설정되지 않았습니다.`);
  if (!refreshToken) {
    throw new Error(
      `${REFRESH_TOKEN_ENV} 환경변수가 설정되지 않았습니다. 먼저 "node scripts/kakao-auth.js"로 인증하세요.`
    );
  }
  return { restApiKey, clientSecret: process.env[CLIENT_SECRET_ENV], refreshToken };
}

/**
 * refresh_token으로 새 access_token을 발급받는다.
 * 카카오는 refresh_token 남은 유효기간이 1개월 미만일 때만 새 refresh_token을 함께 내려주는데,
 * GitHub Actions 예약 실행에서는 사람이 로그를 매일 보지 않으므로 콘솔 경고만으로는 놓치기
 * 쉽다. 그래서 새 refresh_token 자체는 반환값으로 알려주고, 실제 알림은 sendTemplate에서
 * 카카오톡 메시지로 한 번 더 보낸다 (.env/시크릿을 앱이 직접 고쳐쓰지는 않음 - 예상치 못한
 * 부작용을 막기 위해 항상 사람이 직접 갱신하게 함).
 * @returns {Promise<{ accessToken: string, newRefreshToken: string | null }>}
 */
async function refreshAccessToken() {
  const { restApiKey, clientSecret, refreshToken } = requireConfig();

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: restApiKey,
    refresh_token: refreshToken,
  });
  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body,
  });
  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.access_token) {
    const desc = json?.error_description ?? `HTTP ${res.status}`;
    throw new Error(
      `[kakao] access_token 갱신 실패: ${desc} (refresh_token이 만료됐다면 node scripts/kakao-auth.js를 다시 실행하세요)`
    );
  }

  if (json.refresh_token) {
    console.warn(
      '[kakao] 카카오가 새 refresh_token을 발급했습니다. GitHub Secrets의 KAKAO_REFRESH_TOKEN을 갱신하세요 (이 실행 로그에서 값 확인 가능).'
    );
    console.warn(`KAKAO_REFRESH_TOKEN=${json.refresh_token}`);
  }

  return { accessToken: json.access_token, newRefreshToken: json.refresh_token ?? null };
}

/** accessToken을 이미 갖고 있을 때 사용하는 저수준 발송 함수 (refreshAccessToken 재호출 없음). */
async function sendWithToken(accessToken, templateObject) {
  const body = new URLSearchParams({
    template_object: JSON.stringify(templateObject),
  });

  const res = await fetch(MEMO_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body,
  });
  const json = await res.json().catch(() => null);

  if (!res.ok || json?.result_code !== 0) {
    const desc = json?.msg ?? `HTTP ${res.status}`;
    throw new Error(`[kakao] 메시지 전송 실패: ${desc}`);
  }
  return { ok: true };
}

/**
 * refresh_token이 새로 발급된 경우, 실제로 매일 확인하는 카카오톡으로 갱신 필요 알림을 보낸다.
 * (실제 새 토큰 값은 보안상 메시지에 담지 않고, GitHub Actions 로그를 확인하라고만 안내)
 * 알림 발송 자체가 실패해도 메인 메시지 발송 결과에는 영향을 주지 않는다(best-effort).
 */
async function notifyRefreshTokenRotated(accessToken) {
  try {
    await sendWithToken(accessToken, {
      object_type: 'text',
      text: '⚠️ [news-bot] 카카오 리프레시 토큰이 새로 발급됐습니다. GitHub Actions 실행 로그에서 새 값을 확인해 Secrets의 KAKAO_REFRESH_TOKEN을 갱신해주세요. 갱신하지 않으면 기존 토큰 만료 시 리포트 발송이 멈춥니다.',
      link: { web_url: FALLBACK_LINK, mobile_web_url: FALLBACK_LINK },
    });
  } catch (err) {
    console.error('[kakao] 리프레시 토큰 갱신 알림 발송 실패 (원본 메시지는 정상 발송됨):', err);
  }
}

async function sendTemplate(templateObject) {
  const { accessToken, newRefreshToken } = await refreshAccessToken();
  const result = await sendWithToken(accessToken, templateObject);

  if (newRefreshToken) {
    await notifyRefreshTokenRotated(accessToken);
  }

  return result;
}

/**
 * @param {string} text
 */
async function sendText(text) {
  const truncated =
    text.length > TEXT_MAX_LENGTH ? `${text.slice(0, TEXT_MAX_LENGTH - 1)}…` : text;
  // 카카오 앱에 등록된 "웹 도메인"이 아닌 링크는 인앱 브라우저에서 열리지 않으므로
  // (developers.kakao.com은 미등록 도메인이라 404), 등록된 REPORT_PUBLIC_URL을 우선 사용한다.
  const link = process.env.REPORT_PUBLIC_URL || FALLBACK_LINK;

  return sendTemplate({
    object_type: 'text',
    text: truncated,
    link: { web_url: link, mobile_web_url: link },
    button_title: '📄 리포트 보기',
  });
}

/**
 * 카카오 메모 API는 실제 파일 업로드를 지원하지 않는다. 대신 payload.url(예: GitHub Pages에
 * 배포된 공개 링크)이 있으면 그 링크를 버튼과 함께 보내고, 없으면 파일이 로컬에만 저장됐다는
 * 안내 텍스트로 대체한다.
 * @param {{ filename: string, caption?: string, url?: string }} payload
 */
async function sendFile({ filename, caption, url }) {
  if (url) {
    return sendTemplate({
      object_type: 'text',
      text: (caption || `오늘의 상세 리포트: ${filename}`).slice(0, TEXT_MAX_LENGTH),
      link: { web_url: url, mobile_web_url: url },
      button_title: '리포트 보기',
    });
  }

  await sendText(
    `📎 "${filename}" 상세 리포트가 생성됐지만, 카카오톡 메모 API는 파일 첨부를 지원하지 않아 여기로는 보낼 수 없습니다. ${caption ?? ''}`.trim()
  );
  return { ok: false, skipped: true, reason: 'Kakao 나에게 보내기 API는 파일 첨부 미지원 (url 없음)' };
}

export const kakaoAdapter = {
  name: 'kakao',
  sendText,
  sendFile,
  // 카카오 메모 API는 실제 파일 첨부가 불가능해서 sendFile도 결국 "링크가 붙은 텍스트
  // 메시지"일 뿐이다. sendText가 이미 같은 링크를 붙이므로, notifier가 이 값을 보고
  // sendFile 호출(중복 메시지)을 건너뛴다.
  supportsFileAttachment: false,
};

/**
 * Slack 어댑터.
 *
 * - 텍스트 발송: SLACK_WEBHOOK_URL (Incoming Webhook)을 사용한다. 계약(.env.example)에 정의된
 *   유일한 Slack 설정값이며, 네이티브 fetch로 POST하는 아주 단순한 방식이라 별도 SDK가 필요 없다.
 * - 파일 첨부: Slack의 Incoming Webhook은 파일 업로드를 지원하지 않는다(플랫폼 자체 제약).
 *   파일을 실제로 올리려면 Bot Token 기반의 files.getUploadURLExternal → (업로드) →
 *   files.completeUploadExternal 3단계 플로우가 필요하다. 이를 위해 선택적으로
 *   process.env.SLACK_BOT_TOKEN / process.env.SLACK_CHANNEL_ID 를 읽되(.env.example에는
 *   아직 없음 — 이 두 값을 정식으로 쓰려면 리더/보안 담당과 상의해 .env.example에 추가해야 함),
 *   없을 경우에는 조용히 실패하지 않고 webhook으로 "리포트가 어디 있는지"만 텍스트로 안내한다.
 */

const WEBHOOK_ENV = 'SLACK_WEBHOOK_URL';
const BOT_TOKEN_ENV = 'SLACK_BOT_TOKEN'; // 선택 사항 (파일 첨부 시에만 필요)
const CHANNEL_ID_ENV = 'SLACK_CHANNEL_ID'; // 선택 사항 (파일 첨부 시에만 필요)

function requireWebhookUrl() {
  const url = process.env[WEBHOOK_ENV];
  if (!url) {
    throw new Error(`${WEBHOOK_ENV} 환경변수가 설정되지 않았습니다.`);
  }
  return url;
}

/**
 * @param {string} text
 */
async function sendText(text) {
  const url = requireWebhookUrl();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[slack] 메시지 전송 실패 (${res.status}): ${body}`);
  }
  return { ok: true };
}

/**
 * @param {{ filePath: string, filename: string, caption?: string, fileBuffer: Buffer }} payload
 */
async function sendFile({ filename, caption, fileBuffer }) {
  const botToken = process.env[BOT_TOKEN_ENV];
  const channelId = process.env[CHANNEL_ID_ENV];

  if (!botToken || !channelId) {
    // Incoming Webhook만으로는 파일을 올릴 수 없으므로, 최소한 상황을 알리는 텍스트라도 보낸다.
    await sendText(
      `📎 "${filename}" 리포트 파일을 Slack에 직접 첨부하려면 ${BOT_TOKEN_ENV}, ${CHANNEL_ID_ENV} 환경변수가 필요합니다. ` +
        `(현재는 설정되어 있지 않아 파일 첨부를 건너뜁니다.) ${caption ?? ''}`.trim(),
    );
    return { ok: false, skipped: true, reason: 'missing SLACK_BOT_TOKEN/SLACK_CHANNEL_ID' };
  }

  const authHeaders = { Authorization: `Bearer ${botToken}` };

  // 1) 업로드 URL 발급
  const getUrlRes = await fetch('https://slack.com/api/files.getUploadURLExternal', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ filename, length: String(fileBuffer.byteLength) }),
  });
  const getUrlJson = await getUrlRes.json();
  if (!getUrlJson.ok) {
    throw new Error(`[slack] 업로드 URL 발급 실패: ${getUrlJson.error}`);
  }

  // 2) 실제 파일 바이트 업로드
  const uploadForm = new FormData();
  uploadForm.append('file', new Blob([fileBuffer], { type: 'text/html' }), filename);
  const uploadRes = await fetch(getUrlJson.upload_url, { method: 'POST', body: uploadForm });
  if (!uploadRes.ok) {
    throw new Error(`[slack] 파일 업로드 실패 (${uploadRes.status})`);
  }

  // 3) 업로드 완료 처리 + 채널 공유
  const completeRes = await fetch('https://slack.com/api/files.completeUploadExternal', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      files: [{ id: getUrlJson.file_id, title: filename }],
      channel_id: channelId,
      initial_comment: caption ?? '',
    }),
  });
  const completeJson = await completeRes.json();
  if (!completeJson.ok) {
    throw new Error(`[slack] 업로드 완료 처리 실패: ${completeJson.error}`);
  }

  return { ok: true };
}

export const slackAdapter = {
  name: 'slack',
  sendText,
  sendFile,
};

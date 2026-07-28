/**
 * Telegram 어댑터.
 *
 * Telegram Bot API는 봇 토큰 하나로 텍스트 발송(sendMessage)과 파일 첨부(sendDocument)를
 * 모두 지원하므로, Slack과 달리 별도 토큰 승격 없이 계약된 env(.env.example)만으로
 * "핵심 헤드라인 텍스트 + HTML 리포트 파일 첨부" 요구사항을 온전히 만족한다.
 * 네이티브 fetch + FormData만 사용하고 별도 SDK는 설치하지 않는다.
 */

const BOT_TOKEN_ENV = 'TELEGRAM_BOT_TOKEN';
const CHAT_ID_ENV = 'TELEGRAM_CHAT_ID';

function requireConfig() {
  const botToken = process.env[BOT_TOKEN_ENV];
  const chatId = process.env[CHAT_ID_ENV];
  if (!botToken) throw new Error(`${BOT_TOKEN_ENV} 환경변수가 설정되지 않았습니다.`);
  if (!chatId) throw new Error(`${CHAT_ID_ENV} 환경변수가 설정되지 않았습니다.`);
  return { botToken, chatId };
}

async function callTelegramApi(botToken, method, init) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, init);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    const desc = json?.description ?? `HTTP ${res.status}`;
    throw new Error(`[telegram] ${method} 실패: ${desc}`);
  }
  return json;
}

/**
 * @param {string} text
 */
async function sendText(text) {
  const { botToken, chatId } = requireConfig();
  await callTelegramApi(botToken, 'sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return { ok: true };
}

/**
 * @param {{ filename: string, caption?: string, fileBuffer: Buffer }} payload
 */
async function sendFile({ filename, caption, fileBuffer }) {
  const { botToken, chatId } = requireConfig();

  const form = new FormData();
  form.append('chat_id', chatId);
  if (caption) form.append('caption', caption);
  form.append('document', new Blob([fileBuffer], { type: 'text/html' }), filename);

  await callTelegramApi(botToken, 'sendDocument', { method: 'POST', body: form });
  return { ok: true };
}

export const telegramAdapter = {
  name: 'telegram',
  sendText,
  sendFile,
};

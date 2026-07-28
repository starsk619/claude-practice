import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { getChannel, listChannels, registerChannel } from './channels.js';
import { scheduleDailyRun } from './scheduler.js';
import { buildShortDigest } from '../reporter/index.js';

export { scheduleDailyRun } from './scheduler.js';
export { registerChannel, listChannels } from './channels.js';

/**
 * 공통 발송 인터페이스.
 * payload가 filePath를 담고 있으면 파일 첨부(sendFile), text만 있으면 텍스트 발송(sendText).
 *
 * @param {string} channel - 'slack' | 'telegram' | 'kakao' (추후 다른 채널도 추가 가능)
 * @param {{ text?: string, filePath?: string, filename?: string, caption?: string, url?: string }} payload
 */
export async function sendMessage(channel, payload) {
  const adapter = getChannel(channel);

  if (payload?.filePath) {
    const fileBuffer = await readFile(payload.filePath);
    const filename = payload.filename ?? path.basename(payload.filePath);
    return adapter.sendFile({
      filePath: payload.filePath,
      filename,
      caption: payload.caption,
      fileBuffer,
      url: payload.url,
    });
  }

  const text = typeof payload === 'string' ? payload : payload?.text;
  if (!text) {
    throw new Error('sendMessage(channel, payload): payload.text 또는 payload.filePath가 필요합니다.');
  }
  return adapter.sendText(text);
}

/**
 * 오늘의 리포트를 여러 채널에 발송한다.
 * - 실제 파일 첨부가 가능한 채널(slack/telegram, adapter.supportsFileAttachment === true):
 *   1) 짧은 헤드라인 다이제스트 텍스트 발송 2) HTML 리포트 파일 첨부 발송 (두 메시지 모두 의미가 다름)
 * - 파일 첨부가 불가능한 채널(카카오 등): 다이제스트 텍스트 1건만 발송한다. sendText가 이미
 *   reportUrl로 가는 링크 버튼을 붙이므로, 별도 sendFile 호출은 같은 링크를 또 보내는
 *   중복 메시지가 되어 생략한다.
 * 한 채널이 실패해도 나머지 채널 발송은 계속 진행한다(부분 실패 허용).
 *
 * @param {{
 *   channels: string[],
 *   summaryResult: import('../types.js').SummaryResult,
 *   analystResult: import('../types.js').AnalystResult,
 *   reportPath: string,
 *   reportUrl?: string,
 * }} params
 * @returns {Promise<Array<{channel: string, ok: boolean, error?: string}>>}
 */
export async function sendDailyReport({ channels, summaryResult, analystResult, reportPath, reportUrl }) {
  if (!channels?.length) {
    throw new Error('sendDailyReport: channels 배열이 비어 있습니다.');
  }
  if (!reportPath) {
    throw new Error('sendDailyReport: reportPath가 필요합니다.');
  }

  const digest = buildShortDigest(summaryResult, analystResult);
  const filename = path.basename(reportPath);
  const results = [];

  for (const channel of channels) {
    try {
      await sendMessage(channel, { text: digest });

      const adapter = getChannel(channel);
      if (adapter.supportsFileAttachment) {
        await sendMessage(channel, {
          filePath: reportPath,
          filename,
          caption: '오늘의 상세 리포트입니다.',
          url: reportUrl,
        });
      }
      results.push({ channel, ok: true });
    } catch (err) {
      console.error(`[notifier] "${channel}" 채널 발송 실패:`, err);
      results.push({ channel, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return results;
}

export { buildShortDigest };

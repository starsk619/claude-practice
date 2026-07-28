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
 * 1) 짧은 헤드라인 다이제스트(3~5줄) 텍스트 발송
 * 2) 생성된 HTML 리포트 파일 첨부 발송 (파일 첨부를 지원하지 않는 채널은 reportUrl이 있으면
 *    링크로, 없으면 안내 텍스트로 각자 알아서 대체 처리 - 어댑터별 sendFile 구현에 위임)
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
      await sendMessage(channel, {
        filePath: reportPath,
        filename,
        caption: '오늘의 상세 리포트입니다.',
        url: reportUrl,
      });
      results.push({ channel, ok: true });
    } catch (err) {
      console.error(`[notifier] "${channel}" 채널 발송 실패:`, err);
      results.push({ channel, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return results;
}

export { buildShortDigest };

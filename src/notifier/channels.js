/**
 * 채널 어댑터 레지스트리.
 *
 * 모든 어댑터는 공통 인터페이스를 따른다:
 *   { name: string, sendText(text): Promise, sendFile({filename, caption, fileBuffer}): Promise }
 *
 * 카카오톡을 나중에 추가할 때는:
 *   1) src/notifier/adapters/kakao.js 에 같은 인터페이스로 구현
 *   2) 아래에서 import 후 registerChannel(kakaoAdapter) 한 줄만 추가
 * 하면 되고, index.js의 sendMessage/sendDailyReport 로직은 전혀 손댈 필요가 없다.
 */

import { slackAdapter } from './adapters/slack.js';
import { telegramAdapter } from './adapters/telegram.js';
import { kakaoAdapter } from './adapters/kakao.js';

/** @type {Map<string, {name: string, sendText: Function, sendFile: Function}>} */
const registry = new Map();

export function registerChannel(adapter) {
  registry.set(adapter.name, adapter);
}

export function getChannel(name) {
  const adapter = registry.get(name);
  if (!adapter) {
    throw new Error(`알 수 없는 알림 채널입니다: "${name}" (등록된 채널: ${listChannels().join(', ')})`);
  }
  return adapter;
}

export function listChannels() {
  return [...registry.keys()];
}

registerChannel(slackAdapter);
registerChannel(telegramAdapter);
registerChannel(kakaoAdapter);

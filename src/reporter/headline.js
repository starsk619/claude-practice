import { RATING_STYLE } from './ratings.js';
import { formatShortDate } from './htmlUtils.js';

/**
 * picks 배열에서 rating별 개수를 센다.
 * @param {import('../types.js').StockPick[]} [picks]
 */
export function countByRating(picks = []) {
  const counts = { '매수 고려': 0, '관망': 0, '주의': 0 };
  for (const pick of picks) {
    if (pick && Object.prototype.hasOwnProperty.call(counts, pick.rating)) {
      counts[pick.rating] += 1;
    }
  }
  return counts;
}

/**
 * 애널리스트가 생성한 시장 총평(analystResult.headline)을 리포트/다이제스트에 넣기 좋은
 * "오늘의 한줄 결론: ..." 형태로 감싼다. 종목명을 나열하지 않는 짧은 시장 한줄평이라
 * 리포트 최상단과 메신저 다이제스트 양쪽에서 재사용해 "매일 같은 톤"을 보장한다.
 * @param {import('../types.js').AnalystResult} [analystResult]
 * @returns {string}
 */
export function buildHeadline(analystResult) {
  const headline = analystResult?.headline;
  if (!headline) {
    return '오늘의 한줄 결론: 오늘은 특별히 짚을 시장 총평이 없어요 — 아래 시장 전망만 참고해주세요.';
  }
  return `오늘의 한줄 결론: ${headline}`;
}

/**
 * Slack/Telegram에 보낼 짧은 다이제스트(3~5줄)를 만든다.
 * 1줄: 날짜+타이틀, 2줄: 한줄 결론, 3~5줄: 상위 종목 최대 3개(신호등 이모지 포함).
 * @param {import('../types.js').SummaryResult} [summaryResult]
 * @param {import('../types.js').AnalystResult} [analystResult]
 * @returns {string}
 */
export function buildShortDigest(summaryResult, analystResult) {
  const dateText = formatShortDate(analystResult?.generatedAt ?? summaryResult?.generatedAt);
  // 앞에 봇 표시를 붙여서, 카카오톡 "나와의 채팅"에서 본인이 직접 쓴 메모와 헷갈리지 않게 한다.
  const lines = [`🤖 [news-bot] ${dateText ? `${dateText} ` : ''}AI/주식 뉴스 리포트`.trim()];

  lines.push(buildHeadline(analystResult));

  const topPicks = (analystResult?.picks ?? []).slice(0, 3);
  for (const pick of topPicks) {
    const style = RATING_STYLE[pick?.rating];
    const emoji = style ? style.emoji : '⚪';
    lines.push(`${emoji} ${pick?.name ?? '종목명 미상'}(${pick?.ticker ?? '-'}) - ${pick?.rating ?? '정보 없음'}`);
  }

  // 최대 5줄만 발송 (헤더 1 + 결론 1 + 종목 최대 3)
  return lines.slice(0, 5).join('\n');
}

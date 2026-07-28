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
 * 마크다운 스타일 **굵게** 마커와 줄바꿈을 제거해서, 헤드라인/다이제스트 같은
 * "짧은 평문" 맥락에 넣기 좋은 문자열로 만든다.
 * @param {string} [text]
 * @param {number} [maxLen]
 * @returns {string}
 */
function shortPhrase(text, maxLen = 40) {
  if (!text) return '';
  const clean = String(text).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}

/**
 * 전문용어 없이, "지금 뜨는 건 뭐고 지금 지는 건 뭔지"를 구체적으로 말하는 한줄 요약을 만든다.
 * 리포트 최상단과 메신저 다이제스트 양쪽에서 재사용해 "매일 같은 톤"을 보장한다.
 * @param {import('../types.js').AnalystResult} [analystResult]
 * @returns {string}
 */
export function buildHeadline(analystResult) {
  const picks = analystResult?.picks ?? [];

  if (!picks.length) {
    return '오늘의 한줄 결론: 오늘은 특별히 짚을 종목이 없어요 — 아래 시장 전망만 참고해주세요.';
  }

  const rising = picks.find((p) => p?.rating === '매수 고려');
  const falling = picks.find((p) => p?.rating === '주의');

  const parts = [];
  if (rising) {
    parts.push(`📈 지금 뜨는 건 ${rising.name ?? '종목 미상'} — ${shortPhrase(rising.rationale)}`);
  }
  if (falling) {
    parts.push(`📉 지금 지는 건 ${falling.name ?? '종목 미상'} — ${shortPhrase(falling.rationale)}`);
  }

  if (!parts.length) {
    const counts = countByRating(picks);
    return `오늘의 한줄 결론: 오늘은 대부분 관망(${counts['관망']}개) 구간이에요 — 뚜렷한 방향 없이 지켜봐야 하는 하루예요.`;
  }

  return `오늘의 한줄 결론: ${parts.join(' / ')}`;
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

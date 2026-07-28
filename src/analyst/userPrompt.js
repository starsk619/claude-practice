/**
 * SummaryResult -> 모델에 전달할 user 메시지 텍스트 빌더.
 */

const MAX_SOURCE_ITEMS = 30; // 프롬프트 길이 폭주 방지
const MAX_SNIPPET_LENGTH = 300;

/**
 * @param {import('../types.js').NewsItem} item
 */
function formatSourceItem(item, index) {
  const date = item.publishedAt || '날짜 미상';
  const source = item.source || '출처 미상';
  const title = item.title || '(제목 없음)';
  const category = item.category || '미분류';
  const snippet = item.snippet
    ? `\n   요약: ${String(item.snippet).slice(0, MAX_SNIPPET_LENGTH)}`
    : '';
  const url = item.url ? `\n   URL: ${item.url}` : '';
  return `${index + 1}. [${category}] ${title} (출처: ${source}, 날짜: ${date})${snippet}${url}`;
}

/**
 * @param {import('../types.js').SummaryResult} summaryResult
 * @returns {string}
 */
export function buildUserPrompt(summaryResult) {
  const now = new Date().toISOString();
  const categories = summaryResult.categories || {};
  const sourceItems = Array.isArray(summaryResult.sourceItems) ? summaryResult.sourceItems : [];
  const trimmedItems = sourceItems.slice(0, MAX_SOURCE_ITEMS);
  const omittedCount = sourceItems.length - trimmedItems.length;

  const sourceList = trimmedItems.length
    ? trimmedItems.map(formatSourceItem).join('\n')
    : '(원본 뉴스 목록 없음)';

  const omittedNote = omittedCount > 0 ? `\n(그 외 ${omittedCount}건은 지면 관계로 생략)` : '';

  return `현재 시각(기준일): ${now}
이 시각을 기준으로 "단기(1일~1개월)"와 "장기(6개월~1년 이상)"를 계산하세요.

## AI 뉴스 카테고리 요약
${categories.ai || '(요약 없음)'}

## 주식 뉴스 카테고리 요약
${categories.stock || '(요약 없음)'}

## 근거로 사용할 원본 뉴스 목록 (${trimmedItems.length}건)
${sourceList}${omittedNote}

위 내용을 바탕으로 투자 분석을 작성하세요.`;
}

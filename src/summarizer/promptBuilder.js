/**
 * 카테고리별 요약을 위한 프롬프트를 구성하는 모듈.
 *
 * 2026-07-28: Gemini 무료 티어가 모델당 하루 20건 요청으로 빡빡해서, 카테고리마다
 * 따로 호출하지 않고 모든 카테고리를 한 번의 요청(JSON 응답)으로 묶어서 처리한다.
 *
 * @typedef {import('../types.js').NewsItem} NewsItem
 */

import { CATEGORY_LABELS } from '../categories.js';

/**
 * NewsItem[] 을 프롬프트에 넣기 좋은 번호 매김 텍스트 블록으로 변환한다.
 * @param {NewsItem[]} items
 * @returns {string}
 */
function formatNewsItemsForPrompt(items) {
  return items
    .map((item, idx) => {
      const lines = [
        `${idx + 1}. 제목: ${item.title}`,
        `   출처: ${item.source}`,
        `   날짜: ${item.publishedAt}`,
        `   URL: ${item.url}`,
      ];
      if (item.snippet) {
        lines.push(`   본문 일부: ${item.snippet}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * 뉴스가 있는 모든 카테고리를 한 번의 요청으로 요약하는 프롬프트를 생성한다.
 * @param {Record<string, NewsItem[]>} itemsByCategory - 뉴스가 1건 이상 있는 카테고리만 담겨있다고 가정
 * @returns {string}
 */
export function buildBatchSummaryPrompt(itemsByCategory) {
  const categoryBlocks = Object.entries(itemsByCategory)
    .map(([category, items]) => {
      const label = CATEGORY_LABELS[category] ?? category;
      const newsBlock = formatNewsItemsForPrompt(items);
      return `### ${label} (JSON 키: "${category}")\n${newsBlock}`;
    })
    .join('\n\n');

  return `당신은 매일 아침 바쁜 독자를 위해 뉴스를 요약하는 전문 에디터입니다.

아래는 오늘 수집된 뉴스를 카테고리별로 나눈 목록입니다. 카테고리마다 아래 [요약 작성 규칙]을
지켜 한글 요약을 각각 작성하세요.

[요약 작성 규칙 - 카테고리마다 동일하게 적용]
- 최소 3문장 이상(최대 6문장), 또는 최소 3개 이상(최대 6개)의 짧은 불릿포인트로 작성합니다. 3문장/3개보다 적게 쓰지 마세요.
- 개별 기사를 단순 나열하지 말고, 공통된 흐름이나 중요한 이슈 중심으로 종합합니다.
- "주식/증권" 카테고리는 반도체, 2차전지, 바이오, 자동차, 에너지, 금융 등 서로 다른 섹터가 섞여 있으면 한두 섹터에만 치우치지 말고 주요 섹터를 골고루 짚어주세요.
- 구체적인 수치, 회사명, 날짜 등 사실 관계는 반드시 해당 카테고리의 뉴스 목록 내용에 근거해서만 언급하고, 목록에 없는 내용은 추측하지 않습니다.
- 과장되거나 지나치게 낙관적인 어조를 피하고 중립적으로 서술합니다.
- 각 카테고리 요약의 마지막 줄에 참고한 기사 수를 "(총 N건)" 형식으로 표기합니다.
- 카테고리 사이에 서로 내용을 섞지 마세요 (각 카테고리 요약은 해당 카테고리 뉴스 목록만 근거로 함).

[카테고리별 뉴스 목록]

${categoryBlocks}

각 카테고리의 JSON 키를 그대로 사용해서, { "카테고리키": "한글 요약", ... } 형태의 JSON으로만
응답하세요. 다른 설명, 인사말, 머리말은 붙이지 마세요.`;
}

/**
 * 카테고리별 요약을 위한 프롬프트를 구성하는 모듈.
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
 * 카테고리별 한글 요약 요청 프롬프트를 생성한다.
 * @param {string} category - src/categories.js의 CATEGORIES 중 하나
 * @param {NewsItem[]} items - 해당 카테고리에 속하는 뉴스만 필터링되어 들어온다고 가정
 * @returns {string}
 */
export function buildCategorySummaryPrompt(category, items) {
  const label = CATEGORY_LABELS[category] ?? category;
  const newsBlock = formatNewsItemsForPrompt(items);
  // 섹터 다양성 지침은 종목 분석과 직결되는 주식/증권 카테고리에서만 의미가 있어 조건부로 추가.
  const sectorDiversityRule =
    category === 'stock'
      ? '\n- 뉴스 목록에 반도체, 2차전지, 바이오, 자동차, 에너지, 금융 등 서로 다른 섹터의 기사가 섞여 있다면, 한두 섹터에만 치우치지 말고 등장하는 주요 섹터들을 골고루 짚어주세요.'
      : '';

  return `당신은 매일 아침 바쁜 독자를 위해 뉴스를 요약하는 전문 에디터입니다.

아래는 오늘 수집된 "${label}" 관련 뉴스 목록입니다. 이 뉴스들을 바탕으로 한글로 요약을 작성하세요.

[요약 작성 규칙]
- 최소 3문장 이상(최대 6문장), 또는 최소 3개 이상(최대 6개)의 짧은 불릿포인트로 작성합니다. 3문장/3개보다 적게 쓰지 마세요.
- 개별 기사를 단순 나열하지 말고, 공통된 흐름이나 중요한 이슈 중심으로 종합합니다.${sectorDiversityRule}
- 구체적인 수치, 회사명, 날짜 등 사실 관계는 반드시 아래 뉴스 목록 내용에 근거해서만 언급하고, 목록에 없는 내용은 추측하지 않습니다.
- 과장되거나 지나치게 낙관적인 어조를 피하고 중립적으로 서술합니다.
- 마지막 줄에 참고한 기사 수를 "(총 N건)" 형식으로 표기합니다.

[오늘의 "${label}" 뉴스 목록]
${newsBlock}

한글 요약만 출력하세요. 다른 설명, 인사말, 머리말은 붙이지 마세요.`;
}

/**
 * summarizer 모듈의 진입점.
 *
 * 책임: NewsItem[] 을 입력받아 카테고리별(src/categories.js의 CATEGORIES 참고) 한글 요약을
 * 생성하고 공유 계약(src/types.js)의 SummaryResult 형태로 반환한다.
 *
 * @typedef {import('../types.js').NewsItem} NewsItem
 * @typedef {import('../types.js').SummaryResult} SummaryResult
 */

import { getGeminiClient, SUMMARIZER_MODEL } from './geminiClient.js';
import { buildCategorySummaryPrompt } from './promptBuilder.js';
import { CATEGORIES } from '../categories.js';

/** 해당 카테고리에 뉴스가 하나도 없을 때 사용할 안내 문구 */
const EMPTY_CATEGORY_MESSAGE = '오늘 수집된 뉴스가 없습니다.';

/** 요약 생성 중 오류가 발생했을 때 SummaryResult 를 깨지지 않게 채우는 문구 */
function buildErrorMessage(error) {
  const detail = error?.message ?? String(error);
  return `요약 생성 중 오류가 발생했습니다: ${detail}`;
}

/**
 * 특정 카테고리의 뉴스 목록을 Anthropic API로 요약한다.
 * 뉴스가 없으면 API를 호출하지 않고 안내 문구를 반환한다.
 * API 키가 없거나 호출이 실패해도 예외를 던지지 않고, 에러 메시지를 요약 문자열로 담아 반환한다.
 *
 * @param {string} category - src/categories.js의 CATEGORIES 중 하나
 * @param {NewsItem[]} items
 * @returns {Promise<string>}
 */
async function summarizeCategory(category, items) {
  if (!items || items.length === 0) {
    return EMPTY_CATEGORY_MESSAGE;
  }

  try {
    const client = getGeminiClient();
    const prompt = buildCategorySummaryPrompt(category, items);

    const response = await client.models.generateContent({
      model: SUMMARIZER_MODEL,
      contents: prompt,
      config: { maxOutputTokens: 800 },
    });

    const text = response.text?.trim();
    return text || EMPTY_CATEGORY_MESSAGE;
  } catch (error) {
    // 실제 API 호출이 실패하더라도(키 없음/크레딧 없음/네트워크 오류 등) 파이프라인 전체가
    // 죽지 않도록 여기서 흡수하고, 사람이 읽을 수 있는 에러 메시지를 요약 대신 채운다.
    console.error(`[summarizer] "${category}" 카테고리 요약 중 오류:`, error?.message ?? error);
    return buildErrorMessage(error);
  }
}

/**
 * NewsItem[] 을 받아 카테고리별(src/categories.js의 CATEGORIES 참고) 한글 요약을 생성한다.
 *
 * - 입력이 빈 배열이거나 undefined/null 이어도 에러 없이 처리한다.
 * - 각 카테고리 요약은 서로 독립적으로 실패할 수 있으며, 한 카테고리의 실패가
 *   다른 카테고리나 전체 함수 실행에 영향을 주지 않는다.
 *
 * @param {NewsItem[]} [newsItems]
 * @returns {Promise<SummaryResult>}
 */
export async function summarizeNews(newsItems) {
  const items = Array.isArray(newsItems) ? newsItems : [];

  /** @type {Record<string, string>} */
  const categories = {};

  for (const category of CATEGORIES) {
    const categoryItems = items.filter((item) => item && item.category === category);
    // eslint-disable-next-line no-await-in-loop -- Gemini 무료 티어 분당 요청 제한을 피하려고
    // 일부러 병렬(Promise.all)이 아닌 순차 처리를 사용함 (카테고리 8개, 다소 느려도 안전 우선)
    categories[category] = await summarizeCategory(category, categoryItems);
  }

  return {
    generatedAt: new Date().toISOString(),
    categories,
    sourceItems: items,
  };
}

export default summarizeNews;

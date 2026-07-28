/**
 * summarizer 모듈의 진입점.
 *
 * 책임: NewsItem[] 을 입력받아 카테고리별(src/categories.js의 CATEGORIES 참고) 한글 요약을
 * 생성하고 공유 계약(src/types.js)의 SummaryResult 형태로 반환한다.
 *
 * 2026-07-28: Gemini 무료 티어가 모델당 하루 20건 요청으로 빡빡해서(카테고리 8개 x
 * 카테고리별 호출이면 그것만으로 하루 요청의 대부분을 소모함), 뉴스가 있는 카테고리를
 * 전부 한 번의 요청(JSON 응답)으로 묶어 요약하도록 변경. 실패 시에도 카테고리별로
 * 독립적인 에러 메시지를 못 만드는 대신, 전체 파이프라인은 죽지 않고 에러 메시지를
 * 채워서 반환한다(analyst의 responseSchema 패턴과 동일).
 *
 * @typedef {import('../types.js').NewsItem} NewsItem
 * @typedef {import('../types.js').SummaryResult} SummaryResult
 */

import { getGeminiClient, SUMMARIZER_MODEL } from './geminiClient.js';
import { buildBatchSummaryPrompt } from './promptBuilder.js';
import { buildSummaryResponseSchema } from './schema.js';
import { CATEGORIES } from '../categories.js';

/** 해당 카테고리에 뉴스가 하나도 없을 때 사용할 안내 문구 */
const EMPTY_CATEGORY_MESSAGE = '오늘 수집된 뉴스가 없습니다.';

/** 요약 생성 중 오류가 발생했을 때 SummaryResult 를 깨지지 않게 채우는 문구 */
function buildErrorMessage(error) {
  const detail = error?.message ?? String(error);
  return `요약 생성 중 오류가 발생했습니다: ${detail}`;
}

/**
 * NewsItem[] 을 받아 카테고리별(src/categories.js의 CATEGORIES 참고) 한글 요약을 생성한다.
 *
 * - 입력이 빈 배열이거나 undefined/null 이어도 에러 없이 처리한다.
 * - 뉴스가 있는 카테고리만 모아 단 한 번의 Gemini 요청으로 전체 요약을 받는다
 *   (카테고리 수만큼 API를 호출하던 이전 방식보다 할당량을 훨씬 아낄 수 있음).
 * - 요청 자체가 실패하면(키 없음/크레딧 없음/네트워크 오류 등) 예외를 던지지 않고,
 *   뉴스가 있던 모든 카테고리에 에러 메시지를 채워서 반환한다.
 *
 * @param {NewsItem[]} [newsItems]
 * @returns {Promise<SummaryResult>}
 */
export async function summarizeNews(newsItems) {
  const items = Array.isArray(newsItems) ? newsItems : [];

  /** @type {Record<string, NewsItem[]>} */
  const itemsByCategory = {};
  for (const category of CATEGORIES) {
    itemsByCategory[category] = items.filter((item) => item && item.category === category);
  }

  /** @type {Record<string, string>} */
  const categories = {};
  for (const category of CATEGORIES) {
    categories[category] = EMPTY_CATEGORY_MESSAGE;
  }

  const activeCategories = CATEGORIES.filter((category) => itemsByCategory[category].length > 0);

  if (activeCategories.length > 0) {
    try {
      const client = getGeminiClient();
      const activeItemsByCategory = Object.fromEntries(
        activeCategories.map((category) => [category, itemsByCategory[category]])
      );
      const prompt = buildBatchSummaryPrompt(activeItemsByCategory);
      const schema = buildSummaryResponseSchema(activeCategories);

      const response = await client.models.generateContent({
        model: SUMMARIZER_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          maxOutputTokens: 8192,
        },
      });

      const text = response.text?.trim();
      if (!text) {
        throw new Error(
          `모델 응답에서 텍스트를 받지 못했습니다. finishReason=${response.candidates?.[0]?.finishReason}`
        );
      }

      const parsed = JSON.parse(text);
      for (const category of activeCategories) {
        const summary = parsed?.[category];
        categories[category] =
          typeof summary === 'string' && summary.trim() ? summary.trim() : EMPTY_CATEGORY_MESSAGE;
      }
    } catch (error) {
      // 실제 API 호출이 실패하더라도(키 없음/크레딧 없음/네트워크 오류 등) 파이프라인 전체가
      // 죽지 않도록 여기서 흡수하고, 사람이 읽을 수 있는 에러 메시지를 요약 대신 채운다.
      console.error('[summarizer] 카테고리 일괄 요약 중 오류:', error?.message ?? error);
      const message = buildErrorMessage(error);
      for (const category of activeCategories) {
        categories[category] = message;
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    categories,
    sourceItems: items,
  };
}

export default summarizeNews;

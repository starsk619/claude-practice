/**
 * 여러 카테고리 요약을 한 번의 요청으로 받기 위한 Gemini 응답 스키마.
 * analyst/schema.js와 동일한 방식(responseSchema 구조화 출력)을 사용한다.
 */
import { Type } from '@google/genai';
import { CATEGORY_LABELS } from '../categories.js';

/**
 * @param {string[]} activeCategories - 뉴스가 1건 이상 있어서 실제로 요약을 요청할 카테고리 목록
 * @returns {object} Gemini responseSchema
 */
export function buildSummaryResponseSchema(activeCategories) {
  const properties = {};
  for (const category of activeCategories) {
    const label = CATEGORY_LABELS[category] ?? category;
    properties[category] = {
      type: Type.STRING,
      description: `"${label}" 카테고리 한글 요약 (최소 3문장/3개 불릿)`,
    };
  }

  return {
    type: Type.OBJECT,
    properties,
    required: activeCategories,
  };
}

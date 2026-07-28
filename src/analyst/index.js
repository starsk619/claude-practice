/**
 * analyst 모듈 진입점.
 *
 * 책임: SummaryResult를 입력받아 "30년 경력 투자 전문가" 페르소나로
 * 투자 분석(AnalystResult)을 생성한다. (src/types.js 계약 참고)
 *
 * 이 모듈이 반드시 지키는 핵심 요구사항 (자세한 내용은 systemPrompt.js, normalize.js 참고):
 *   1) 낙관 편향 금지 — 근거(수치/출처/날짜) 우선 인용
 *   2) 리스크 요인 항상 병기
 *   3) 단기(1일~1개월)/장기(6개월~1년+) 전망 분리 + 예상 수익률 범위 언급
 *   4) pick마다 confidence(강함/중간/약함)로 추측 vs 데이터 기반 구분
 *   5) disclaimer에 "투자 자문 아님/참고용" 문구 항상 포함 (코드 레벨로 강제 보증)
 *
 * 2026-07-28: Anthropic API(tool_choice 강제)에서 Google Gemini API
 * (responseSchema 구조화 출력)로 전환.
 */
import { createGeminiClient, ANALYST_MODEL } from './client.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { buildUserPrompt } from './userPrompt.js';
import { ANALYSIS_RESPONSE_SCHEMA } from './schema.js';
import { normalizeAnalystResult } from './normalize.js';

function assertValidSummaryResult(summaryResult) {
  if (!summaryResult || typeof summaryResult !== 'object') {
    throw new Error('[analyst] analyzeInvestment(summaryResult) - summaryResult가 필요합니다.');
  }
  const categories = summaryResult.categories;
  if (!categories || typeof categories.ai !== 'string' || typeof categories.stock !== 'string') {
    throw new Error(
      '[analyst] summaryResult.categories.ai / categories.stock 문자열이 필요합니다 (SummaryResult 계약 위반).'
    );
  }
}

/**
 * @param {import('../types.js').SummaryResult} summaryResult
 * @returns {Promise<import('../types.js').AnalystResult>}
 */
export async function analyzeInvestment(summaryResult) {
  assertValidSummaryResult(summaryResult);

  const client = createGeminiClient();
  const systemInstruction = buildSystemPrompt();
  const userPrompt = buildUserPrompt(summaryResult);

  let response;
  try {
    response = await client.models.generateContent({
      model: ANALYST_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_RESPONSE_SCHEMA,
        maxOutputTokens: 4096,
      },
    });
  } catch (err) {
    throw new Error(`[analyst] Gemini API 호출 실패: ${err.message}`, { cause: err });
  }

  const text = response.text;
  if (!text) {
    throw new Error(
      `[analyst] 모델 응답에서 텍스트를 받지 못했습니다. finishReason=${response.candidates?.[0]?.finishReason}`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`[analyst] 모델 응답 JSON 파싱 실패: ${err.message}`, { cause: err });
  }

  return normalizeAnalystResult(parsed);
}

export default analyzeInvestment;

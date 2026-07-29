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
import { CATEGORIES } from '../categories.js';
import { withGeminiRetry } from '../geminiRetry.js';

function assertValidSummaryResult(summaryResult) {
  if (!summaryResult || typeof summaryResult !== 'object') {
    throw new Error('[analyst] analyzeInvestment(summaryResult) - summaryResult가 필요합니다.');
  }
  const categories = summaryResult.categories;
  const missing = CATEGORIES.filter((key) => typeof categories?.[key] !== 'string');
  if (missing.length > 0) {
    throw new Error(
      `[analyst] summaryResult.categories.{${missing.join(', ')}} 문자열이 필요합니다 (SummaryResult 계약 위반).`
    );
  }
}

/**
 * @param {import('../types.js').SummaryResult} summaryResult
 * @param {import('../priceData/marketContext.js').MarketContextEntry[]} [marketContext] - 오늘
 *   뉴스에 언급된 종목 + 핵심 관심 종목의 실제 시세/밸류에이션/변동성 (picks 결정 전 판단 근거로 제공)
 * @param {import('../pickHistory/index.js').PickHistoryEntry[]} [pickHistory] - 최근 리포트의
 *   실제 판단 이력 (일관성 유지 + 판단 이후 주가 흐름 참고용)
 * @param {import('../priceData/fxContext.js').FxContext | null} [fxContext] - 원/달러 환율
 *   (수출주 실적/외국인 자금 흐름 판단의 거시 배경 지표, 조회 실패 시 null)
 * @returns {Promise<import('../types.js').AnalystResult>}
 */
export async function analyzeInvestment(summaryResult, marketContext = [], pickHistory = [], fxContext = null) {
  assertValidSummaryResult(summaryResult);

  const client = createGeminiClient();
  const systemInstruction = buildSystemPrompt();
  const userPrompt = buildUserPrompt(summaryResult, marketContext, pickHistory, fxContext);

  let response;
  try {
    response = await withGeminiRetry(
      () =>
        client.models.generateContent({
          model: ANALYST_MODEL,
          contents: userPrompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: ANALYSIS_RESPONSE_SCHEMA,
            maxOutputTokens: 16384,
            // 판단 이력을 참고해 일관성을 유지하길 바라는데, 기본 temperature(~1.0)는 같은
            // 근거를 줘도 매번 결과가 흔들릴 정도로 변동폭이 크다. 그렇다고 너무 낮추면
            // (예: 0) 문장이 매번 판박이처럼 반복되어 부자연스러워지므로, 어느 정도 일관성은
            // 확보하면서도 서술이 딱딱해지지 않는 중간값으로 설정한다.
            temperature: 0.4,
          },
        }),
      { label: 'analyst' }
    );
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

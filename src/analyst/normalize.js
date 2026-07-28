/**
 * 모델의 tool_use.input(자유 형식 JSON)을 AnalystResult 계약에 맞게 검증/정규화한다.
 *
 * 프롬프트만으로는 모델이 규칙(면책 문구, enum 값 등)을 어길 가능성이 있으므로,
 * 여기서 코드 레벨로 한 번 더 강제한다 — 이 파일이 계약 준수의 최종 방어선이다.
 */
import { RATING_VALUES, CONFIDENCE_VALUES } from './schema.js';

const DEFAULT_RATING = '관망'; // 판단 불가 시 중립값으로 안전하게 대체
const DEFAULT_CONFIDENCE = '약함'; // 판단 불가 시 가장 보수적인 확신도로 대체

const REQUIRED_DISCLAIMER =
  '이 분석은 투자 자문이 아니며 참고용입니다. 최종 투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다.';

function toSafeString(value, fallback = '') {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return fallback;
}

function normalizeRating(value) {
  return RATING_VALUES.includes(value) ? value : DEFAULT_RATING;
}

function normalizeConfidence(value) {
  return CONFIDENCE_VALUES.includes(value) ? value : DEFAULT_CONFIDENCE;
}

/**
 * disclaimer 필드에 "투자 자문이 아니며 참고용" 취지의 문구가 반드시 들어가도록 강제한다.
 * 이 요구사항은 이 모듈의 핵심 요구사항이므로 프롬프트에만 의존하지 않고 코드로 보증한다.
 */
function ensureDisclaimer(rawDisclaimer) {
  const text = toSafeString(rawDisclaimer, '');
  const mentionsAdvice = text.includes('투자 자문');
  const mentionsReference = text.includes('참고') || text.includes('참고용');

  if (mentionsAdvice && mentionsReference) {
    return text;
  }
  return text ? `${REQUIRED_DISCLAIMER} ${text}` : REQUIRED_DISCLAIMER;
}

function normalizePick(rawPick) {
  const pick = rawPick && typeof rawPick === 'object' ? rawPick : {};
  return {
    ticker: toSafeString(pick.ticker, 'N/A'),
    name: toSafeString(pick.name, '종목명 미상'),
    rating: normalizeRating(pick.rating),
    rationale: toSafeString(pick.rationale, '근거 데이터 부족 (모델이 근거를 제공하지 않음)'),
    risk: toSafeString(pick.risk, '리스크 요인 정보 부족'),
    confidence: normalizeConfidence(pick.confidence),
  };
}

/**
 * @param {unknown} rawInput - Gemini 응답 JSON을 파싱한 객체
 * @returns {import('../types.js').AnalystResult}
 */
export function normalizeAnalystResult(rawInput) {
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const picks = Array.isArray(input.picks) ? input.picks.map(normalizePick) : [];

  return {
    generatedAt: new Date().toISOString(),
    headline: toSafeString(input.headline, '오늘의 시장 총평 정보가 부족합니다.').slice(0, 60),
    shortTermOutlook: toSafeString(
      input.shortTermOutlook,
      '단기 전망 정보 부족 (모델이 결과를 제공하지 않음)'
    ),
    longTermOutlook: toSafeString(
      input.longTermOutlook,
      '장기 전망 정보 부족 (모델이 결과를 제공하지 않음)'
    ),
    picks,
    disclaimer: ensureDisclaimer(input.disclaimer),
  };
}

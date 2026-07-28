/**
 * analyst 모듈 전용 Gemini 클라이언트 팩토리.
 *
 * 규칙: API 키는 반드시 process.env.GEMINI_API_KEY 로만 읽는다. 하드코딩 금지.
 *
 * 2026-07-28: 무료로 운영하고 싶다는 요청에 따라 Anthropic API에서 Gemini API로 전환.
 */
import { GoogleGenAI } from '@google/genai';

/**
 * 이 모듈이 사용하는 기본 모델. 필요 시 환경변수로 오버라이드 가능.
 * 특정 버전을 고정하면 Google이 신규 사용자에게 해당 버전을 폐기했을 때 404가 날 수 있어,
 * 항상 "현재 권장되는 flash 모델"을 가리키는 별칭(latest alias)을 기본값으로 사용한다.
 */
export const ANALYST_MODEL = process.env.GEMINI_ANALYST_MODEL || 'gemini-flash-latest';

/**
 * @returns {GoogleGenAI}
 */
export function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      '[analyst] GEMINI_API_KEY가 설정되어 있지 않습니다. .env 파일(.env.example 참고)에 키를 설정하세요.'
    );
  }
  return new GoogleGenAI({ apiKey });
}

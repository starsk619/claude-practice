/**
 * Google Gemini API 클라이언트 생성 및 설정을 담당하는 모듈.
 *
 * 규칙: API 키는 반드시 process.env.GEMINI_API_KEY 로만 읽는다.
 * 절대 코드에 키를 하드코딩하지 않는다. (.env 는 .gitignore 처리됨 - security 팀원 담당)
 *
 * 2026-07-28: 무료로 운영하고 싶다는 요청에 따라 Anthropic API에서 Gemini API로 전환
 * (Gemini API는 무료 티어 한도 내에서 사용 가능).
 */

import { GoogleGenAI } from '@google/genai';

/**
 * 이 모듈에서 사용할 모델. 필요 시 이 상수만 바꾸면 된다.
 * 특정 버전(예: gemini-2.5-flash)을 고정하면 Google이 해당 버전을 신규 사용자에게
 * 폐기했을 때 404 에러가 날 수 있어, 항상 "현재 권장되는 flash 모델"을 가리키는
 * 별칭(latest alias)을 사용한다.
 */
export const SUMMARIZER_MODEL = 'gemini-flash-latest';

let cachedClient = null;

/**
 * Gemini 클라이언트를 생성(또는 캐시된 인스턴스를 반환)한다.
 * GEMINI_API_KEY 가 없으면 명확한 에러 메시지와 함께 즉시 예외를 던진다.
 * 호출부(index.js)에서 이 예외를 잡아 카테고리별로 안전하게 처리한다.
 *
 * @returns {GoogleGenAI}
 */
export function getGeminiClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY 환경변수가 설정되어 있지 않습니다. .env 파일에 키를 설정하세요.'
    );
  }

  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

/**
 * 테스트 등에서 캐시된 클라이언트를 초기화하고 싶을 때 사용.
 * (프로덕션 경로에서는 호출할 필요 없음)
 */
export function resetGeminiClientCache() {
  cachedClient = null;
}

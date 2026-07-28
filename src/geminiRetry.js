/**
 * Gemini API 호출의 일시적 오류(429 RESOURCE_EXHAUSTED, 503 등)를 자동 재시도하는 래퍼.
 *
 * summarizer/analyst 둘 다 Gemini를 호출하는데, 무료 티어 할당량이 롤링(rolling) 방식이라
 * 잠깐 뒤에 재시도하면 성공하는 경우가 많다(사람이 GitHub Actions를 수동으로 다시 실행할
 * 필요 없이 같은 실행 안에서 스스로 회복하도록 하기 위함).
 */

const DEFAULT_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 90_000;
const EXTRA_BUFFER_MS = 1_000; // Google이 알려준 시간보다 살짝 더 기다려서 다시 걸릴 여지를 줄임

/**
 * Google API 에러 메시지(raw JSON 문자열)에서 재시도 권장 시간을 최대한 파싱한다.
 * 못 찾으면 null (호출부에서 기본 백오프를 사용).
 * @param {unknown} error
 * @returns {number | null} 밀리초
 */
function extractRetryDelayMs(error) {
  const message = error?.message ?? String(error ?? '');

  // 1) RetryInfo.retryDelay 필드 (예: "retryDelay":"51s")
  const retryInfoMatch = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (retryInfoMatch) return Math.ceil(parseFloat(retryInfoMatch[1]) * 1000);

  // 2) 사람이 읽는 문구 (예: "Please retry in 51.46s")
  const humanMatch = message.match(/retry in (\d+(?:\.\d+)?)s/i);
  if (humanMatch) return Math.ceil(parseFloat(humanMatch[1]) * 1000);

  return null;
}

/**
 * @param {unknown} error
 * @returns {boolean} 재시도해볼 만한 일시적 오류인지 (429 할당량 초과, 503 서버 과부하 등)
 */
function isRetryableError(error) {
  const status = error?.status ?? error?.cause?.status;
  if (status === 429 || status === 503) return true;
  const message = String(error?.message ?? '');
  return message.includes('RESOURCE_EXHAUSTED') || message.includes('UNAVAILABLE');
}

/**
 * @template T
 * @param {() => Promise<T>} fn - 재시도할 Gemini 호출 (예: () => client.models.generateContent(...))
 * @param {{ retries?: number, label?: string }} [options]
 * @returns {Promise<T>}
 */
export async function withGeminiRetry(fn, options = {}) {
  const retries = options.retries ?? 2;
  const label = options.label ?? 'gemini';

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryableError(error)) {
        throw error;
      }

      const suggested = extractRetryDelayMs(error);
      const waitMs = Math.min(suggested ?? DEFAULT_BACKOFF_MS, MAX_BACKOFF_MS) + EXTRA_BUFFER_MS;
      console.warn(
        `[${label}] 일시적 오류 감지(${attempt + 1}/${retries}차 재시도 예정), ${Math.round(waitMs / 1000)}초 대기 후 재시도: ${String(error?.message ?? error).slice(0, 200)}`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  // 여기 도달하지 않지만(위 루프가 항상 return/throw), 안전망으로 남겨둠.
  throw lastError;
}

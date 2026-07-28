/**
 * HTML 리포트 생성에 쓰이는 아주 작은 유틸 모음.
 * 외부 라이브러리 의존 없이 순수 함수로만 구성한다 (self-contained HTML 원칙).
 */

/**
 * 사용자 데이터(뉴스 제목, 근거 문구 등)를 HTML에 안전하게 삽입하기 위한 이스케이프.
 * summarizer/analyst 모듈이 외부 뉴스 텍스트를 그대로 담아 넘길 수 있으므로 반드시 거친다.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * 줄바꿈(\n)을 <br>로 바꾸되, 내용은 이스케이프한 뒤 처리한다.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeAndBreak(value) {
  return escapeHtml(value).replaceAll('\n', '<br>');
}

/**
 * escapeAndBreak에 더해, 마크다운 스타일 **굵게**를 <strong>으로 변환한다.
 * analyst 모듈이 단기/장기 전망 텍스트에서 중요한 부분을 **로 감싸 강조 표시하도록
 * 요청하는데, 이 함수가 그걸 실제 HTML 강조로 렌더링한다. 이스케이프를 먼저 하기 때문에
 * 원본 텍스트에 있던 `<`, `>` 등은 안전하게 처리된 뒤 **만 골라서 변환한다.
 * @param {unknown} value
 * @returns {string}
 */
export function formatRichText(value) {
  const escaped = escapeAndBreak(value);
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/**
 * ISO 8601 문자열을 "2026년 7월 28일 (화)" 형태의 한글 날짜로 변환.
 * 파싱 실패 시 원본 문자열을 그대로 반환(리포트 생성이 죽지 않도록 방어).
 * @param {string} [isoString]
 * @returns {string}
 */
export function formatKoreanDate(isoString) {
  const date = isoString ? new Date(isoString) : new Date();
  if (Number.isNaN(date.getTime())) return isoString ? escapeHtml(isoString) : '';
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday})`;
}

/**
 * ISO 8601 문자열을 "2026.07.28" 형태의 짧은 날짜 문자열로 변환.
 * @param {string} [isoString]
 * @returns {string}
 */
export function formatShortDate(isoString) {
  const date = isoString ? new Date(isoString) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

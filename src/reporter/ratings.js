/**
 * StockPick.rating / confidence 값을 신호등 색상 및 표시 스타일로 매핑.
 * types.js 계약: rating은 '매수 고려' | '관망' | '주의' 셋 중 하나.
 * 여기서 색을 한 곳에 모아두면, 나중에 카카오 등 새 채널을 추가하거나
 * 리포트 톤을 바꿀 때도 이 파일 하나만 고치면 된다.
 */

export const RATING_STYLE = {
  '매수 고려': {
    emoji: '🟢',
    label: '매수 고려',
    bg: '#e6f4ea',
    fg: '#1e7e34',
    border: '#34a853',
  },
  '관망': {
    emoji: '🟡',
    label: '관망',
    bg: '#fff8e1',
    fg: '#8a6d00',
    border: '#f9ab00',
  },
  '주의': {
    emoji: '🔴',
    label: '주의',
    bg: '#fdecea',
    fg: '#c0392b',
    border: '#e53935',
  },
};

// 계약에 없는 값이 들어와도 리포트가 깨지지 않도록 하는 기본값(회색)
export const FALLBACK_RATING_STYLE = {
  emoji: '⚪',
  label: '정보 없음',
  bg: '#f1f3f4',
  fg: '#5f6368',
  border: '#9aa0a6',
};

/**
 * @param {string} rating
 */
export function getRatingStyle(rating) {
  return RATING_STYLE[rating] ?? FALLBACK_RATING_STYLE;
}

export const CONFIDENCE_DOTS = {
  강함: '●●●',
  중간: '●●○',
  약함: '●○○',
};

/**
 * @param {string} confidence
 */
export function getConfidenceDots(confidence) {
  return CONFIDENCE_DOTS[confidence] ?? '○○○';
}

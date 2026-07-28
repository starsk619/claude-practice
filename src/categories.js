/**
 * 뉴스 카테고리 메타데이터의 단일 출처(single source of truth).
 * collector/summarizer/analyst/reporter가 전부 이 목록을 참조해서, 카테고리를
 * 추가/변경할 때 한 곳만 고치면 되도록 한다.
 */

/** @type {string[]} NewsItem.category / SummaryResult.categories 키로 쓰이는 값들 */
export const CATEGORIES = [
  'ai',
  'stock',
  'society',
  'economy',
  'international',
  'politics',
  'itScience',
  'entertainment',
];

/** 카테고리별 한글 표시 이름 */
export const CATEGORY_LABELS = {
  ai: 'AI(인공지능)',
  stock: '주식/증권',
  society: '사회',
  economy: '경제',
  international: '국제',
  politics: '정치',
  itScience: 'IT/과학',
  entertainment: '연예',
};

/** 리포트 뉴스 카드에 쓰이는 카테고리별 이모지 */
export const CATEGORY_EMOJI = {
  ai: '🤖',
  stock: '📈',
  society: '🗞️',
  economy: '💰',
  international: '🌍',
  politics: '🏛️',
  itScience: '🔬',
  entertainment: '🎬',
};

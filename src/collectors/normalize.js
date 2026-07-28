/**
 * rss-parser가 반환하는 개별 피드 아이템을, src/types.js에 정의된
 * NewsItem 계약 { title, url, source, publishedAt(ISO), category, snippet? }
 * 형태로 정규화하는 순수 함수 모음.
 */

const SNIPPET_MAX_LENGTH = 200;

/**
 * 다양한 날짜 포맷(RFC822, ISO 등)을 ISO 8601 문자열로 변환한다.
 * 파싱 불가능하면 현재 시각으로 폴백한다.
 * @param {string | undefined} value
 * @returns {string}
 */
export function toIsoDate(value) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

/**
 * RSS 아이템의 본문/요약 필드에서 짧은 스니펫을 추출한다.
 * 공백을 정리하고 최대 길이를 넘으면 잘라낸다.
 * @param {{contentSnippet?: string, summary?: string, content?: string}} item
 * @returns {string | undefined}
 */
export function buildSnippet(item) {
  const raw = item?.contentSnippet || item?.summary || item?.content || '';
  const text = String(raw).replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > SNIPPET_MAX_LENGTH
    ? `${text.slice(0, SNIPPET_MAX_LENGTH)}...`
    : text;
}

/**
 * rss-parser의 단일 feed item을 NewsItem으로 변환한다.
 * @param {any} item - rss-parser가 반환한 원본 아이템
 * @param {{source: string, category: 'ai'|'stock'|'society', url: string}} feedConfig
 * @returns {import('../types.js').NewsItem}
 */
export function normalizeItem(item, feedConfig) {
  return {
    title: (item?.title || '(제목 없음)').trim(),
    url: item?.link || item?.guid || feedConfig.url,
    source: feedConfig.source,
    publishedAt: toIsoDate(item?.isoDate || item?.pubDate),
    category: feedConfig.category,
    snippet: buildSnippet(item),
  };
}

/**
 * URL/도메인 문자열을 보고 카테고리를 추정한다.
 * .env의 NEWS_RSS_FEEDS로 오버라이드된 URL은 source/category 메타데이터가 없으므로
 * 최선의 추정치로 채운다.
 * @param {string} url
 * @returns {'ai'|'stock'|'society'}
 */
export function guessCategoryFromUrl(url) {
  const lower = url.toLowerCase();
  const stockHints = [
    'stock',
    'finance',
    'financ',
    'invest',
    'market',
    '증권',
    '경제',
    '주식',
  ];
  const aiHints = ['ai', 'artificial-intelligence', 'tech', 'ml'];
  const societyHints = ['society', '사회'];

  if (stockHints.some((hint) => lower.includes(hint))) return 'stock';
  if (aiHints.some((hint) => lower.includes(hint))) return 'ai';
  if (societyHints.some((hint) => lower.includes(hint))) return 'society';
  // 판단 근거가 없으면 ai를 기본값으로 사용 (보수적 폴백)
  return 'ai';
}

/**
 * URL만으로 사람이 읽을 만한 출처 이름을 추정한다 (호스트명 사용).
 * @param {string} url
 * @returns {string}
 */
export function guessSourceFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * 기본 RSS 피드 목록.
 *
 * 실제로 존재하는 공개 RSS 피드만 사용한다:
 * - AI: TechCrunch AI 섹션, VentureBeat AI
 * - 주식/증권: 한국경제 증권, 매일경제 증권, 연합뉴스 경제
 *
 * .env의 NEWS_RSS_FEEDS(콤마로 구분된 URL 목록)가 설정되어 있으면
 * 이 기본 목록 전체를 오버라이드한다 (index.js의 resolveFeedList 참고).
 *
 * @typedef {Object} FeedConfig
 * @property {string} url
 * @property {string} source - 사람이 읽기 쉬운 출처 이름 (NewsItem.source에 사용)
 * @property {'ai'|'stock'} category
 */

/** @type {FeedConfig[]} */
export const DEFAULT_FEEDS = [
  {
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    source: 'TechCrunch AI',
    category: 'ai',
  },
  {
    url: 'https://venturebeat.com/category/ai/feed/',
    source: 'VentureBeat AI',
    category: 'ai',
  },
  {
    url: 'https://www.hankyung.com/feed/finance',
    source: '한국경제 증권',
    category: 'stock',
  },
  {
    url: 'https://www.mk.co.kr/rss/50200011/',
    source: '매일경제 증권',
    category: 'stock',
  },
  {
    url: 'https://www.yna.co.kr/rss/economy.xml',
    source: '연합뉴스 경제',
    category: 'stock',
  },
];

/**
 * AI 뉴스 + 주식 뉴스 RSS 수집 모듈.
 *
 * collectNews()는 src/types.js의 NewsItem 계약에 맞춘 정규화된 배열을 반환한다:
 *   { title, url, source, publishedAt(ISO), category, snippet? }
 * (category 값 목록은 src/categories.js의 CATEGORIES 참고)
 *
 * 소스 목록: 기본값은 ./feeds.js의 DEFAULT_FEEDS (자세한 목록/카테고리는 그 파일 참고)
 * - .env의 NEWS_RSS_FEEDS (콤마로 구분된 URL 목록)가 비어있지 않으면
 *   기본 목록 전체를 오버라이드한다. 이 경우 source/category는 URL로부터
 *   최선의 추정치를 사용한다 (normalize.js의 guessCategoryFromUrl 참고).
 *
 * 이 모듈은 API 키/토큰을 사용하지 않는다 (공개 RSS만 읽음).
 */

import Parser from 'rss-parser';
import { DEFAULT_FEEDS } from './feeds.js';
import {
  normalizeItem,
  guessCategoryFromUrl,
  guessSourceFromUrl,
} from './normalize.js';

const FETCH_TIMEOUT_MS = 10_000;

const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (compatible; news-bot-collector/1.0; +https://example.invalid/bot)',
  },
});

/**
 * .env의 NEWS_RSS_FEEDS 값을 파싱해 FeedConfig 배열로 변환한다.
 * @param {string} envValue
 * @returns {import('./feeds.js').FeedConfig[]}
 */
function parseEnvFeeds(envValue) {
  return envValue
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0)
    .map((url) => ({
      url,
      source: guessSourceFromUrl(url),
      category: guessCategoryFromUrl(url),
    }));
}

/**
 * 사용할 최종 피드 목록을 결정한다.
 * NEWS_RSS_FEEDS 환경변수가 설정되어 있으면 그것으로 기본 목록을 오버라이드하고,
 * 없거나 비어있으면 DEFAULT_FEEDS를 사용한다.
 * @returns {import('./feeds.js').FeedConfig[]}
 */
export function resolveFeedList() {
  const envValue = process.env.NEWS_RSS_FEEDS;
  if (envValue && envValue.trim().length > 0) {
    const parsed = parseEnvFeeds(envValue);
    if (parsed.length > 0) return parsed;
  }
  return DEFAULT_FEEDS;
}

/**
 * 피드 하나를 가져와 NewsItem 배열로 정규화한다.
 * 네트워크/파싱 오류가 나도 예외를 던지지 않고 빈 배열을 반환한다
 * (한 피드의 실패가 전체 수집을 막지 않도록).
 * @param {import('./feeds.js').FeedConfig} feedConfig
 * @returns {Promise<import('../types.js').NewsItem[]>}
 */
async function collectFromFeed(feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const items = feed?.items || [];
    return items.map((item) => normalizeItem(item, feedConfig));
  } catch (err) {
    console.error(
      `[collectors] "${feedConfig.source}" (${feedConfig.url}) 수집 실패: ${
        err?.message || err
      }`,
    );
    return [];
  }
}

/**
 * 설정된 모든 RSS 소스에서 뉴스를 수집하고 NewsItem[] 형태로 반환한다.
 * 개별 피드 실패는 무시하고(로그만 남김) 나머지 결과만 모아서 반환한다.
 * @returns {Promise<import('../types.js').NewsItem[]>}
 */
export async function collectNews() {
  const feeds = resolveFeedList();
  const results = await Promise.all(feeds.map((feed) => collectFromFeed(feed)));
  return results.flat();
}

export default collectNews;

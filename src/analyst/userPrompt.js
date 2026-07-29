/**
 * SummaryResult -> 모델에 전달할 user 메시지 텍스트 빌더.
 */
import { CATEGORIES, CATEGORY_LABELS } from '../categories.js';
import { selectDiverseSources } from '../newsSelection.js';

const MAX_SOURCE_ITEMS = 30; // 프롬프트 길이 폭주 방지
const MAX_SOURCE_ITEMS_PER_CATEGORY = 6; // 카테고리 하나(예: AI)가 목록을 독점하지 않도록
const MAX_SNIPPET_LENGTH = 300;

/** 종목 분석과 직접적인 투자 판단 근거라기보다 "배경 정보" 성격이 강한 카테고리 */
const BACKGROUND_ONLY_CATEGORIES = new Set([
  'society',
  'international',
  'politics',
  'entertainment',
]);

/**
 * @param {import('../priceData/marketContext.js').MarketContextEntry} entry
 */
function formatMarketContextEntry(entry, index) {
  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('ko-KR') : '정보 없음');
  const change = typeof entry.changePercent === 'number' ? `${entry.changePercent > 0 ? '+' : ''}${entry.changePercent}%` : '정보 없음';
  const vol =
    typeof entry.annualizedVolatilityPercent === 'number'
      ? `${entry.annualizedVolatilityPercent}%(일 변동성 약 ±${(entry.annualizedVolatilityPercent / Math.sqrt(252)).toFixed(1)}%)`
      : '정보 없음';
  const per = typeof entry.per === 'number' ? `${entry.per}배` : '정보 없음';
  const forwardPer = typeof entry.forwardPer === 'number' ? `${entry.forwardPer}배` : '정보 없음';
  const pbr = typeof entry.pbr === 'number' ? `${entry.pbr}배` : '정보 없음';
  const dividendYield = typeof entry.dividendYield === 'number' ? `${entry.dividendYield}%` : '정보 없음';

  const mentionLabel = entry.mentionCount > 0 ? `오늘 뉴스 언급 ${entry.mentionCount}회` : '핵심 관심 종목(오늘 뉴스 언급 없음)';

  return (
    `${index + 1}. ${entry.name}(${entry.code}) - ${mentionLabel}\n` +
    `   현재가: ${fmt(entry.currentPrice)}${entry.currency ?? ''} (전일대비 ${change}), ` +
    `52주 ${fmt(entry.low52w)}~${fmt(entry.high52w)}\n` +
    `   연환산 변동성: ${vol} | PER: ${per} (추정PER: ${forwardPer}) | PBR: ${pbr} | 배당수익률: ${dividendYield}`
  );
}

/**
 * @param {import('../pickHistory/index.js').PickHistoryEntry} entry
 */
function formatPickHistoryEntry(entry) {
  const date = (entry?.generatedAt || '').slice(0, 10) || '날짜 미상';
  const picks = Array.isArray(entry?.picks) ? entry.picks : [];
  if (!picks.length) return `### ${date} 리포트\n  (해당 없음)`;

  const lines = picks
    .map((p) => {
      const priceText =
        typeof p.price === 'number' ? `${p.price.toLocaleString('ko-KR')}${p.currency ?? ''}` : '가격 정보 없음';
      return `  - ${p.name}(${p.ticker}): ${p.rating} (확신도 ${p.confidence}, 당시가 ${priceText})`;
    })
    .join('\n');
  return `### ${date} 리포트\n${lines}`;
}

/**
 * @param {import('../types.js').NewsItem} item
 */
function formatSourceItem(item, index) {
  const date = item.publishedAt || '날짜 미상';
  const source = item.source || '출처 미상';
  const title = item.title || '(제목 없음)';
  const category = item.category || '미분류';
  const snippet = item.snippet
    ? `\n   요약: ${String(item.snippet).slice(0, MAX_SNIPPET_LENGTH)}`
    : '';
  const url = item.url ? `\n   URL: ${item.url}` : '';
  return `${index + 1}. [${category}] ${title} (출처: ${source}, 날짜: ${date})${snippet}${url}`;
}

/**
 * @param {import('../types.js').SummaryResult} summaryResult
 * @param {import('../priceData/marketContext.js').MarketContextEntry[]} [marketContext] - 오늘
 *   뉴스에 언급된 종목 + 핵심 관심 종목의 실제 시세/밸류에이션/변동성 데이터 (없으면 빈 배열)
 * @param {import('../pickHistory/index.js').PickHistoryEntry[]} [pickHistory] - 최근 리포트에서
 *   실제로 어떤 종목을 어떻게 판단했는지 이력 (없으면 빈 배열 - 첫 실행 등)
 * @returns {string}
 */
export function buildUserPrompt(summaryResult, marketContext = [], pickHistory = []) {
  const now = new Date().toISOString();
  const categories = summaryResult.categories || {};
  const sourceItems = Array.isArray(summaryResult.sourceItems) ? summaryResult.sourceItems : [];
  const trimmedItems = selectDiverseSources(sourceItems, {
    maxTotal: MAX_SOURCE_ITEMS,
    maxPerCategory: MAX_SOURCE_ITEMS_PER_CATEGORY,
  });
  const omittedCount = sourceItems.length - trimmedItems.length;

  const sourceList = trimmedItems.length
    ? trimmedItems.map(formatSourceItem).join('\n')
    : '(원본 뉴스 목록 없음)';

  const omittedNote = omittedCount > 0 ? `\n(그 외 ${omittedCount}건은 지면 관계로 생략)` : '';

  const categorySections = CATEGORIES.map((key) => {
    const label = CATEGORY_LABELS[key] ?? key;
    const suffix = BACKGROUND_ONLY_CATEGORIES.has(key) ? ' (투자 판단에 참고할 배경 정보)' : '';
    return `## ${label} 뉴스 카테고리 요약${suffix}\n${categories[key] || '(요약 없음)'}`;
  }).join('\n\n');

  const marketContextBlock = marketContext.length
    ? marketContext.map(formatMarketContextEntry).join('\n')
    : '(오늘 뉴스에서 KRX 상장기업명이 조회 가능한 형태로 언급되지 않았거나, 시세 조회에 실패했습니다.)';

  const pickHistoryBlock = pickHistory.length
    ? pickHistory.map(formatPickHistoryEntry).join('\n\n')
    : '(최근 리포트 이력이 없습니다 — 이번이 사실상 첫 판단입니다.)';

  return `현재 시각(기준일): ${now}
이 시각을 기준으로 "단기(1일~1개월)"와 "장기(6개월~1년 이상)"를 계산하세요.

${categorySections}

## 오늘 뉴스에 언급된 종목 + 핵심 관심 종목의 실제 시세/밸류에이션/변동성 (판단 근거로 활용)
아래는 뉴스 텍스트가 아니라 실제 시장 데이터입니다. "핵심 관심 종목" 표시가 붙은 종목은
오늘 뉴스에 언급되진 않았지만 항상 살펴보는 대형 우량주이므로, 뉴스 언급이 없어도 데이터가
있다면 검토 대상으로 고려할 수 있습니다. 이 수치를 인용해서 근거를 뒷받침하고, picks의
positionGuidance는 반드시 여기 있는 연환산 변동성 수치에 맞춰 작성하세요(변동성이 높을수록
비중/손절선을 보수적으로, 낮을수록 상대적으로 여유 있게).
${marketContextBlock}

## 최근 리포트에서의 판단 이력 (일관성 참고용)
아래는 실제로 과거에 발행된 리포트에서 각 종목에 대해 내렸던 판단입니다. 같은 종목을 최근에
이미 판단한 적이 있다면 새로운 뉴스/데이터 근거 없이 이유 없이 뒤집지 마세요. 위 "실제
시세/밸류에이션" 섹션의 현재가와 아래의 "당시가"를 비교해서, 그 판단 이후 주가가 어떻게
움직였는지도 근거에 자연스럽게 반영하세요(예: 이전에 매수 고려였는데 이후 더 하락했다면
밸류에이션 매력이 커진 것인지 추세적 약세인지 최신 데이터로 재평가).
${pickHistoryBlock}

## 근거로 사용할 원본 뉴스 목록 (${trimmedItems.length}건)
${sourceList}${omittedNote}

위 내용을 바탕으로 투자 분석을 작성하세요.`;
}

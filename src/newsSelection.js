/**
 * 카테고리 하나가 뉴스 목록을 독점하지 않도록, 카테고리별로 라운드로빈 방식으로 골라
 * 최대 maxTotal건을 채운다.
 *
 * NewsItem에는 조회수/댓글수 데이터가 없어(RSS가 제공하지 않음) "인기순" 정렬은
 * 불가능하지만, RSS는 보통 최신순으로 내려오므로 각 라운드에서 "카테고리별로 아직
 * 안 뽑힌 것 중 가장 최근 것"을 뽑는 것이 중요도의 합리적인 근사치가 된다.
 *
 * reporter(사람이 보는 원문 목록)와 analyst(모델에게 주는 근거 목록) 양쪽에서 공유해서
 * 쓴다 — 안 그러면 피드 목록 순서상 앞에 있는 카테고리(예: AI)가 두 곳 모두에서
 * 목록을 독점하게 된다.
 *
 * @param {import('./types.js').NewsItem[]} sourceItems
 * @param {{ maxTotal?: number, maxPerCategory?: number }} [options]
 * @returns {import('./types.js').NewsItem[]}
 */
export function selectDiverseSources(sourceItems, { maxTotal = 10, maxPerCategory = 2 } = {}) {
  const byCategory = new Map();
  for (const item of sourceItems) {
    const category = item?.category || '기타';
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(item);
  }

  const selected = [];
  for (let round = 0; round < maxPerCategory && selected.length < maxTotal; round++) {
    for (const items of byCategory.values()) {
      if (selected.length >= maxTotal) break;
      if (items[round]) selected.push(items[round]);
    }
  }
  return selected;
}

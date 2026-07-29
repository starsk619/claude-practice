/**
 * 오늘의 picks가 특정 섹터에 몰려 있는지(포트폴리오 레벨 집중 리스크) 점검한다.
 *
 * 종목 하나하나의 손절선을 지켜도, "매수 고려" 종목들이 전부 같은 섹터라면 그 섹터에
 * 악재가 터졌을 때 포트폴리오 전체가 함께 흔들릴 수 있다. watchlist.js의 섹터 그룹을
 * 그대로 재사용해서 별도 데이터 연동 없이 판단한다(워치리스트 밖 종목은 미분류로 제외).
 */
import { SECTOR_BY_NAME } from './watchlist.js';

const CONCENTRATION_THRESHOLD = 2; // "매수 고려" 중 같은 섹터가 이 개수 이상이면 집중 리스크로 간주

/**
 * @param {import('../types.js').StockPick[]} [picks]
 * @returns {{ sector: string, names: string[] }[]} 집중된 섹터 목록(없으면 빈 배열)
 */
export function findSectorConcentration(picks) {
  const buyPicks = (Array.isArray(picks) ? picks : []).filter((pick) => pick?.rating === '매수 고려');

  const namesBySector = new Map();
  for (const pick of buyPicks) {
    const sector = SECTOR_BY_NAME.get(pick?.name);
    if (!sector) continue; // 핵심 관심 종목 워치리스트 밖(오늘 뉴스에만 언급된 종목 등)은 미분류로 제외
    if (!namesBySector.has(sector)) namesBySector.set(sector, []);
    namesBySector.get(sector).push(pick.name);
  }

  return [...namesBySector.entries()]
    .filter(([, names]) => names.length >= CONCENTRATION_THRESHOLD)
    .map(([sector, names]) => ({ sector, names }));
}

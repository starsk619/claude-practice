/**
 * 종목명 -> (종목코드 + 시장구분) 조회.
 *
 * analyst가 만든 StockPick.ticker는 Gemini가 뉴스 텍스트에서 추정한 값이라 신뢰할 수 없어서,
 * scripts/fetch-krx-list.js로 미리 받아둔 KRX 공식 상장기업 목록(src/data/krxListedCompanies.json)
 * 에서 종목명으로 정확한 코드를 찾는다.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// JSON import attributes(`with { type: 'json' }`)는 Node 버전에 따라 지원 여부가 갈려서
// (GitHub Actions의 Node 20.x 패치 버전에 따라 달라질 수 있음), 모든 버전에서 동작하도록
// fs.readFileSync + JSON.parse로 안전하게 읽는다.
const dataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/krxListedCompanies.json');
const krxListedCompanies = JSON.parse(readFileSync(dataPath, 'utf8'));

/**
 * @param {string} name - StockPick.name (종목명)
 * @returns {{ code: string, suffix: string | null } | null}
 */
export function findTicker(name) {
  if (!name) return null;
  const trimmed = name.trim();
  return krxListedCompanies[trimmed] ?? null;
}

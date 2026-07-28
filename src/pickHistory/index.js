/**
 * 리포트의 판단 이력(트랙레코드)을 관리하는 모듈.
 *
 * 매일 GitHub Actions는 완전히 새로운 러너에서 실행되어 로컬 파일시스템에 어제의 기록이
 * 남아있지 않다. 하지만 리포트 자체는 이미 GitHub Pages(config.reportPublicUrl)에 공개
 * 배포되고 있으므로, 같은 방식으로 "판단 이력" JSON도 공개 URL에 함께 배포해두고 다음
 * 실행 때 그 URL에서 다시 읽어오는 방식으로 최소한의 지속성을 확보한다(별도 저장소 쓰기
 * 권한이나 DB 없이도 동작).
 *
 * 이 이력을 analyst 프롬프트에 넣어주면, 모델이 "어제/최근에 이 종목을 뭐라고 판단했었는지"를
 * 참고해서 근거 없이 매일 판단을 뒤집지 않도록(일관성) 유도할 수 있다.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const HISTORY_FILENAME = 'pick-history.json';
const DEFAULT_MAX_ENTRIES = 7; // 최근 일주일치 리포트 정도만 유지 (프롬프트 길이 폭주 방지)

/**
 * @typedef {Object} PickHistoryPick
 * @property {string} ticker
 * @property {string} name
 * @property {string} rating
 * @property {string} confidence
 * @property {number|null} price - 판단 당시 가격(있으면)
 * @property {string|null} currency
 */

/**
 * @typedef {Object} PickHistoryEntry
 * @property {string} generatedAt - ISO 문자열
 * @property {PickHistoryPick[]} picks
 */

/**
 * config.reportPublicUrl(예: .../reports/daily-briefing.html)로부터 같은 디렉터리의
 * pick-history.json URL을 유추한다.
 * @param {string | null} reportPublicUrl
 * @returns {string | null}
 */
export function derivePickHistoryUrl(reportPublicUrl) {
  if (!reportPublicUrl) return null;
  try {
    const url = new URL(reportPublicUrl);
    url.pathname = url.pathname.replace(/[^/]*$/, HISTORY_FILENAME);
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * 공개 배포된 판단 이력 JSON을 가져온다. 아직 배포된 적이 없거나(404) 네트워크 오류가 나도
 * 파이프라인이 죽지 않도록 빈 배열로 조용히 대체한다(이력 없이 시작하는 것과 동일하게 처리).
 * @param {string | null} url
 * @returns {Promise<PickHistoryEntry[]>}
 */
export async function fetchPickHistory(url) {
  if (!url) return [];
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('[pickHistory] 이력 조회 실패(이력 없이 진행):', err?.message ?? err);
    return [];
  }
}

/**
 * 이번 실행 결과(가격 데이터까지 붙은 최종 AnalystResult)로부터 이력 항목 하나를 만든다.
 * @param {import('../types.js').AnalystResult} analystResultWithPrices
 * @returns {PickHistoryEntry}
 */
export function buildHistoryEntry(analystResultWithPrices) {
  const picks = Array.isArray(analystResultWithPrices?.picks) ? analystResultWithPrices.picks : [];
  return {
    generatedAt: analystResultWithPrices?.generatedAt ?? new Date().toISOString(),
    picks: picks.map((pick) => ({
      ticker: pick.ticker,
      name: pick.name,
      rating: pick.rating,
      confidence: pick.confidence,
      price: typeof pick.priceInfo?.currentPrice === 'number' ? pick.priceInfo.currentPrice : null,
      currency: pick.priceInfo?.currency ?? null,
    })),
  };
}

/**
 * 새 항목을 추가하고 최대 개수만 유지하도록 앞에서부터 잘라낸다(오래된 것 제거).
 * @param {PickHistoryEntry[]} history
 * @param {PickHistoryEntry} newEntry
 * @param {number} [maxEntries]
 * @returns {PickHistoryEntry[]}
 */
export function appendPickHistory(history, newEntry, maxEntries = DEFAULT_MAX_ENTRIES) {
  const next = [...(Array.isArray(history) ? history : []), newEntry];
  return next.slice(-maxEntries);
}

/**
 * 갱신된 이력을 로컬 파일로 저장한다(reporter의 saveReportToFile과 같은 reports/ 디렉터리 기준 —
 * GitHub Actions 워크플로에서 daily-briefing.html과 함께 Pages 아티팩트로 복사해서 배포한다).
 * @param {PickHistoryEntry[]} history
 * @param {{ dir?: string }} [options]
 * @returns {Promise<string>} 저장된 파일의 절대 경로
 */
export async function savePickHistoryToFile(history, options = {}) {
  const dir = options.dir ?? path.resolve(process.cwd(), 'reports');
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, HISTORY_FILENAME);
  await writeFile(filePath, JSON.stringify(history, null, 2), 'utf8');
  return filePath;
}

export { HISTORY_FILENAME };

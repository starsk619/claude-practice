/**
 * 오늘 수집된 뉴스 제목/스니펫에서 KRX 상장기업명이 언급된 종목을 찾아낸다.
 *
 * analyst가 종목을 고르기 "전에" 실제 데이터(밸류에이션/변동성)를 판단 근거로 쓸 수 있게 하려면,
 * 어떤 종목을 조회해야 할지 미리 알아야 한다. Gemini를 한 번 더 호출하지 않고(할당량 절약),
 * 이미 로컬에 있는 KRX 종목명 목록(krxListedCompanies.json)과 단순 문자열 포함 검사로 찾는다.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/krxListedCompanies.json');
const krxListedCompanies = JSON.parse(readFileSync(dataPath, 'utf8'));

// 2글자 이하 종목명은 일반 단어와 겹쳐 오탐이 많아 후보 탐색에서 제외한다
// (놓치는 것보다 엉뚱한 종목을 데이터로 채우는 게 더 나쁨 - 오탐은 그냥 낭비되는 API 호출일 뿐이라
//  치명적이지 않지만, 최소한의 정확도는 지키기 위함).
const MIN_NAME_LENGTH = 3;
const CANDIDATE_NAMES = Object.keys(krxListedCompanies).filter((name) => name.length >= MIN_NAME_LENGTH);

/**
 * @param {import('../types.js').NewsItem[]} newsItems
 * @param {{ maxCandidates?: number }} [options]
 * @returns {Array<{ name: string, code: string, suffix: string | null, mentionCount: number }>}
 *   언급 횟수 내림차순, 최대 maxCandidates개
 */
export function findMentionedCompanies(newsItems, options = {}) {
  const maxCandidates = options.maxCandidates ?? 15;
  const items = Array.isArray(newsItems) ? newsItems : [];

  /** @type {Map<string, number>} */
  const mentionCounts = new Map();

  for (const item of items) {
    const text = `${item?.title ?? ''} ${item?.snippet ?? ''}`;
    for (const name of CANDIDATE_NAMES) {
      if (text.includes(name)) {
        mentionCounts.set(name, (mentionCounts.get(name) ?? 0) + 1);
      }
    }
  }

  return [...mentionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCandidates)
    .map(([name, mentionCount]) => ({
      name,
      code: krxListedCompanies[name].code,
      suffix: krxListedCompanies[name].suffix,
      mentionCount,
    }));
}

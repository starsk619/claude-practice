/**
 * KRX(한국거래소) "상장법인목록"을 내려받아 회사명 -> 종목코드/시장구분 매핑 JSON을 생성한다.
 *
 * Gemini가 만든 StockPick.ticker는 뉴스 텍스트에서 추정한 값이라 신뢰할 수 없어서,
 * 실제 주가를 조회하려면 정확한 종목코드가 필요하다 (priceData 모듈이 이 파일을 사용).
 *
 * 상장/상폐가 수시로 생기므로, 이 스크립트는 파이프라인 실행마다 돌리지 않고
 * 사람이 필요할 때(예: 한 달에 한 번) 수동으로 재실행해서 src/data/krxListedCompanies.json을
 * 갱신하는 용도다.
 *
 * 실행: node scripts/fetch-krx-list.js
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const KRX_LIST_URL = 'https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13';
const OUTPUT_PATH = path.resolve(process.cwd(), 'src/data/krxListedCompanies.json');

/** 시장구분(한글, 공백 뒤섞임) -> Yahoo Finance 접미사 매핑 */
function marketToSuffix(marketRaw) {
  const market = marketRaw.replace(/\s+/g, '');
  if (market.includes('코스닥')) return 'KQ';
  // KRX 다운로드 데이터는 코스피를 "유가증권" 대신 "유가"로만 표기하는 경우가 있어 둘 다 확인.
  if (market.includes('유가') || market.includes('코스피')) return 'KS';
  if (market.includes('코넥스')) return 'KN'; // Yahoo Finance는 코넥스를 사실상 지원 안 함(참고용)
  return null;
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseRows(html) {
  const rows = [];
  const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html))) {
    const rowHtml = rowMatch[1];
    if (rowHtml.includes('<th')) continue; // 헤더 행 skip

    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml))) {
      cells.push(stripTags(cellMatch[1]));
    }
    if (cells.length < 3) continue;

    const [name, marketRaw, codeRaw] = cells;
    const code = codeRaw.replace(/\D/g, '');
    const suffix = marketToSuffix(marketRaw);
    if (name && code && code.length === 6) {
      rows.push({ name, code, suffix });
    }
  }
  return rows;
}

async function main() {
  console.log('[fetch-krx-list] KRX 상장법인목록 다운로드 중...');
  const res = await fetch(KRX_LIST_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Referer: 'https://kind.krx.co.kr/corpgeneral/corpList.do',
    },
  });
  if (!res.ok) {
    throw new Error(`KRX 목록 다운로드 실패: HTTP ${res.status}`);
  }

  // 원본이 EUC-KR 인코딩이라 buffer로 받아 직접 디코딩한다.
  const buffer = Buffer.from(await res.arrayBuffer());
  const html = new TextDecoder('euc-kr').decode(buffer);

  const rows = parseRows(html);
  if (rows.length === 0) {
    throw new Error('파싱된 종목이 0건입니다. KRX 페이지 구조가 바뀌었을 수 있습니다.');
  }

  /** @type {Record<string, { code: string, suffix: string | null }>} */
  const mapping = {};
  for (const { name, code, suffix } of rows) {
    mapping[name] = { code, suffix };
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(mapping, null, 0), 'utf8');
  console.log(`[fetch-krx-list] 완료: ${rows.length}개 종목 -> ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('[fetch-krx-list] 실패:', err);
  process.exitCode = 1;
});

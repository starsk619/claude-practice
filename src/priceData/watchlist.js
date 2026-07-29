/**
 * "핵심 관심 종목" 워치리스트.
 *
 * marketContext는 원래 오늘 뉴스에 언급된 종목만 시세/밸류에이션 데이터를 붙였는데,
 * 이러면 커버리지가 "오늘 RSS가 우연히 다룬 회사"에 완전히 좌우돼서 매일 추천 종목이
 * 근거 없이 들쭉날쭉해 보이는 문제가 있었다. 실제 베테랑 애널리스트처럼 뉴스 언급
 * 여부와 무관하게 매일 훑어보는 "핵심 관심 종목군"을 두어, 이 종목들은 뉴스에
 * 안 나와도 항상 시세/밸류에이션 데이터가 제공되도록 한다(다양한 섹터의 대표 대형주 위주).
 *
 * 섹터별로 그룹화해두는 이유는 표시(주석)용만이 아니라, portfolioRisk.js가 오늘 picks가
 * 특정 섹터에 몰려있는지(집중 리스크) 판단할 때 이 그룹 정보를 그대로 사용하기 때문이다.
 *
 * src/data/krxListedCompanies.json에 실제로 존재하는 이름인지는 findTicker()로
 * 런타임에 확인하며, 여기 이름 자체를 코드로 하드코딩하지 않는다(상장폐지/이름
 * 변경에도 안전하게 findTicker가 null을 반환하고 넘어가도록).
 */
export const CORE_WATCHLIST_SECTORS = [
  { sector: '반도체', names: ['삼성전자', 'SK하이닉스'] },
  { sector: '반도체장비', names: ['한미반도체'] },
  { sector: '전자부품', names: ['삼성전기', 'LG이노텍'] },
  { sector: '플랫폼', names: ['NAVER', '카카오'] },
  { sector: '인터넷금융', names: ['카카오뱅크', '카카오페이'] },
  { sector: '2차전지', names: ['LG에너지솔루션', '포스코퓨처엠'] },
  { sector: '바이오/제약', names: ['삼성바이오로직스', '셀트리온', '한미약품', 'SK바이오사이언스'] },
  { sector: '자동차', names: ['현대자동차', '기아'] },
  { sector: '철강/소재', names: ['POSCO홀딩스'] },
  {
    sector: '금융/보험/증권',
    names: ['KB금융', '신한지주', '삼성카드', '미래에셋증권', '한국금융지주', '삼성화재해상보험'],
  },
  { sector: '화학', names: ['LG화학'] },
  { sector: '전지/소재', names: ['삼성SDI'] },
  { sector: '통신', names: ['SK텔레콤', 'LG유플러스'] },
  { sector: '게임', names: ['크래프톤', '넷마블'] },
  { sector: '엔터테인먼트', names: ['하이브', '에스엠'] },
  { sector: 'IT서비스', names: ['삼성에스디에스'] },
  { sector: '조선/방산', names: ['한화에어로스페이스', 'HD현대중공업', '한국항공우주'] },
  { sector: '건설', names: ['현대건설', 'GS건설'] },
  { sector: '항공/해운', names: ['대한항공', '아시아나항공', 'HMM'] },
  {
    sector: '에너지/유틸리티',
    names: ['SK이노베이션', '한국가스공사', '한국전력공사', '두산에너빌리티', 'S-Oil'],
  },
  { sector: '소비재/유통', names: ['CJ제일제당', '오리온', '아모레퍼시픽', 'LG생활건강', '롯데쇼핑', '이마트'] },
  { sector: '지주/기타', names: ['SK스퀘어', '삼성물산'] },
];

export const CORE_WATCHLIST_NAMES = CORE_WATCHLIST_SECTORS.flatMap((group) => group.names);

/**
 * 종목명 -> 섹터 조회용 맵. 워치리스트에 없는 종목(오늘 뉴스에만 언급된 종목 등)은
 * 여기 없으므로 조회 시 undefined가 반환되고, 호출부에서 "미분류"로 처리해야 한다.
 * @type {Map<string, string>}
 */
export const SECTOR_BY_NAME = new Map(
  CORE_WATCHLIST_SECTORS.flatMap((group) => group.names.map((name) => [name, group.sector]))
);

/**
 * KRX(국내 상장)에 없는, 즉 findTicker()로는 찾을 수 없는 핵심 관심 종목.
 * (예: 쿠팡은 국내에서 매우 잘 알려진 소비자 브랜드지만 실제로는 국내 상장이 아니라
 * 뉴욕증권거래소(NYSE)에 상장되어 있어 KRX 목록에 없다.) code/suffix를 직접 지정한다.
 * suffix가 null이면 Yahoo Finance 조회 시 국가 접미사 없이 종목코드 그대로 사용한다.
 * 네이버 금융 밸류에이션(PER/PBR)은 국내 종목 전용이라 이 종목들은 시세만 제공되고
 * 밸류에이션은 "정보 없음"으로 표시된다.
 * @type {Array<{ name: string, code: string, suffix: string | null }>}
 */
export const CORE_WATCHLIST_OVERRIDES = [
  { name: '쿠팡', code: 'CPNG', suffix: null }, // NYSE 상장
];

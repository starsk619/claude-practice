import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { escapeHtml, escapeAndBreak, formatRichText, formatKoreanDate } from './htmlUtils.js';
import { getRatingStyle, getConfidenceDots } from './ratings.js';
import { buildHeadline } from './headline.js';
import { CATEGORIES, CATEGORY_LABELS, CATEGORY_EMOJI } from '../categories.js';
import { selectDiverseSources } from '../newsSelection.js';

export { buildHeadline, buildShortDigest, countByRating } from './headline.js';

/**
 * SummaryResult + AnalystResult를 받아 self-contained HTML 리포트 문자열을 생성한다.
 *
 * 매일 아래 구조를 100% 동일하게 유지한다(뉴스/투자에 익숙하지 않은 사람도
 * "오늘은 어디를 보면 되는지" 눈에 바로 들어오게 하기 위함):
 *   1. 최상단 - 오늘의 한줄 요약 (결론부터, 전문용어 없이) + 원/달러 환율(거시 배경, 조회 실패 시 생략)
 *   2. 종목별 신호등 배지 (매수 고려=초록 / 관망=노랑 / 주의=빨강)
 *   3. 단기 전망 vs 장기 전망 표 (나란히 배치)
 *   4. 뉴스 요약 + 애널리스트 근거 상세
 *   5. 최하단 - 용어설명 박스 + 투자 자문 아님 disclaimer
 *
 * @param {import('../types.js').SummaryResult} summaryResult
 * @param {import('../types.js').AnalystResult} analystResult
 * @returns {string} 완성된 HTML 문서 문자열
 */
export function generateReport(summaryResult, analystResult) {
  const generatedAt = analystResult?.generatedAt ?? summaryResult?.generatedAt ?? new Date().toISOString();
  const dateText = formatKoreanDate(generatedAt);
  const picks = analystResult?.picks ?? [];

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(dateText)} AI/주식 뉴스 리포트</title>
${STYLE_BLOCK}
</head>
<body>
<div class="report">
  ${renderHeader(dateText, analystResult)}
  ${renderBadges(picks)}
  ${renderRiskNotes(analystResult)}
  ${renderOutlookTables(analystResult)}
  ${renderNewsAndRationale(summaryResult, picks)}
  ${renderGlossaryAndDisclaimer(analystResult)}
  <div class="footer-note">이 리포트는 news-bot-team이 자동 생성했습니다. 생성 시각: ${escapeHtml(generatedAt)}</div>
</div>
</body>
</html>
`;

  return html;
}

/** 항상 이 이름으로 덮어써서 저장되는 파일. GitHub Pages 등으로 공개 링크를 만들 때 이 파일만
 * 배포하면, 공개 URL에서는 항상 "오늘 리포트"만 보이고 과거 이력은 노출되지 않는다. */
export const LATEST_REPORT_FILENAME = 'daily-briefing.html';

/**
 * 생성된 HTML 리포트를 파일로 저장한다. (Slack/Telegram 첨부, 카카오 링크용)
 * .gitignore에 `reports/*.html`이 이미 등록되어 있어 저장소에는 올라가지 않는다.
 *
 * 두 가지를 함께 저장한다:
 *   - `reports/YYYY-MM-DD.html`: 날짜별 이력 (로컬 보관용, 나중에 직접 열어볼 수 있음)
 *   - `reports/daily-briefing.html`: 매일 덮어써지는 고정 파일 (공개 배포용 — 이 파일만 GitHub Pages 등에
 *     올리면 외부에는 항상 "오늘 것"만 보이고 과거 리포트는 노출되지 않는다)
 *
 * @param {string} html
 * @param {{ dir?: string, generatedAt?: string }} [options]
 * @returns {Promise<{ historyPath: string, latestPath: string }>} 저장된 두 파일의 절대 경로
 */
export async function saveReportToFile(html, options = {}) {
  const dir = options.dir ?? path.resolve(process.cwd(), 'reports');
  await mkdir(dir, { recursive: true });

  const dateForFilename = safeDateForFilename(options.generatedAt);
  const historyPath = path.join(dir, `${dateForFilename}.html`);
  const latestPath = path.join(dir, LATEST_REPORT_FILENAME);

  await Promise.all([
    writeFile(historyPath, html, 'utf8'),
    writeFile(latestPath, html, 'utf8'),
  ]);

  return { historyPath, latestPath };
}

function safeDateForFilename(isoString) {
  const date = isoString ? new Date(isoString) : new Date();
  const target = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (n) => String(n).padStart(2, '0');
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
}

// ---------------------------------------------------------------------------
// 섹션별 렌더링 함수
// ---------------------------------------------------------------------------

function renderHeader(dateText, analystResult) {
  const headline = buildHeadline(analystResult);
  return `
  <header class="hero">
    <div class="hero-date">${escapeHtml(dateText)}</div>
    <div class="hero-headline">${escapeHtml(headline)}</div>
    ${renderFxContext(analystResult?.fxContext)}
  </header>`;
}

/**
 * 원/달러 환율을 시장 전체의 거시 배경 지표로 매일 같은 위치(헤드라인 바로 아래)에 고정
 * 표시한다. 조회 실패 시(fxContext가 null) 빈 문자열을 반환해 조용히 생략한다.
 * @param {import('../priceData/fxContext.js').FxContext | null} [fxContext]
 */
function renderFxContext(fxContext) {
  if (!fxContext || typeof fxContext.currentPrice !== 'number') return '';

  const change = typeof fxContext.changePercent === 'number' ? fxContext.changePercent : null;
  const changeText = change !== null ? `${change > 0 ? '+' : ''}${change}%` : '정보 없음';
  const changeClass = change === null ? '' : change > 0 ? 'fx-up' : change < 0 ? 'fx-down' : '';
  const changeLabel = fxContext.previousCloseLabel ?? '전일대비';
  const rangeText =
    typeof fxContext.low52w === 'number' && typeof fxContext.high52w === 'number'
      ? ` <span class="fx-range">(52주 ${fxContext.low52w.toLocaleString('ko-KR')}~${fxContext.high52w.toLocaleString('ko-KR')}원)</span>`
      : '';

  return `
    <div class="hero-fx">
      <span class="hero-fx-chip">
        💱 원/달러 환율: <strong>${fxContext.currentPrice.toLocaleString('ko-KR')}원</strong>
        <span class="${changeClass}">(${escapeHtml(changeLabel)} ${escapeHtml(changeText)})</span>${rangeText}
      </span>
    </div>`;
}

function renderBadges(picks) {
  if (!picks.length) {
    return `
  <section class="section">
    <h2 class="section-title">오늘의 종목 신호등</h2>
    <p class="empty-note">오늘은 분석된 종목이 없어요.</p>
  </section>`;
  }

  const badges = picks
    .map((pick) => {
      const style = getRatingStyle(pick?.rating);
      return `
      <div class="badge" style="background:${style.bg};color:${style.fg};border:1px solid ${style.border};">
        <span class="badge-emoji">${style.emoji}</span>
        <span class="badge-name">${escapeHtml(pick?.name ?? '종목명 미상')} <span class="badge-ticker">(${escapeHtml(pick?.ticker ?? '-')})</span></span>
        <span class="badge-rating">${escapeHtml(style.label)}</span>
      </div>`;
    })
    .join('');

  return `
  <section class="section">
    <h2 class="section-title">오늘의 종목 신호등</h2>
    <div class="badge-legend">
      <span><span class="legend-dot" style="background:#34a853"></span>매수 고려</span>
      <span><span class="legend-dot" style="background:#f9ab00"></span>관망</span>
      <span><span class="legend-dot" style="background:#e53935"></span>주의</span>
    </div>
    <div class="badge-grid">${badges}</div>
  </section>`;
}

/**
 * 종목 하나하나의 손절선과는 별개로, 포트폴리오 전체 관점의 참고 사항 세 가지를 보여준다:
 * 1) 오늘 "매수 고려" 종목이 특정 섹터에 몰려 있는지(집중 리스크)
 * 2) 지난 1주일/1개월 전 판단이 실제로 맞았는지(트랙레코드)
 * 3) 판단 유형(등급)별 누적 성과(표본이 쌓일수록 채워짐, 자기 보정 참고용)
 * 셋 다 데이터가 없으면(첫 실행 등) 섹션 자체를 생략한다.
 * @param {import('../types.js').AnalystResult} analystResult
 */
function renderRiskNotes(analystResult) {
  const concentrationHtml = renderSectorConcentration(analystResult?.sectorConcentration);
  const trackRecordHtml = renderTrackRecord(analystResult?.trackRecord);
  const ratingPerformanceHtml = renderRatingPerformance(analystResult?.ratingPerformance);
  if (!concentrationHtml && !trackRecordHtml && !ratingPerformanceHtml) return '';

  return `
  <section class="section">
    <h2 class="section-title">리스크 참고</h2>
    ${concentrationHtml}
    ${trackRecordHtml}
    ${ratingPerformanceHtml}
  </section>`;
}

/** @param {{ sector: string, names: string[] }[]} [sectorConcentration] */
function renderSectorConcentration(sectorConcentration) {
  if (!Array.isArray(sectorConcentration) || !sectorConcentration.length) return '';

  const items = sectorConcentration
    .map(
      (c) =>
        `<li>${escapeHtml(c.sector)}: ${c.names.map(escapeHtml).join(', ')} (${c.names.length}개)</li>`
    )
    .join('');

  return `
    <div class="risk-note concentration-note">
      ⚠️ <strong>섹터 집중 주의</strong> — 오늘 "매수 고려" 종목 중 같은 섹터가 몰려 있어요.
      이 섹터에 악재가 생기면 여러 종목이 동시에 흔들릴 수 있으니 분산을 고려하세요.
      <ul>${items}</ul>
    </div>`;
}

/** @param {{ oneWeek: object|null, oneMonth: object|null }} [trackRecord] */
function renderTrackRecord(trackRecord) {
  if (!trackRecord) return '';

  const rows = [trackRecord.oneWeek, trackRecord.oneMonth].filter(Boolean).map(renderTrackRecordRow);
  if (!rows.length) return '';

  return `
    <div class="risk-note track-record-note">
      <strong>지난 판단 성과 (참고용)</strong>
      <ul>${rows.join('')}</ul>
    </div>`;
}

function renderTrackRecordRow(stat) {
  const sign = stat.avgReturnPercent > 0 ? '+' : '';
  return `<li>${escapeHtml(stat.label)} 전 판단(${stat.count}건) 적중률 ${stat.hitRatePercent}% (${stat.hits}/${stat.count}), 평균 수익률 ${sign}${stat.avgReturnPercent}%</li>`;
}

/**
 * 판단 유형(등급)별 누적 성과. 표본이 부족한 등급(null)은 표시하지 않고, 전부 표본 부족이면
 * 섹션 자체를 생략한다(초기 며칠간 빈 박스만 뜨는 것을 방지).
 * @param {Object<string, { count: number, hits: number, hitRatePercent: number, avgReturnPercent: number }|null>} [ratingPerformance]
 */
function renderRatingPerformance(ratingPerformance) {
  if (!ratingPerformance || typeof ratingPerformance !== 'object') return '';

  const rows = Object.entries(ratingPerformance)
    .filter(([, stat]) => stat !== null && stat !== undefined)
    .map(([rating, stat]) => renderRatingPerformanceRow(rating, stat));
  if (!rows.length) return '';

  return `
    <div class="risk-note rating-performance-note">
      <strong>판단 유형별 누적 성과 (자기 보정 참고용)</strong>
      <ul>${rows.join('')}</ul>
    </div>`;
}

function renderRatingPerformanceRow(rating, stat) {
  const sign = stat.avgReturnPercent > 0 ? '+' : '';
  return `<li>${escapeHtml(rating)}(${stat.count}건) 적중률 ${stat.hitRatePercent}% (${stat.hits}/${stat.count}), 평균 수익률 ${sign}${stat.avgReturnPercent}%</li>`;
}

function renderOutlookTables(analystResult) {
  const shortTerm = analystResult?.shortTermOutlook ?? '아직 준비된 내용이 없어요.';
  const longTerm = analystResult?.longTermOutlook ?? '아직 준비된 내용이 없어요.';

  return `
  <section class="section">
    <h2 class="section-title">단기 전망 &amp; 장기 전망</h2>
    <div class="outlook-grid">
      <div class="outlook-card outlook-short">
        <div class="outlook-title">단기 전망 <span class="outlook-sub">(1일~1개월)</span></div>
        <div class="outlook-body">${formatRichText(shortTerm)}</div>
      </div>
      <div class="outlook-card outlook-long">
        <div class="outlook-title">장기 전망 <span class="outlook-sub">(6개월~1년+)</span></div>
        <div class="outlook-body">${formatRichText(longTerm)}</div>
      </div>
    </div>
  </section>`;
}

/**
 * StockPick.priceInfo(src/priceData가 채운 실제 시세)를 리포트용 문자열로 렌더링한다.
 * 한국 시장 관례대로 상승은 빨강, 하락은 파랑으로 표시한다.
 * @param {import('../types.js').PriceInfo|null} [priceInfo]
 */
function renderPriceInfo(priceInfo) {
  if (!priceInfo) {
    return '<span class="price-missing">가격 정보 없음 (종목명 매핑 또는 시세 조회 실패)</span>';
  }
  const { currentPrice, changePercent, previousCloseLabel, high52w, low52w, currency } = priceInfo;
  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('ko-KR') : '-');
  const currencyLabel = escapeHtml(currency ?? '');

  let changeHtml = '<span class="price-flat">등락률 정보 없음</span>';
  if (typeof changePercent === 'number') {
    const sign = changePercent > 0 ? '+' : '';
    const cls = changePercent > 0 ? 'price-up' : changePercent < 0 ? 'price-down' : 'price-flat';
    // 직전 거래일이 어제가 아니면(휴장일을 건너뛴 경우) 기준일을 함께 표시해서, "전일대비"로
    // 오해하지 않도록 한다(평소엔 previousCloseLabel이 "전일대비"라 아무 것도 안 붙음).
    const labelSuffix =
      previousCloseLabel && previousCloseLabel !== '전일대비' ? `, ${escapeHtml(previousCloseLabel)}` : '';
    changeHtml = `<span class="${cls}">${sign}${changePercent}%${labelSuffix}</span>`;
  }

  return `${fmt(currentPrice)}${currencyLabel} (${changeHtml}) · 52주 ${fmt(low52w)}~${fmt(high52w)}`;
}

function renderNewsAndRationale(summaryResult, picks) {
  const categories = summaryResult?.categories ?? {};
  const sourceItems = summaryResult?.sourceItems ?? [];

  const detailCards = picks.length
    ? picks
        .map((pick) => {
          const style = getRatingStyle(pick?.rating);
          const dots = getConfidenceDots(pick?.confidence);
          return `
      <div class="detail-card" style="border-left:6px solid ${style.border};">
        <div class="detail-card-header">
          <span class="detail-card-title">${style.emoji} ${escapeHtml(pick?.name ?? '종목명 미상')} (${escapeHtml(pick?.ticker ?? '-')})</span>
          <span class="detail-card-rating" style="color:${style.fg};">${escapeHtml(style.label)}</span>
        </div>
        <div class="detail-row"><span class="detail-label">시세</span><span>${renderPriceInfo(pick?.priceInfo)}</span></div>
        <div class="detail-row"><span class="detail-label">근거</span><span>${formatRichText(pick?.rationale ?? '-')}</span></div>
        <div class="detail-row"><span class="detail-label">리스크</span><span>${formatRichText(pick?.risk ?? '-')}</span></div>
        <div class="detail-row"><span class="detail-label">확신도</span><span>${escapeHtml(pick?.confidence ?? '정보 없음')} <span class="confidence-dots">${dots}</span></span></div>
        <div class="detail-row"><span class="detail-label">포지션</span><span>${formatRichText(pick?.positionGuidance ?? '-')}</span></div>
      </div>`;
        })
        .join('')
    : `<p class="empty-note">오늘은 상세 분석 종목이 없어요.</p>`;

  const sourcesBlock = renderSources(sourceItems);

  const newsCards = CATEGORIES.map((key) => {
    const emoji = CATEGORY_EMOJI[key] ?? '📰';
    const title = CATEGORY_LABELS[key] ?? key;
    const summary = categories[key] ?? `오늘의 ${title} 요약이 아직 없어요.`;
    return `
      <div class="news-card">
        <div class="news-card-title">${emoji} ${title}</div>
        <div class="news-card-body">${escapeAndBreak(summary)}</div>
      </div>`;
  }).join('');

  return `
  <section class="section">
    <h2 class="section-title">뉴스 요약</h2>
    <div class="news-grid">${newsCards}</div>
    ${sourcesBlock}
  </section>

  <section class="section">
    <h2 class="section-title">애널리스트 근거 상세</h2>
    <div class="detail-grid">${detailCards}</div>
  </section>`;
}

function renderSources(sourceItems) {
  if (!sourceItems.length) return '';

  const limitedItems = selectDiverseSources(sourceItems);

  const items = limitedItems
    .map((item) => {
      const title = escapeHtml(item?.title ?? '제목 없음');
      const url = escapeHtml(item?.url ?? '#');
      const source = escapeHtml(item?.source ?? '');
      const publishedAt = escapeHtml(item?.publishedAt ?? '');
      return `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a><span class="source-meta">${source}${source && publishedAt ? ' · ' : ''}${publishedAt}</span></li>`;
    })
    .join('');

  return `
    <details class="sources">
      <summary>분야별 주요 원본 기사 보기 (${limitedItems.length}건)</summary>
      <ul class="source-list">${items}</ul>
    </details>`;
}

function renderGlossaryAndDisclaimer(analystResult) {
  const disclaimer = analystResult?.disclaimer
    ?? '이 리포트는 정보 제공 목적으로만 작성되었으며, 투자 자문이나 매매 권유가 아닙니다. 투자에 대한 최종 판단과 책임은 투자자 본인에게 있습니다.';

  return `
  <section class="section glossary-section">
    <details class="glossary-details">
      <summary>📘 처음 보는 분들을 위한 용어 설명 보기</summary>
      <div class="glossary-box">
        <dl>
          <dt>🟢 매수 고려</dt><dd>지금 상황이 나쁘지 않아 보여서, 관심 있게 살펴봐도 좋다는 의미예요. "지금 당장 사라"는 뜻은 아니에요.</dd>
          <dt>🟡 관망</dt><dd>당장 사거나 팔기보다는, 조금 더 지켜보자는 의미예요.</dd>
          <dt>🔴 주의</dt><dd>불확실하거나 안 좋은 신호가 있어서, 조심해야 한다는 의미예요.</dd>
          <dt>단기 전망</dt><dd>앞으로 1일~1개월 정도의 가까운 미래를 보고 하는 예상이에요.</dd>
          <dt>장기 전망</dt><dd>6개월~1년 이상의 먼 미래를 보고 하는 예상이에요.</dd>
          <dt>확신도</dt><dd>이 전망을 얼마나 자신 있게 말하는지 나타내는 정도예요. (강함 ●●● / 중간 ●●○ / 약함 ●○○)</dd>
          <dt>리스크 요인</dt><dd>예상이 빗나갈 수 있는 위험 요소, 즉 "이런 일이 생기면 전망이 틀릴 수 있다"는 부분이에요.</dd>
          <dt>PER (주가수익비율)</dt><dd>주가가 그 회사의 연간 순이익 대비 몇 배인지 나타내는 숫자예요. 낮을수록 "이익 대비 주가가 싸다"고 볼 수 있어요(단, 업종마다 적정 수준이 달라요).</dd>
          <dt>PBR (주가순자산비율)</dt><dd>주가가 그 회사의 순자산(자본) 대비 몇 배인지 나타내는 숫자예요. 1보다 낮으면 "회사 자산 가치보다 주가가 싸다"는 뜻으로 해석되기도 해요.</dd>
          <dt>연환산 변동성</dt><dd>최근 주가가 하루하루 얼마나 크게 출렁였는지를 1년 기준으로 환산한 수치예요. 높을수록 가격이 급등락하기 쉬운(위험이 큰) 종목이라는 뜻이에요.</dd>
          <dt>배당수익률</dt><dd>주가 대비 1년에 배당금으로 얼마를 받을 수 있는지를 %로 나타낸 숫자예요.</dd>
        </dl>
      </div>
    </details>
    <div class="disclaimer-box">
      ⚠️ <strong>투자 자문이 아닙니다.</strong> ${escapeHtml(disclaimer)}
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// 스타일 (인라인 CSS, 외부 리소스 의존 없음)
// ---------------------------------------------------------------------------

const STYLE_BLOCK = `<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px 12px;
    background: #f4f5f7;
    font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, "Malgun Gothic", sans-serif;
    color: #202124;
    line-height: 1.6;
  }
  .report {
    max-width: 760px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 2px 10px rgba(0,0,0,0.06);
  }
  .hero {
    background: linear-gradient(135deg, #1a237e, #283593);
    color: #ffffff;
    padding: 28px 24px;
  }
  .hero-date { font-size: 14px; opacity: 0.85; margin-bottom: 8px; }
  .hero-headline { font-size: 20px; font-weight: 700; line-height: 1.5; }
  .hero-fx { margin-top: 12px; }
  .hero-fx-chip {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    font-size: 14px;
    font-weight: 600;
    padding: 7px 14px;
    background: rgba(255,255,255,0.14);
    border: 1px solid rgba(255,255,255,0.22);
    border-radius: 10px;
  }
  .hero-fx .fx-range { opacity: 0.8; font-weight: 400; }
  .hero-fx .fx-up { color: #ffcdb2; font-weight: 700; }
  .hero-fx .fx-down { color: #bbe3ff; font-weight: 700; }
  .section { padding: 24px; border-top: 1px solid #eceef1; }
  .section-title { font-size: 17px; margin: 0 0 14px; }
  .empty-note { color: #5f6368; font-size: 14px; }

  .badge-legend { display: flex; gap: 16px; font-size: 12px; color: #5f6368; margin-bottom: 12px; }
  .legend-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
  .badge-grid { display: flex; flex-wrap: wrap; gap: 10px; }
  .badge {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 14px; border-radius: 999px; font-size: 14px; font-weight: 600;
  }
  .badge-ticker { font-weight: 400; opacity: 0.8; }
  .badge-rating { margin-left: 4px; }

  .risk-note { margin-bottom: 10px; padding: 12px 14px; border-radius: 10px; font-size: 13px; }
  .risk-note:last-child { margin-bottom: 0; }
  .risk-note.concentration-note { background: #fff3e0; border: 1px solid #ffcc80; color: #6b4a00; }
  .risk-note.track-record-note { background: #eef2f7; border: 1px solid #c8d6e5; color: #2b3a4a; }
  .risk-note.rating-performance-note { background: #eef7f0; border: 1px solid #b7ddc3; color: #1f4a2c; }
  .risk-note ul { margin: 6px 0 0; padding-left: 18px; }
  .risk-note li { margin-bottom: 2px; }

  .outlook-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
  @media (max-width: 560px) { .news-grid { grid-template-columns: 1fr; } }
  .outlook-card { background: #f8f9fb; border-radius: 12px; padding: 16px; }
  .outlook-short { border-top: 4px solid #4285f4; }
  .outlook-long { border-top: 4px solid #673ab7; }
  .outlook-title { font-weight: 700; margin-bottom: 8px; }
  .outlook-sub { font-weight: 400; font-size: 12px; color: #5f6368; }
  .outlook-body { font-size: 14px; white-space: normal; }

  .news-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 12px; }
  .news-card { background: #f8f9fb; border-radius: 12px; padding: 16px; }
  .news-card-title { font-weight: 700; margin-bottom: 8px; }
  .news-card-body { font-size: 14px; }

  .sources { margin-top: 8px; font-size: 13px; color: #3c4043; }
  .sources summary { cursor: pointer; color: #1a73e8; }
  .source-list { padding-left: 18px; margin: 8px 0 0; }
  .source-list li { margin-bottom: 6px; }
  .source-list a { color: #1a0dab; text-decoration: none; }
  .source-list a:hover { text-decoration: underline; }
  .source-meta { display: block; font-size: 11px; color: #80868b; }

  .detail-grid { display: flex; flex-direction: column; gap: 14px; }
  .detail-card { background: #f8f9fb; border-radius: 8px; padding: 14px 16px; }
  .detail-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px; }
  .detail-card-title { font-weight: 700; }
  .detail-card-rating { font-weight: 700; font-size: 13px; }
  .detail-row { font-size: 13.5px; margin-bottom: 4px; display: flex; gap: 6px; }
  .detail-label { flex: 0 0 56px; color: #5f6368; font-weight: 600; }
  .confidence-dots { letter-spacing: 2px; color: #1a237e; }
  /* 한국 시장 관례: 상승=빨강, 하락=파랑 */
  .price-up { color: #d32f2f; font-weight: 700; }
  .price-down { color: #1a73e8; font-weight: 700; }
  .price-flat, .price-missing { color: #5f6368; }

  .glossary-section { background: #fafbfc; }
  .glossary-details summary { cursor: pointer; color: #1a73e8; font-weight: 600; font-size: 14px; }
  .glossary-box { background: #eef2f7; border-radius: 12px; padding: 16px 20px; font-size: 13.5px; margin-top: 10px; }
  .glossary-box dl { margin: 0; }
  .glossary-box dt { font-weight: 700; margin-top: 10px; }
  .glossary-box dt:first-child { margin-top: 0; }
  .glossary-box dd { margin: 2px 0 0; color: #3c4043; }

  .disclaimer-box {
    margin-top: 16px; padding: 14px 16px; border-radius: 10px;
    background: #fff8e1; border: 1px solid #f9e0a0; font-size: 12.5px; color: #6b5300;
  }

  .footer-note { text-align: center; font-size: 11px; color: #9aa0a6; padding: 16px; }
</style>`;

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { escapeHtml, escapeAndBreak, formatRichText, formatKoreanDate } from './htmlUtils.js';
import { getRatingStyle, getConfidenceDots } from './ratings.js';
import { buildHeadline } from './headline.js';

export { buildHeadline, buildShortDigest, countByRating } from './headline.js';

/**
 * SummaryResult + AnalystResult를 받아 self-contained HTML 리포트 문자열을 생성한다.
 *
 * 매일 아래 구조를 100% 동일하게 유지한다(뉴스/투자에 익숙하지 않은 사람도
 * "오늘은 어디를 보면 되는지" 눈에 바로 들어오게 하기 위함):
 *   1. 최상단 - 오늘의 한줄 요약 (결론부터, 전문용어 없이)
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
  </header>`;
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

function renderNewsAndRationale(summaryResult, picks) {
  const aiSummary = summaryResult?.categories?.ai ?? '오늘의 AI 뉴스 요약이 아직 없어요.';
  const stockSummary = summaryResult?.categories?.stock ?? '오늘의 주식 뉴스 요약이 아직 없어요.';
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
        <div class="detail-row"><span class="detail-label">근거</span><span>${formatRichText(pick?.rationale ?? '-')}</span></div>
        <div class="detail-row"><span class="detail-label">리스크</span><span>${formatRichText(pick?.risk ?? '-')}</span></div>
        <div class="detail-row"><span class="detail-label">확신도</span><span>${escapeHtml(pick?.confidence ?? '정보 없음')} <span class="confidence-dots">${dots}</span></span></div>
      </div>`;
        })
        .join('')
    : `<p class="empty-note">오늘은 상세 분석 종목이 없어요.</p>`;

  const sourcesBlock = renderSources(sourceItems);

  return `
  <section class="section">
    <h2 class="section-title">뉴스 요약</h2>
    <div class="news-grid">
      <div class="news-card">
        <div class="news-card-title">🤖 AI 뉴스</div>
        <div class="news-card-body">${escapeAndBreak(aiSummary)}</div>
      </div>
      <div class="news-card">
        <div class="news-card-title">📈 주식 뉴스</div>
        <div class="news-card-body">${escapeAndBreak(stockSummary)}</div>
      </div>
    </div>
    ${sourcesBlock}
  </section>

  <section class="section">
    <h2 class="section-title">애널리스트 근거 상세</h2>
    <div class="detail-grid">${detailCards}</div>
  </section>`;
}

const MAX_SOURCE_LIST_ITEMS = 10;

function renderSources(sourceItems) {
  if (!sourceItems.length) return '';

  // NewsItem에는 조회수 데이터가 없어(RSS가 제공하지 않음) "인기순"으로 정렬할 수는 없고,
  // 대신 리포트가 너무 길어지지 않도록 최대 10건만 보여준다.
  const limitedItems = sourceItems.slice(0, MAX_SOURCE_LIST_ITEMS);
  const omittedCount = sourceItems.length - limitedItems.length;

  const items = limitedItems
    .map((item) => {
      const title = escapeHtml(item?.title ?? '제목 없음');
      const url = escapeHtml(item?.url ?? '#');
      const source = escapeHtml(item?.source ?? '');
      const publishedAt = escapeHtml(item?.publishedAt ?? '');
      return `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a><span class="source-meta">${source}${source && publishedAt ? ' · ' : ''}${publishedAt}</span></li>`;
    })
    .join('');

  const summaryText = omittedCount > 0
    ? `원본 기사 목록 보기 (${limitedItems.length}건 표시, 전체 ${sourceItems.length}건 중)`
    : `원본 기사 목록 보기 (${limitedItems.length}건)`;

  return `
    <details class="sources">
      <summary>${summaryText}</summary>
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

  .outlook-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
  @media (max-width: 560px) { .news-grid { grid-template-columns: 1fr; } }
  .outlook-card { background: #f8f9fb; border-radius: 12px; padding: 16px; }
  .outlook-short { border-top: 4px solid #4285f4; }
  .outlook-long { border-top: 4px solid #673ab7; }
  .outlook-title { font-weight: 700; margin-bottom: 8px; }
  .outlook-sub { font-weight: 400; font-size: 12px; color: #5f6368; }
  .outlook-body { font-size: 14px; white-space: normal; }

  .news-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 12px; }
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

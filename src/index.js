/**
 * news-bot 전체 파이프라인 진입점.
 * collector → summarizer → analyst → reporter → notifier 순서로 연결한다.
 *
 * 실행 방법:
 *   node src/index.js          - CRON_SCHEDULE(기본 매일 08:00, Asia/Seoul)에 맞춰 스케줄 등록 후 대기
 *   node src/index.js --once   - 스케줄 등록 없이 지금 한 번만 실행하고 종료
 */
import { validateEnv, config } from './config.js';
import { collectNews } from './collectors/index.js';
import { summarizeNews } from './summarizer/index.js';
import { analyzeInvestment } from './analyst/index.js';
import { enrichPicksWithPriceData } from './priceData/index.js';
import { buildMarketContext } from './priceData/marketContext.js';
import { fetchFxContext } from './priceData/fxContext.js';
import { findSectorConcentration } from './priceData/portfolioRisk.js';
import {
  derivePickHistoryUrl,
  fetchPickHistory,
  buildHistoryEntry,
  appendPickHistory,
  savePickHistoryToFile,
  PROMPT_HISTORY_ENTRIES,
} from './pickHistory/index.js';
import { computeTrackRecord } from './pickHistory/trackRecord.js';
import { generateReport, saveReportToFile } from './reporter/index.js';
import { sendDailyReport, scheduleDailyRun } from './notifier/index.js';

/**
 * .env에 설정된 값을 기준으로 이번 실행에서 사용할 발송 채널 목록을 결정한다.
 * @returns {string[]}
 */
function resolveActiveChannels() {
  const channels = [];
  if (config.slackWebhookUrl) channels.push('slack');
  if (config.telegramBotToken && config.telegramChatId) channels.push('telegram');
  if (config.kakaoRestApiKey && config.kakaoRefreshToken) channels.push('kakao');
  return channels;
}

/**
 * 파이프라인 1회 실행: 수집 → 요약 → 분석 → 리포트 생성 → 발송.
 * @returns {Promise<{ newsItems: object[], summaryResult: object, analystResult: object, reportPath: string, sendResults: object[] }>}
 */
export async function runDailyPipeline() {
  console.log('[news-bot] 파이프라인 시작');

  const newsItems = await collectNews();
  console.log(`[news-bot] 1/4 뉴스 수집 완료: ${newsItems.length}건`);

  const summaryResult = await summarizeNews(newsItems);
  console.log('[news-bot] 2/4 요약 완료');

  // analyst가 종목을 고르기 "전에" 참고할 실제 시세/밸류에이션/변동성 데이터를 준비한다
  // (Gemini 호출 없이 KRX 종목명 매칭 + 무료 시세 API만 사용, 실패해도 빈 배열로 계속 진행).
  // 원/달러 환율(fxContext)도 서로 독립적인 조회라 함께 병렬로 가져온다(실패해도 null로 계속 진행).
  const [marketContext, fxContext] = await Promise.all([buildMarketContext(newsItems), fetchFxContext()]);
  console.log(`[news-bot] 시장 데이터 준비: ${marketContext.length}개 종목 참고 데이터 확보, 환율 조회 ${fxContext ? '성공' : '실패'}`);

  // GitHub Actions는 매번 새 러너에서 실행돼 로컬에 어제 기록이 없으므로, 이미 공개
  // 배포된 이력 JSON을 다시 읽어와 "최근 판단 이력"으로 analyst에 제공한다(일관성 유지용).
  const pickHistoryUrl = derivePickHistoryUrl(config.reportPublicUrl);
  const pickHistory = await fetchPickHistory(pickHistoryUrl);
  console.log(`[news-bot] 판단 이력 조회: 최근 리포트 ${pickHistory.length}건 확보`);

  // analyst 프롬프트에는 이력 전체가 아니라 최근 것만 넘긴다(프롬프트 길이 폭주 방지 -
  // 전체 이력은 트랙레코드 검증(아래 computeTrackRecord)에 필요해서 별도로 더 오래 보관한다).
  // 두 호출 다 marketContext/pickHistory만 있으면 되는 독립적인 작업이라 동시에 실행한다.
  const [analystResult, trackRecord] = await Promise.all([
    analyzeInvestment(summaryResult, marketContext, pickHistory.slice(-PROMPT_HISTORY_ENTRIES), fxContext),
    computeTrackRecord(pickHistory, marketContext),
  ]);
  console.log(`[news-bot] 3/4 투자 분석 완료: 종목 ${analystResult.picks?.length ?? 0}건`);

  // 뉴스 텍스트만으로는 "이미 주가에 반영됐는지" 알 수 없어서, 실제 시세(무료 Yahoo Finance)를
  // 붙여 보완한다. marketContext에 이미 조회해둔 스냅샷이 있으면 재사용하고(분석 전/후 두 번
  // 조회하면 그 사이 가격이 바뀌어 카드 안 시세가 어긋나는 문제가 있었음), 없는 종목만 새로
  // 조회한다. 종목명이 KRX 목록에 없거나 시세 조회가 실패해도 파이프라인은 계속 진행된다.
  const enrichedPicks = await enrichPicksWithPriceData(analystResult.picks, marketContext);
  // "매수 고려" 종목들이 특정 섹터에 몰려있는지(포트폴리오 레벨 집중 리스크) 점검한다.
  const sectorConcentration = findSectorConcentration(enrichedPicks);
  const analystResultWithPrices = { ...analystResult, picks: enrichedPicks, sectorConcentration, trackRecord, fxContext };

  // 이번 판단 결과를 이력에 추가해서 저장해두면, 다음 실행(내일 08:00) 때 다시 읽어와
  // "지난번엔 이 종목을 뭐라고 판단했는지" 참고할 수 있다. 리포트 파일과 함께 GitHub
  // Pages로 배포되도록 reports/ 디렉터리에 저장한다(워크플로에서 _site로 복사).
  const updatedPickHistory = appendPickHistory(pickHistory, buildHistoryEntry(analystResultWithPrices));
  const pickHistoryPath = await savePickHistoryToFile(updatedPickHistory);
  console.log(`[news-bot] 판단 이력 저장: ${pickHistoryPath} (총 ${updatedPickHistory.length}건 유지)`);

  const html = generateReport(summaryResult, analystResultWithPrices);
  const { historyPath, latestPath } = await saveReportToFile(html, {
    generatedAt: analystResultWithPrices.generatedAt,
  });
  console.log(`[news-bot] 4/4 리포트 저장: ${historyPath} (공개용 최신본: ${latestPath})`);

  const channels = resolveActiveChannels();
  if (channels.length === 0) {
    console.warn('[news-bot] 발송 채널이 설정되지 않아 발송을 건너뜁니다 (.env의 SLACK_WEBHOOK_URL / TELEGRAM_BOT_TOKEN+CHAT_ID / KAKAO_* 확인).');
    return { newsItems, summaryResult, analystResult: analystResultWithPrices, reportPath: historyPath, sendResults: [] };
  }

  const sendResults = await sendDailyReport({
    channels,
    summaryResult,
    analystResult: analystResultWithPrices,
    reportPath: latestPath,
    reportUrl: config.reportPublicUrl,
  });
  for (const result of sendResults) {
    console.log(`[news-bot] 발송(${result.channel}): ${result.ok ? '성공' : `실패 - ${result.error}`}`);
  }

  return { newsItems, summaryResult, analystResult: analystResultWithPrices, reportPath: historyPath, sendResults };
}

async function main() {
  validateEnv();

  const runOnce = process.argv.includes('--once');
  if (runOnce) {
    await runDailyPipeline();
    // Gemini SDK 등이 내부적으로 열어둔 커넥션이 남아있으면 프로세스가 스스로 종료되지 않을 수 있어
    // (GitHub Actions에서 스텝이 끝나지 않고 계속 대기하는 문제로 확인됨) 명시적으로 종료한다.
    process.exit(0);
  }

  scheduleDailyRun(runDailyPipeline);
  console.log('[news-bot] 스케줄러 등록 완료. 프로세스를 종료하지 말고 계속 실행해두세요.');
}

main().catch((err) => {
  console.error('[news-bot] 치명적 오류로 종료합니다:', err);
  process.exitCode = 1;
});

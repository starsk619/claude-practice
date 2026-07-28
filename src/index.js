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

  const analystResult = await analyzeInvestment(summaryResult);
  console.log(`[news-bot] 3/4 투자 분석 완료: 종목 ${analystResult.picks?.length ?? 0}건`);

  // 뉴스 텍스트만으로는 "이미 주가에 반영됐는지" 알 수 없어서, 실제 시세(무료 Yahoo Finance)를
  // 붙여 보완한다. 종목명이 KRX 목록에 없거나 시세 조회가 실패해도 파이프라인은 계속 진행된다.
  const enrichedPicks = await enrichPicksWithPriceData(analystResult.picks);
  const analystResultWithPrices = { ...analystResult, picks: enrichedPicks };

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

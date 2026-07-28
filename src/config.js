import "dotenv/config";

/**
 * 이 프로젝트가 필요로 하는 환경 변수 검증 모듈.
 *
 * - GEMINI_API_KEY 는 summarizer/analyst 모듈이 사용하므로 항상 필수.
 * - 알림은 최소 한 가지 채널이 있어야 의미가 있으므로
 *     SLACK_WEBHOOK_URL
 *   또는
 *     TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (둘 다 있어야 유효)
 *   또는
 *     KAKAO_REST_API_KEY + KAKAO_REFRESH_TOKEN (둘 다 있어야 유효)
 *   중 최소 하나의 조합이 채워져 있어야 한다.
 *
 * 누락 시 어떤 변수가 빠졌는지 명확히 알려주는 에러 메시지와 함께
 * process.exit(1) 로 앱 구동을 즉시 중단시킨다.
 */

function isSet(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * 환경 변수 검증. 실패 시 누락된 항목을 콘솔에 출력하고 process.exit(1)한다.
 * 성공 시 아무것도 반환하지 않고 조용히 통과한다.
 */
export function validateEnv() {
  const missing = [];

  if (!isSet(process.env.GEMINI_API_KEY)) {
    missing.push("GEMINI_API_KEY");
  }

  const hasSlack = isSet(process.env.SLACK_WEBHOOK_URL);
  const hasTelegramToken = isSet(process.env.TELEGRAM_BOT_TOKEN);
  const hasTelegramChatId = isSet(process.env.TELEGRAM_CHAT_ID);
  const hasTelegram = hasTelegramToken && hasTelegramChatId;
  const hasKakaoKey = isSet(process.env.KAKAO_REST_API_KEY);
  const hasKakaoRefreshToken = isSet(process.env.KAKAO_REFRESH_TOKEN);
  const hasKakao = hasKakaoKey && hasKakaoRefreshToken;

  if (!hasSlack && !hasTelegram && !hasKakao) {
    // 알림 채널 자체가 하나도 없는 경우
    if (hasTelegramToken && !hasTelegramChatId) {
      missing.push("TELEGRAM_CHAT_ID (TELEGRAM_BOT_TOKEN만 설정되어 있음)");
    } else if (!hasTelegramToken && hasTelegramChatId) {
      missing.push("TELEGRAM_BOT_TOKEN (TELEGRAM_CHAT_ID만 설정되어 있음)");
    } else if (hasKakaoKey && !hasKakaoRefreshToken) {
      missing.push(
        "KAKAO_REFRESH_TOKEN (KAKAO_REST_API_KEY만 설정되어 있음 - node scripts/kakao-auth.js로 발급)"
      );
    } else if (!hasKakaoKey && hasKakaoRefreshToken) {
      missing.push("KAKAO_REST_API_KEY (KAKAO_REFRESH_TOKEN만 설정되어 있음)");
    } else {
      missing.push(
        "SLACK_WEBHOOK_URL 또는 (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID) 또는 (KAKAO_REST_API_KEY + KAKAO_REFRESH_TOKEN) 중 최소 하나"
      );
    }
  }

  if (missing.length > 0) {
    console.error("\n[config] 필수 환경 변수가 누락되어 앱을 시작할 수 없습니다:\n");
    for (const item of missing) {
      console.error(`  - ${item}`);
    }
    console.error(
      "\n.env.example 을 참고해서 프로젝트 루트에 .env 파일을 만들고 값을 채워주세요."
    );
    console.error("(.env 는 .gitignore 에 등록되어 있어 git에 올라가지 않습니다.)\n");
    process.exit(1);
  }
}

/**
 * 검증된 환경 변수를 한 곳에서 가져다 쓸 수 있도록 정리한 설정 객체.
 * validateEnv() 를 먼저 호출해 필수 값이 채워져 있음을 보장한 뒤 사용할 것.
 */
export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || null,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || null,
  telegramChatId: process.env.TELEGRAM_CHAT_ID || null,
  kakaoRestApiKey: process.env.KAKAO_REST_API_KEY || null,
  kakaoRefreshToken: process.env.KAKAO_REFRESH_TOKEN || null,
  reportPublicUrl: process.env.REPORT_PUBLIC_URL || null,
  cronSchedule: process.env.CRON_SCHEDULE || "0 8 * * *",
  newsRssFeeds: (process.env.NEWS_RSS_FEEDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export default config;

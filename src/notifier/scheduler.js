import cron from 'node-cron';

const DEFAULT_SCHEDULE = '0 8 * * *';

/**
 * .env의 CRON_SCHEDULE(기본 "0 8 * * *")에 따라 매일 runFn을 실행하는 스케줄러를 등록한다.
 * 토큰/설정은 process.env로만 읽는다(하드코딩 금지).
 *
 * @param {() => Promise<void> | void} runFn - 매일 실행할 파이프라인 함수
 * @param {{ schedule?: string, timezone?: string, runImmediately?: boolean }} [options]
 * @returns {import('node-cron').ScheduledTask}
 */
export function scheduleDailyRun(runFn, options = {}) {
  if (typeof runFn !== 'function') {
    throw new TypeError('scheduleDailyRun(runFn): runFn은 함수여야 합니다.');
  }

  const schedule = options.schedule ?? process.env.CRON_SCHEDULE ?? DEFAULT_SCHEDULE;
  if (!cron.validate(schedule)) {
    throw new Error(`유효하지 않은 CRON_SCHEDULE 값입니다: "${schedule}"`);
  }
  const timezone = options.timezone ?? process.env.CRON_TIMEZONE ?? 'Asia/Seoul';

  const task = cron.schedule(
    schedule,
    async () => {
      try {
        await runFn();
      } catch (err) {
        console.error('[notifier] 예약 실행 중 오류 발생:', err);
      }
    },
    { timezone },
  );

  console.log(`[notifier] 매일 실행 스케줄 등록 완료: "${schedule}" (timezone: ${timezone})`);

  if (options.runImmediately) {
    runFn().catch((err) => console.error('[notifier] 즉시 실행 중 오류 발생:', err));
  }

  return task;
}

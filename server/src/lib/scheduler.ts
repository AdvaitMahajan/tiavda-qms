import { logger } from './logger';
import { pool } from '../db';
import { env } from '../env';
import { runDaily, runWeekly, runFollowUpDigest } from '../modules/cron/cron.routes';

/**
 * In-process scheduler for the jobs that used to have no trigger at all.
 *
 * Runs inside the API rather than from an external caller: the process is
 * already long-lived on Railway, so there are no extra secrets to keep in step
 * and a failure shows up in the API's own logs.
 *
 * Times are Asia/Kolkata — the business runs on IST and the reminders are read
 * by people in that timezone, so the schedule should not drift with the host.
 */
type JobName = 'daily' | 'followup-digest' | 'weekly';

interface Job {
  name: JobName;
  hour: number;              // IST
  minute: number;
  /** 1 = Monday. Omit for daily. */
  weekday?: number;
  run: () => Promise<Record<string, unknown>>;
}

const JOBS: Job[] = [
  { name: 'daily', hour: 8, minute: 0, run: runDaily },
  { name: 'followup-digest', hour: 11, minute: 0, run: runFollowUpDigest },
  { name: 'weekly', hour: 9, minute: 0, weekday: 1, run: runWeekly },
];

/** IST wall-clock parts, independent of the server's own timezone. */
function istNow(): { date: string; hour: number; minute: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: weekdays[parts.weekday as string] ?? 0,
  };
}

/**
 * Records the last IST date each job ran. Held in the database, not memory, so a
 * restart or redeploy near the scheduled minute cannot send a second set of
 * reminders. Created on demand because migrations are not applied on deploy.
 */
async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.cron_runs (
      job          text PRIMARY KEY,
      last_run_date date NOT NULL,
      last_run_at  timestamptz NOT NULL DEFAULT now()
    )`);
}

/**
 * Claims the day for a job. The INSERT ... ON CONFLICT only updates when the
 * stored date is older, and reports whether it changed anything — so two
 * instances racing produce exactly one run.
 */
async function claimRun(job: JobName, date: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO public.cron_runs (job, last_run_date) VALUES ($1, $2::date)
     ON CONFLICT (job) DO UPDATE SET last_run_date = EXCLUDED.last_run_date, last_run_at = now()
     WHERE public.cron_runs.last_run_date < EXCLUDED.last_run_date
     RETURNING job`,
    [job, date],
  );
  return (rowCount ?? 0) > 0;
}

async function tick(): Promise<void> {
  const now = istNow();
  for (const job of JOBS) {
    if (now.hour !== job.hour || now.minute !== job.minute) continue;
    if (job.weekday !== undefined && now.weekday !== job.weekday) continue;
    try {
      if (!(await claimRun(job.name, now.date))) continue; // already run today
      logger.info({ job: job.name }, 'scheduler: running job');
      const result = await job.run();
      logger.info({ job: job.name, result }, 'scheduler: job finished');
    } catch (err) {
      logger.error({ err, job: job.name }, 'scheduler: job failed');
    }
  }
}

export function startScheduler(): void {
  if (env.SCHEDULER_ENABLED === 'false') {
    logger.info('scheduler: disabled by SCHEDULER_ENABLED=false');
    return;
  }
  void ensureTable()
    .then(() => {
      // Every 30s so a minute is never missed if a tick runs slightly long.
      setInterval(() => void tick(), 30_000).unref();
      logger.info(
        { jobs: JOBS.map((j) => `${j.name} ${j.hour}:${String(j.minute).padStart(2, '0')} IST`) },
        'scheduler: started',
      );
    })
    .catch((err) => logger.error({ err }, 'scheduler: could not start'));
}

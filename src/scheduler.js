const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { syncAll } = require('./db/seed/syncMcazRegisters');

// Runs every day at 02:00 server time
const SCHEDULE = '0 2 * * *';

function startScheduler() {
  cron.schedule(SCHEDULE, async () => {
    console.log('[Scheduler] Starting daily MCAZ register sync...');
    try {
      await syncAll();
    } catch (err) {
      console.error('[Scheduler] MCAZ sync error:', err.message);
    }
  });

  console.log(`[Scheduler] MCAZ daily sync scheduled (${SCHEDULE} — runs at 02:00).`);
}

module.exports = { startScheduler };

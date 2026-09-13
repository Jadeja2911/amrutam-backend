/**
 * Minimal async job queue for heavy/non-critical tasks (e.g. sending a
 * booking confirmation email/SMS) so the booking HTTP request doesn't
 * block on slow downstream calls.
 *
 * This is an in-memory stub suitable for a single-instance deployment.
 * In production, replace this with a durable queue (e.g. BullMQ + Redis,
 * SQS, or a Postgres-backed job table) so jobs survive a process restart
 * and can be retried with backoff.
 */

const queue = [];
let processing = false;

function enqueue(jobName, payload) {
  queue.push({ jobName, payload, enqueuedAt: new Date().toISOString() });
  processQueue();
}

async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const job = queue.shift();
    try {
      await runJob(job);
    } catch (err) {
      console.error(JSON.stringify({
        level: 'error',
        message: 'Job failed',
        jobName: job.jobName,
        error: err.message,
      }));
    }
  }
  processing = false;
}

async function runJob(job) {
  switch (job.jobName) {
    case 'SEND_BOOKING_CONFIRMATION':
      // Placeholder: in production this would call an email/SMS provider.
      console.log(JSON.stringify({
        level: 'info',
        message: 'Booking confirmation sent (stub)',
        consultationId: job.payload.consultationId,
        patientId: job.payload.patientId,
      }));
      break;
    default:
      console.warn(JSON.stringify({ level: 'warn', message: 'Unknown job', jobName: job.jobName }));
  }
}

module.exports = { enqueue };

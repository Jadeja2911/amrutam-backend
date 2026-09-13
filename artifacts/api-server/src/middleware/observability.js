// Basic structured request logging + in-memory metrics.
// In production, replace the in-memory counters with a real metrics
// backend (Prometheus, Datadog, etc.) and ship logs to a log aggregator.

const metrics = {
  requestCount: 0,
  errorCount: 0,
  requestsByRoute: {},
  startedAt: new Date().toISOString(),
};

function requestLogger(req, res, next) {
  const start = Date.now();
  metrics.requestCount += 1;
  const routeKey = `${req.method} ${req.path}`;
  metrics.requestsByRoute[routeKey] = (metrics.requestsByRoute[routeKey] || 0) + 1;

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    if (res.statusCode >= 500) {
      metrics.errorCount += 1;
    }
    // Structured JSON log line - easy to ship to a log aggregator later.
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      userId: req.user ? req.user.userId : null,
    }));
  });

  next();
}

function metricsHandler(req, res) {
  res.json({
    ...metrics,
    uptimeSeconds: process.uptime(),
  });
}

module.exports = { requestLogger, metricsHandler };

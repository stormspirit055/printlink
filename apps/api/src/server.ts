import { app, container } from './app.js';

export async function startServer() {
  await container.initialize();
  const server = app.listen(container.config.PORT, () => {
    console.log(`PrintLink API listening on http://localhost:${container.config.PORT}`);
  });
  server.requestTimeout = container.config.REQUEST_TIMEOUT_MS;
  server.headersTimeout = Math.min(container.config.REQUEST_TIMEOUT_MS + 1000, 60000);
  server.keepAliveTimeout = 5000;

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const forceClose = setTimeout(() => server.closeAllConnections(), container.config.SHUTDOWN_TIMEOUT_MS);
    forceClose.unref();
    await new Promise<void>((resolve) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
    clearTimeout(forceClose);
    await container.close();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return server;
}

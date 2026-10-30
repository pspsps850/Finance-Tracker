import app from './app.js';
import { closePool, verifyConnection } from './db/pool.js';

const parsedPort = Number.parseInt(process.env.PORT, 10);
const port =
  Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536 ? parsedPort : 4000;

async function start() {
  try {
    await verifyConnection();
    console.log('Database connection successful');
  } catch (error) {
    console.error('Database connection failed:', error.message);
    process.exitCode = 1;
    return;
  }

  const server = app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });

  server.on('error', (error) => {
    console.error('HTTP server error:', error.message);
    process.exitCode = 1;
  });

  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down...`);

    const forceExit = setTimeout(() => {
      console.error('Shutdown timed out.');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async (error) => {
      if (error) {
        console.error('HTTP server close failed:', error.message);
        process.exitCode = 1;
      }

      try {
        await closePool();
      } catch (closeError) {
        console.error('Database pool close failed:', closeError.message);
        process.exitCode = 1;
      }

      clearTimeout(forceExit);
      process.exit(process.exitCode ?? 0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
    shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    shutdown('uncaughtException');
  });
}

start();

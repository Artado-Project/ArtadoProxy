import { app } from './app.js';

const port = Number(process.env.PORT ?? 8787);
const server = app.listen(port, () => {
  process.stdout.write(`listening on http://localhost:${port}\n`);
});

async function shutdown() {
  server.close(() => {});
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

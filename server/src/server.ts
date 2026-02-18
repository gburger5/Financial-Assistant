import 'dotenv/config';
import { buildApp } from './app.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

async function startServer() {
  const app = buildApp();

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server running at http://localhost:${PORT}`);
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

startServer();
import http from 'node:http';
import { app } from './app.js';
import { config } from './config.js';

const server = http.createServer(app);

server.listen(config.port, () => {
  console.log(`[hanycard-backend] listening on :${config.port}`);
});

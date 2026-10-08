#!/usr/bin/env node
import cron from 'node-cron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backupScript = path.join(__dirname, 'backup.js');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

function runBackup() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [backupScript], {
      cwd: path.join(__dirname, '..'),
      env: process.env,
      stdio: 'inherit',
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`backup.js exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

console.log('Backup scheduler is running. Next run is daily at 17:00.');

cron.schedule(
  '0 17 * * *',
  async () => {
    try {
      console.log(`Running scheduled backup at ${new Date().toISOString()}`);
      await runBackup();
      console.log('Scheduled backup completed successfully.');
    } catch (error) {
      console.error('Scheduled backup failed:', error instanceof Error ? error.message : String(error));
    }
  },
  {
    timezone: 'Asia/Riyadh',
  },
);

await Promise.resolve();

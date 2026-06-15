import process from 'node:process';

export const logger = {
  info(message: string): void {
    process.stdout.write(`[info] ${message}\n`);
  },
  error(message: string): void {
    process.stderr.write(`[error] ${message}\n`);
  },
};

import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const { error } = dotenv.config({
  path: fileURLToPath(new URL('../../.env.test', import.meta.url)),
  override: true,
  quiet: true
});
if (error) throw error;

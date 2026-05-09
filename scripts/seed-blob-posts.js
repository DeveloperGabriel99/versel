import 'dotenv/config';

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { put } from '@vercel/blob';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFile = process.env.POSTS_DATA_FILE
  ? path.resolve(rootDir, process.env.POSTS_DATA_FILE)
  : path.join(rootDir, 'data', 'posts.json');
const blobPath = process.env.POSTS_BLOB_PATH?.trim() || 'data/posts.json';

if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
  console.error('BLOB_READ_WRITE_TOKEN nao configurado.');
  process.exit(1);
}

const fileContent = await fs.readFile(sourceFile, 'utf8');
const posts = JSON.parse(fileContent.replace(/^\uFEFF/, ''));

if (!Array.isArray(posts)) {
  console.error('Arquivo de postagens invalido.');
  process.exit(1);
}

await put(blobPath, JSON.stringify(posts, null, 2), {
  access: 'private',
  allowOverwrite: true,
  contentType: 'application/json'
});

console.log(JSON.stringify({ ok: true, uploaded: posts.length, blobPath }, null, 2));

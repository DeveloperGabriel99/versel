import 'dotenv/config';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listPosts, updatePostTmdbMetadata } from '../src/services/postsStore.js';
import { syncTmdbMetadata } from '../src/services/tmdbService.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = process.env.POSTS_DATA_FILE
  ? path.resolve(rootDir, process.env.POSTS_DATA_FILE)
  : path.join(rootDir, 'data', 'posts.json');
const force = process.argv.includes('--force');
const posts = await listPosts(dataFile);
let updated = 0;
let skipped = 0;
let notFound = 0;

for (const post of posts) {
  if (!force && post.posterPath) {
    skipped += 1;
    continue;
  }

  const metadata = await syncTmdbMetadata({
    title: post.title,
    category: post.category,
    mediaType: post.mediaType,
    tmdbId: post.tmdbId
  });

  if (!metadata) {
    notFound += 1;
    continue;
  }

  await updatePostTmdbMetadata(dataFile, post.id, metadata);
  updated += 1;
}

console.log(JSON.stringify({ total: posts.length, updated, skipped, notFound }, null, 2));

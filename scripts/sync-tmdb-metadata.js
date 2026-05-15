import 'dotenv/config';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listPosts, replacePosts } from '../src/services/postsStore.js';
import { syncTmdbMetadata } from '../src/services/tmdbService.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = process.env.POSTS_DATA_FILE
  ? path.resolve(rootDir, process.env.POSTS_DATA_FILE)
  : path.join(rootDir, 'data', 'posts.json');
const force = process.argv.includes('--force');
const concurrency = getConcurrency();
const posts = await listPosts(dataFile);
let updated = 0;
let skipped = 0;
let notFound = 0;

const syncedPosts = await mapWithConcurrency(posts, concurrency, async (post, index) => {
  if (!force && !needsTmdbSync(post)) {
    skipped += 1;
    return post;
  }

  const metadata = await syncTmdbMetadata({
    title: post.title,
    category: post.category,
    mediaType: post.mediaType,
    tmdbId: post.tmdbId
  });

  if (!metadata) {
    notFound += 1;
    logProgress(index + 1, posts.length, post.title, 'nao_encontrado');
    return {
      ...post,
      tmdbLookupStatus: 'not_found',
      tmdbSyncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  updated += 1;
  logProgress(index + 1, posts.length, post.title, 'atualizado');

  return {
    ...post,
    ...metadata,
    tmdbLookupStatus: 'found',
    updatedAt: new Date().toISOString()
  };
});

await replacePosts(dataFile, syncedPosts);

console.log(JSON.stringify({ total: posts.length, updated, skipped, notFound }, null, 2));

function needsTmdbSync(post) {
  if (post.tmdbLookupStatus === 'not_found' && post.tmdbSyncedAt) {
    return false;
  }

  if (!post.tmdbId && !post.posterPath) return true;
  if (!post.releaseDate) return true;
  if (!Array.isArray(post.genres) || post.genres.length === 0) return true;
  if (post.voteAverage == null) return true;
  if (!Array.isArray(post.cast) || post.cast.length === 0) return true;

  if (post.mediaType === 'movie' && !post.runtimeMinutes) return true;
  if (post.mediaType === 'tv' && (!post.seasonsCount || !post.episodesCount)) return true;

  return false;
}

function getConcurrency() {
  const raw = Number(process.env.TMDB_SYNC_CONCURRENCY ?? 6);

  if (!Number.isFinite(raw) || raw < 1) {
    return 6;
  }

  return Math.min(12, Math.floor(raw));
}

async function mapWithConcurrency(items, size, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}

function logProgress(index, total, title, status) {
  if (index === total || index % 25 === 0) {
    console.log(`[tmdb] ${index}/${total} ${status}: ${title}`);
  }
}

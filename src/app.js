import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { downloadTelegramPhotoIfPresent } from './services/telegramMedia.js';
import { extractTelegramMessage, parseTelegramPosts } from './services/telegramParser.js';
import {
  getPostById,
  listPosts,
  removePostTmdbMetadata,
  updatePostTmdbMetadata,
  upsertTelegramPosts
} from './services/postsStore.js';
import { syncTmdbMetadata } from './services/tmdbService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const uploadsDir = path.join(publicDir, 'uploads', 'telegram');
const dataFile = resolveDataFile(process.env.POSTS_DATA_FILE, rootDir);
const allowedChatId = process.env.TELEGRAM_ALLOWED_CHAT_ID?.trim();
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const adminApiSecret = process.env.ADMIN_API_SECRET?.trim();
const inlineTmdbLimit = Number(process.env.INLINE_TMDB_LIMIT ?? 60);

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '15mb' }));
  app.use(express.static(publicDir));

  app.get('/', (_request, response) => {
    response.sendFile(path.join(publicDir, 'index.html'));
  });

  app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'telegram-auto-blog' });
  });

  app.get('/api/posts', async (_request, response, next) => {
    try {
      response.set('Cache-Control', 'no-store, max-age=0');
      response.json({ posts: await listPosts(dataFile) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/favicon.ico', (_request, response) => {
    response.status(204).end();
  });

  app.post('/api/posts/:id/tmdb/refresh', async (request, response, next) => {
    try {
      if (!requireAdminAccess(request, response)) {
        return;
      }

      const post = await getPostById(dataFile, request.params.id);

      if (!post) {
        return response.status(404).json({ ok: false, error: 'post_not_found' });
      }

      const metadata = await syncTmdbMetadata({
        title: post.title,
        category: post.category,
        mediaType: request.body?.mediaType ?? post.mediaType,
        tmdbId: request.body?.tmdbId
      });

      if (!metadata) {
        return response.json({ ok: true, post, updated: false });
      }

      const updatedPost = await updatePostTmdbMetadata(dataFile, post.id, metadata);
      response.json({ ok: true, post: updatedPost, updated: true });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/posts/:id/tmdb/remove', async (request, response, next) => {
    try {
      if (!requireAdminAccess(request, response)) {
        return;
      }

      const updatedPost = await removePostTmdbMetadata(dataFile, request.params.id);

      if (!updatedPost) {
        return response.status(404).json({ ok: false, error: 'post_not_found' });
      }

      response.json({ ok: true, post: updatedPost });
    } catch (error) {
      next(error);
    }
  });

  app.post('/webhook/telegram', async (request, response, next) => {
    try {
      if (webhookSecret) {
        const receivedSecret = request.header('x-telegram-bot-api-secret-token');

        if (receivedSecret !== webhookSecret) {
          return response.status(401).json({ ok: false, error: 'invalid_webhook_secret' });
        }
      }

      const telegramMessage = extractTelegramMessage(request.body);

      if (!telegramMessage) {
        console.info('[telegram-webhook] skipped unsupported_update');
        return response.status(202).json({ ok: true, skipped: 'unsupported_update' });
      }

      const chatId = String(telegramMessage.chat?.id ?? '');

      if (allowedChatId && chatId !== allowedChatId) {
        console.info('[telegram-webhook] skipped chat_not_allowed', { chatId });
        return response.status(202).json({ ok: true, skipped: 'chat_not_allowed' });
      }

      const parsedPosts = parseTelegramPosts(telegramMessage);

      if (!parsedPosts.isValid) {
        console.info('[telegram-webhook] skipped missing_required_fields', {
          chatId,
          errors: parsedPosts.errors
        });
        return response.status(202).json({
          ok: true,
          skipped: 'missing_required_fields',
          errors: parsedPosts.errors
        });
      }

      // Telegram envia apenas file_id no webhook; esta etapa baixa a imagem se ela existir.
      const thumbnailUrl = await downloadTelegramPhotoIfPresent(telegramMessage, {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        uploadsDir
      });

      const postInputs = await mapWithConcurrency(parsedPosts.posts, 10, async (parsedPost, index) => {
        const metadata = parsedPosts.posts.length <= inlineTmdbLimit
          ? await syncTmdbMetadata({
            title: parsedPost.title,
            category: parsedPost.category
          })
          : null;

        return {
          title: parsedPost.title,
          category: parsedPost.category,
          link: parsedPost.link,
          thumbnailUrl,
          telegramChatId: chatId,
          telegramMessageId: telegramMessage.message_id,
          sourceKey: `${chatId}:${telegramMessage.message_id}:${parsedPost.sourceItemKey ?? index}`,
          publishedAt: getTelegramDate(telegramMessage),
          ...(metadata ?? {})
        };
      });

      const results = await upsertTelegramPosts(dataFile, postInputs);
      const savedPosts = results.map((result) => result.post);
      const createdCount = results.filter((result) => result.created).length;
      const categorySummary = savedPosts.reduce((summary, post) => {
        summary[post.category] = (summary[post.category] ?? 0) + 1;
        return summary;
      }, {});

      response.status(createdCount > 0 ? 201 : 200).json({
        ok: true,
        created: createdCount,
        updated: savedPosts.length - createdCount,
        posts: savedPosts
      });
      console.info('[telegram-webhook] processed', {
        chatId,
        messageId: telegramMessage.message_id,
        parsed: parsedPosts.posts.length,
        created: createdCount,
        updated: savedPosts.length - createdCount,
        categories: categorySummary
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(500).json({ ok: false, error: 'internal_server_error' });
  });

  return app;
}

export const app = createApp();

function getTelegramDate(message) {
  if (typeof message.date !== 'number') {
    return new Date().toISOString();
  }

  return new Date(message.date * 1000).toISOString();
}

function requireAdminAccess(request, response) {
  if (!adminApiSecret) {
    response.status(404).json({ ok: false, error: 'not_found' });
    return false;
  }

  const authHeader = request.header('authorization') ?? '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const receivedSecret = request.header('x-admin-secret') ?? bearerToken;

  if (receivedSecret !== adminApiSecret) {
    response.status(403).json({ ok: false, error: 'forbidden' });
    return false;
  }

  return true;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

function resolveDataFile(configuredPath, baseDir) {
  if (!configuredPath) {
    return path.join(baseDir, 'data', 'posts.json');
  }

  return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(baseDir, configuredPath);
}

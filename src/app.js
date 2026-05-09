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
  upsertTelegramPost
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

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '15mb' }));
  app.use(express.static(publicDir));

  app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'telegram-auto-blog' });
  });

  app.get('/api/posts', async (_request, response, next) => {
    try {
      response.json({ posts: await listPosts(dataFile) });
    } catch (error) {
      next(error);
    }
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
        return response.status(202).json({ ok: true, skipped: 'unsupported_update' });
      }

      const chatId = String(telegramMessage.chat?.id ?? '');

      if (allowedChatId && chatId !== allowedChatId) {
        return response.status(202).json({ ok: true, skipped: 'chat_not_allowed' });
      }

      const parsedPosts = parseTelegramPosts(telegramMessage);

      if (!parsedPosts.isValid) {
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

      const savedPosts = [];
      let createdCount = 0;

      for (const [index, parsedPost] of parsedPosts.posts.entries()) {
        const result = await upsertTelegramPost(dataFile, {
          title: parsedPost.title,
          category: parsedPost.category,
          link: parsedPost.link,
          thumbnailUrl,
          telegramChatId: chatId,
          telegramMessageId: telegramMessage.message_id,
          sourceKey: `${chatId}:${telegramMessage.message_id}:${parsedPost.sourceItemKey ?? index}`,
          publishedAt: getTelegramDate(telegramMessage)
        });
        let post = result.post;
        const shouldSyncTmdb = result.created || result.contentChanged || !post.posterPath;

        if (shouldSyncTmdb) {
          const metadata = await syncTmdbMetadata({
            title: parsedPost.title,
            category: parsedPost.category,
            mediaType: post.mediaType
          });

          if (metadata) {
            post = await updatePostTmdbMetadata(dataFile, post.id, metadata);
          }
        }

        if (result.created) {
          createdCount += 1;
        }

        savedPosts.push(post);
      }

      response.status(createdCount > 0 ? 201 : 200).json({
        ok: true,
        created: createdCount,
        updated: savedPosts.length - createdCount,
        posts: savedPosts
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

function resolveDataFile(configuredPath, baseDir) {
  if (!configuredPath) {
    return path.join(baseDir, 'data', 'posts.json');
  }

  return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(baseDir, configuredPath);
}

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { get, put } from '@vercel/blob';

const POSTS_BLOB_PATH = process.env.POSTS_BLOB_PATH?.trim() || 'data/posts.json';

export async function listPosts(dataFile) {
  const posts = await readPosts(dataFile);

  return posts.sort((first, second) => {
    return new Date(second.publishedAt).getTime() - new Date(first.publishedAt).getTime();
  });
}

export async function upsertTelegramPost(dataFile, postInput) {
  const posts = await readPosts(dataFile);
  const sourceKey = postInput.sourceKey ?? `${postInput.telegramChatId}:${postInput.telegramMessageId}`;
  const existingIndex = posts.findIndex((post) => {
    if (post.source === 'telegram' && post.sourceKey === sourceKey) {
      return true;
    }

    // Quando a mensagem vem do Telegram, o sourceKey inclui o ID da mensagem.
    // Assim uma lista reenviada pelo bot deve gerar uma nova atualizacao,
    // enquanto edicoes/reentregas da mesma mensagem atualizam o registro.
    if (postInput.sourceKey) {
      return false;
    }

    return samePostOnSameDay(post, postInput);
  });

  const existingPost = existingIndex >= 0 ? posts[existingIndex] : null;
  const contentChanged = existingPost
    ? normalizeText(existingPost.title) !== normalizeText(postInput.title)
      || normalizeText(existingPost.category) !== normalizeText(postInput.category)
    : true;
  const nextPost = {
    id: existingIndex >= 0 ? posts[existingIndex].id : crypto.randomUUID(),
    source: 'telegram',
    sourceKey,
    title: postInput.title,
    category: postInput.category,
    link: postInput.link ?? null,
    thumbnailUrl: postInput.thumbnailUrl,
    telegramChatId: postInput.telegramChatId,
    telegramMessageId: postInput.telegramMessageId,
    tmdbId: postInput.tmdbId ?? existingPost?.tmdbId ?? null,
    mediaType: postInput.mediaType ?? existingPost?.mediaType ?? null,
    posterPath: postInput.posterPath ?? existingPost?.posterPath ?? null,
    backdropPath: postInput.backdropPath ?? existingPost?.backdropPath ?? null,
    tmdbTitle: postInput.tmdbTitle ?? existingPost?.tmdbTitle ?? null,
    tmdbYear: postInput.tmdbYear ?? existingPost?.tmdbYear ?? null,
    overview: postInput.overview ?? existingPost?.overview ?? '',
    tmdbSyncedAt: postInput.tmdbSyncedAt ?? existingPost?.tmdbSyncedAt ?? null,
    publishedAt: postInput.publishedAt,
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    posts[existingIndex] = {
      ...posts[existingIndex],
      ...nextPost
    };

    await writePosts(dataFile, posts);
    return { post: posts[existingIndex], created: false, contentChanged };
  }

  const createdPost = {
    ...nextPost,
    createdAt: new Date().toISOString()
  };

  posts.push(createdPost);
  await writePosts(dataFile, posts);

  return { post: createdPost, created: true, contentChanged: true };
}

export async function updatePostTmdbMetadata(dataFile, postId, metadata) {
  return updatePost(dataFile, postId, (post) => ({
    ...post,
    ...metadata,
    updatedAt: new Date().toISOString()
  }));
}

export async function removePostTmdbMetadata(dataFile, postId) {
  return updatePost(dataFile, postId, (post) => ({
    ...post,
    tmdbId: null,
    mediaType: null,
    posterPath: null,
    backdropPath: null,
    tmdbTitle: null,
    tmdbYear: null,
    overview: '',
    tmdbSyncedAt: null,
    updatedAt: new Date().toISOString()
  }));
}

export async function getPostById(dataFile, postId) {
  const posts = await readPosts(dataFile);

  return posts.find((post) => post.id === postId) ?? null;
}

async function updatePost(dataFile, postId, updater) {
  const posts = await readPosts(dataFile);
  const postIndex = posts.findIndex((post) => post.id === postId);

  if (postIndex < 0) {
    return null;
  }

  posts[postIndex] = updater(posts[postIndex]);
  await writePosts(dataFile, posts);

  return posts[postIndex];
}

function samePostOnSameDay(existingPost, nextPost) {
  return normalizeText(existingPost.title) === normalizeText(nextPost.title)
    && normalizeText(existingPost.category) === normalizeText(nextPost.category)
    && dayKey(existingPost.publishedAt) === dayKey(nextPost.publishedAt);
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function dayKey(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
}

async function readPosts(dataFile) {
  if (shouldUseBlobStore()) {
    return readBlobPosts();
  }

  return readFilePosts(dataFile);
}

async function writePosts(dataFile, posts) {
  if (shouldUseBlobStore()) {
    await writeBlobPosts(posts);
    return;
  }

  await writeFilePosts(dataFile, posts);
}

async function readFilePosts(dataFile) {
  try {
    const fileContent = (await fs.readFile(dataFile, 'utf8')).replace(/^\uFEFF/, '');
    const parsed = JSON.parse(fileContent);

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

async function writeFilePosts(dataFile, posts) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });

  const temporaryFile = `${dataFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(posts, null, 2));
  await fs.rename(temporaryFile, dataFile);
}

async function readBlobPosts() {
  assertBlobToken();

  const result = await get(POSTS_BLOB_PATH, { access: 'private' });

  if (!result || result.statusCode === 404 || !result.stream) {
    return [];
  }

  const fileContent = (await new Response(result.stream).text()).replace(/^\uFEFF/, '');
  const parsed = JSON.parse(fileContent || '[]');

  return Array.isArray(parsed) ? parsed : [];
}

async function writeBlobPosts(posts) {
  assertBlobToken();

  await put(POSTS_BLOB_PATH, JSON.stringify(posts, null, 2), {
    access: 'private',
    allowOverwrite: true,
    contentType: 'application/json'
  });
}

function shouldUseBlobStore() {
  return process.env.POSTS_STORAGE === 'blob' || Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function assertBlobToken() {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required when POSTS_STORAGE=blob.');
  }
}

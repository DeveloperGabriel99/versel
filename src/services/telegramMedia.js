import fs from 'node:fs/promises';
import path from 'node:path';
import { put } from '@vercel/blob';

export async function downloadTelegramPhotoIfPresent(message, { botToken, uploadsDir }) {
  const bestPhoto = selectLargestPhoto(message.photo);

  if (!bestPhoto || !botToken) {
    return null;
  }

  const filePath = await getTelegramFilePath(botToken, bestPhoto.file_id);
  const extension = path.extname(filePath) || '.jpg';
  const fileName = buildSafeFileName(message, bestPhoto, extension);
  const outputPath = path.join(uploadsDir, fileName);
  const shouldUseBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());

  if (!shouldUseBlob) {
    await fs.mkdir(uploadsDir, { recursive: true });

    try {
      await fs.access(outputPath);
      return `/uploads/telegram/${fileName}`;
    } catch {
      // Arquivo ainda nao existe localmente; segue para download.
    }
  }

  const imageResponse = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);

  if (!imageResponse.ok) {
    throw new Error(`Telegram file download failed with status ${imageResponse.status}`);
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  if (shouldUseBlob) {
    const blob = await put(`uploads/telegram/${fileName}`, imageBuffer, {
      access: 'public',
      allowOverwrite: true,
      contentType: getImageContentType(extension)
    });

    return blob.url;
  }

  await fs.writeFile(outputPath, imageBuffer);

  return `/uploads/telegram/${fileName}`;
}

function selectLargestPhoto(photoSizes) {
  if (!Array.isArray(photoSizes) || photoSizes.length === 0) {
    return null;
  }

  return [...photoSizes].sort((first, second) => {
    return (second.file_size ?? 0) - (first.file_size ?? 0);
  })[0];
}

async function getTelegramFilePath(botToken, fileId) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);

  if (!response.ok) {
    throw new Error(`Telegram getFile failed with status ${response.status}`);
  }

  const payload = await response.json();

  if (!payload.ok || !payload.result?.file_path) {
    throw new Error('Telegram getFile returned an invalid payload');
  }

  return payload.result.file_path;
}

function buildSafeFileName(message, photo, extension) {
  const chatId = String(message.chat?.id ?? 'chat').replace(/[^a-z0-9_-]/gi, '');
  const messageId = String(message.message_id ?? 'message').replace(/[^a-z0-9_-]/gi, '');
  const photoId = String(photo.file_unique_id ?? photo.file_id ?? 'photo').replace(/[^a-z0-9_-]/gi, '');

  return `${chatId}_${messageId}_${photoId}${extension}`;
}

function getImageContentType(extension) {
  const normalized = extension.toLowerCase();

  if (normalized === '.png') {
    return 'image/png';
  }

  if (normalized === '.webp') {
    return 'image/webp';
  }

  return 'image/jpeg';
}

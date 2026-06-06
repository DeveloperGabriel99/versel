const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const TELEGRAM_ALLOWED_UPDATES = ['message', 'channel_post', 'edited_message', 'edited_channel_post'];

export async function getTelegramWebhookInfo({ botToken } = {}) {
  const safeBotToken = String(botToken ?? '').trim();

  if (!safeBotToken) {
    return {
      ok: false,
      skipped: 'missing_bot_token'
    };
  }

  return telegramRequest(safeBotToken, 'getWebhookInfo');
}

export async function registerTelegramWebhook({ botToken, publicUrl, secretToken } = {}) {
  const safeBotToken = String(botToken ?? '').trim();
  const webhookUrl = buildTelegramWebhookUrl(publicUrl);

  if (!safeBotToken) {
    return {
      ok: false,
      skipped: 'missing_bot_token'
    };
  }

  if (!webhookUrl) {
    return {
      ok: false,
      skipped: 'missing_public_url'
    };
  }

  const payload = {
    url: webhookUrl,
    allowed_updates: TELEGRAM_ALLOWED_UPDATES
  };

  const safeSecretToken = String(secretToken ?? '').trim();

  if (safeSecretToken) {
    payload.secret_token = safeSecretToken;
  }

  return telegramRequest(safeBotToken, 'setWebhook', payload);
}

export async function ensureTelegramWebhook({ botToken, publicUrl, secretToken } = {}) {
  const webhookUrl = buildTelegramWebhookUrl(publicUrl);

  if (!String(botToken ?? '').trim()) {
    return {
      ok: true,
      configured: false,
      skipped: 'missing_bot_token'
    };
  }

  if (!webhookUrl) {
    return {
      ok: true,
      configured: false,
      skipped: 'missing_public_url'
    };
  }

  const info = await getTelegramWebhookInfo({ botToken });

  if (!info.ok) {
    return {
      ok: false,
      configured: false,
      action: 'info_failed',
      error: info.description ?? 'telegram_info_failed'
    };
  }

  const currentUrl = info.result?.url ?? '';

  if (currentUrl === webhookUrl) {
    return {
      ok: true,
      configured: true,
      action: 'kept',
      url: webhookUrl,
      pendingUpdateCount: info.result?.pending_update_count ?? 0,
      lastErrorDate: info.result?.last_error_date ?? null,
      lastErrorMessage: info.result?.last_error_message ?? null
    };
  }

  const registration = await registerTelegramWebhook({ botToken, publicUrl, secretToken });

  return {
    ok: registration.ok,
    configured: Boolean(registration.ok),
    action: registration.ok ? 'registered' : 'register_failed',
    url: webhookUrl,
    previousUrl: currentUrl || null,
    error: registration.ok ? null : registration.description ?? 'telegram_register_failed'
  };
}

export function buildTelegramWebhookUrl(publicUrl) {
  const safePublicUrl = String(publicUrl ?? '').trim();

  if (!safePublicUrl) {
    return null;
  }

  try {
    return new URL('/webhook/telegram', safePublicUrl).toString();
  } catch {
    return null;
  }
}

async function telegramRequest(botToken, method, payload = {}) {
  const endpoint = `${TELEGRAM_API_BASE_URL}/bot${botToken}/${method}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(10000)
      : undefined
  });
  const result = await response.json();

  if (!response.ok) {
    return {
      ok: false,
      description: result.description ?? `Telegram request failed with status ${response.status}`,
      result
    };
  }

  return result;
}

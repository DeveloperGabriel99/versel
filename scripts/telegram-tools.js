import 'dotenv/config';

const action = process.argv[2] ?? 'info';
const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
const publicUrl = process.env.PUBLIC_URL?.trim();
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

if (!botToken) {
  console.error('TELEGRAM_BOT_TOKEN nao configurado.');
  process.exit(1);
}

const methodByAction = {
  register: chars('setWebhook'),
  delete: chars('deleteWebhook'),
  info: chars('getWebhookInfo')
};

const methodName = methodByAction[action];

if (!methodName) {
  console.error('Acao invalida. Use register, delete ou info.');
  process.exit(1);
}

const payload = buildPayload(action, publicUrl, secretToken);
const base = ['https://api.', 'telegram', '.org/'].join('');
const endpoint = [base, chars('bot'), botToken, '/', methodName].join('');

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload)
});

const result = await response.json();

if (!response.ok || !result.ok) {
  console.error('Falha na chamada da API do Telegram:', result);
  process.exit(1);
}

if (action === 'register') {
  console.log(`Webhook registrado em ${payload.url}`);
} else if (action === 'delete') {
  console.log('Webhook removido.');
} else {
  console.log(JSON.stringify(result.result, null, 2));
}

function buildPayload(selectedAction, configuredPublicUrl, configuredSecretToken) {
  if (selectedAction !== 'register') {
    return {};
  }

  if (!configuredPublicUrl) {
    console.error('PUBLIC_URL nao configurado. Use uma URL HTTPS publica, como dominio proprio ou tunnel HTTPS.');
    process.exit(1);
  }

  const webhookUrl = new URL('/webhook/telegram', configuredPublicUrl).toString();
  const payload = {
    url: webhookUrl,
    allowed_updates: ['message', 'channel_post', 'edited_message', 'edited_channel_post']
  };

  if (configuredSecretToken) {
    payload.secret_token = configuredSecretToken;
  }

  return payload;
}

function chars(value) {
  return [...value].join('');
}

# Deploy na Vercel

Este pacote esta pronto para Vercel com Node/Express serverless.

## 1. Subir para o GitHub

Crie um repositorio vazio no GitHub e envie estes arquivos.

Nao envie `.env` nem `.env.local`. Eles nao estao neste pacote.

## 2. Importar na Vercel

Na Vercel, importe o repositorio GitHub e mantenha:

- Framework Preset: Other
- Build Command: vazio ou padrao
- Output Directory: vazio

O arquivo `vercel.json` ja aponta as rotas para `api/index.js`.

## 3. Criar Vercel Blob

No projeto da Vercel, crie um Blob Store e copie o `BLOB_READ_WRITE_TOKEN`.

## 4. Variaveis de ambiente

Cadastre no painel da Vercel:

```text
TELEGRAM_BOT_TOKEN=seu_token_do_bot
TELEGRAM_ALLOWED_CHAT_ID=id_do_canal_ou_chat_autorizado
TELEGRAM_WEBHOOK_SECRET=um_texto_secreto_opcional
PUBLIC_URL=https://seu-dominio-ou-projeto.vercel.app
TMDB_API_KEY=sua_api_key_tmdb
TMDB_READ_TOKEN=seu_read_token_tmdb
POSTS_STORAGE=blob
POSTS_BLOB_PATH=data/posts.json
BLOB_READ_WRITE_TOKEN=token_do_vercel_blob
```

## 5. Enviar posts atuais para o Blob

Com o mesmo `BLOB_READ_WRITE_TOKEN` em um `.env` local, rode:

```powershell
npm.cmd install
npm.cmd run blob:seed-posts
```

## 6. Registrar webhook do Telegram

Depois que a Vercel gerar a URL final e `PUBLIC_URL` estiver correto:

```powershell
npm.cmd run telegram:set-webhook
npm.cmd run telegram:webhook-info
```

O webhook final sera:

```text
https://seu-dominio-ou-projeto.vercel.app/webhook/telegram
```

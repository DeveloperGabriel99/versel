# Blog Automatizado via Telegram

## 1. Configuracao do ambiente

Este projeto usa Node.js com Express, HTML, CSS e JavaScript simples no frontend.

```powershell
npm.cmd install
npm.cmd run dev
```

O servidor sobe em:

```text
http://localhost:3000
```

Variaveis principais no arquivo `.env`:

```text
PORT=3000
TELEGRAM_BOT_TOKEN=seu_token_do_bot
TELEGRAM_ALLOWED_CHAT_ID=id_do_canal_ou_chat_autorizado
TELEGRAM_WEBHOOK_SECRET=opcional
PUBLIC_URL=https://seu-dominio.com
TMDB_API_KEY=sua_api_key_tmdb
TMDB_READ_TOKEN=seu_read_token_tmdb
ADMIN_API_SECRET=opcional_para_rotas_internas
POSTS_STORAGE=file
POSTS_BLOB_PATH=data/posts.json
BLOB_READ_WRITE_TOKEN=necessario_na_vercel
```

Os tokens ficam fora do codigo-fonte e `.env` / `.env.local` ja estao no `.gitignore`.

## 2. Logica de integracao com Telegram

O backend recebe atualizacoes em:

```text
POST /webhook/telegram
```

Fluxo principal:

1. O Telegram envia uma atualizacao para o webhook.
2. O backend aceita `message`, `channel_post`, `edited_message` e `edited_channel_post`.
3. Se `TELEGRAM_ALLOWED_CHAT_ID` estiver configurado, mensagens de outros chats sao ignoradas.
4. O parser extrai `titulo`, `categoria` e `link`.
5. Se a mensagem tiver imagem, o backend usa `getFile` na API do Telegram. Localmente salva em `public/uploads/telegram`; na Vercel salva no Vercel Blob.
6. Ao criar ou alterar uma postagem, o backend consulta a TMDb para salvar poster, backdrop e sinopse.
7. A postagem e gravada em `data/posts.json` localmente ou no Vercel Blob em producao.
8. O frontend lista as postagens por `GET /api/posts`.

Formatos aceitos para mensagem no Telegram:

```text
Titulo: Nome do conteudo
Categoria: Trailer
Link: https://exemplo.com/video
```

Ou, de forma curta:

```text
Nome do conteudo
Trailer
https://exemplo.com/video
```

Para publicar com miniatura, envie a imagem no Telegram com a legenda no mesmo formato acima. Se nao houver imagem, o blog mostra uma miniatura textual automatica.

Arquivos centrais:

- `src/app.js`: rotas HTTP, webhook e app Express exportavel para Vercel.
- `src/server.js`: inicializacao local do servidor.
- `api/index.js`: entrada serverless usada pela Vercel.
- `src/services/telegramParser.js`: leitura de titulo, categoria e link.
- `src/services/telegramMedia.js`: download opcional da imagem do Telegram.
- `src/services/tmdbService.js`: busca server-side de capas e metadados na TMDb.
- `src/services/postsStore.js`: gravacao e listagem das postagens.
- `public/index.html`, `public/styles.css`, `public/app.js`: interface visual.

## 3. Template visual

O frontend exibe somente:

- titulo;
- categoria;
- miniatura, quando houver imagem;
- trecho da descricao, quando a TMDb retornar sinopse;
- botao `Ver mais` para abrir os detalhes salvos.

O visitante nao ve botoes de configuracao ou campos tecnicos. Ele nao hospeda, reproduz ou distribui midia; a tela funciona como catalogo informativo de atualizacoes.

Se a TMDb nao encontrar capa ou se as credenciais estiverem ausentes, o card continua usando o placeholder visual do site.

## 4. Implantacao

Para receber webhooks reais, o Telegram exige uma URL HTTPS publica. Em producao, configure `PUBLIC_URL` com o dominio do servidor.

### Vercel

O projeto ja inclui `vercel.json` e esta pronto para deploy como app Node/Express serverless.

Na Vercel, crie um Blob Store e configure estas variaveis no projeto:

```text
TELEGRAM_BOT_TOKEN=seu_token_do_bot
TELEGRAM_ALLOWED_CHAT_ID=id_do_canal_ou_chat_autorizado
TELEGRAM_WEBHOOK_SECRET=um_texto_secreto_opcional
PUBLIC_URL=https://seu-dominio.com
TMDB_API_KEY=sua_api_key_tmdb
TMDB_READ_TOKEN=seu_read_token_tmdb
POSTS_STORAGE=blob
POSTS_BLOB_PATH=data/posts.json
BLOB_READ_WRITE_TOKEN=token_do_vercel_blob
```

Depois de ter `BLOB_READ_WRITE_TOKEN` localmente, envie os posts atuais para o Blob:

```powershell
npm.cmd run blob:seed-posts
```

Se publicar pela integracao Git da Vercel, basta enviar o projeto para o GitHub e importar o repositorio na Vercel. Se usar CLI, rode:

```powershell
vercel deploy --prod
```

Depois do deploy, configure `PUBLIC_URL` com a URL final da Vercel ou com seu dominio proprio apontado para o projeto.

Depois rode:

```powershell
npm.cmd run telegram:set-webhook
```

Para remover o webhook:

```powershell
npm.cmd run telegram:delete-webhook
```

Para conferir qual webhook esta registrado:

```powershell
npm.cmd run telegram:webhook-info
```

Para buscar capas da TMDb para postagens antigas que ainda estao sem poster:

```powershell
npm.cmd run tmdb:sync-missing
```

Para forcar nova sincronizacao de todas as postagens:

```powershell
npm.cmd run tmdb:sync-all
```

Em ambiente local, use um tunnel HTTPS apontando para `http://localhost:3000`, configure `PUBLIC_URL` com a URL gerada e registre o webhook novamente.

No Telegram, adicione o bot ao canal ou grupo de origem. Para canais, o bot precisa estar como administrador para receber `channel_post`.

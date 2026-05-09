const URL_PATTERN = /(https?:\/\/[^\s]+)/i;
const SEASON_PATTERN = /\bS\d{1,3}E\d{1,3}(?:\s*-\s*E?\d{1,3})?\b/i;

const FIELD_ALIASES = {
  title: new Set(['titulo', 'title']),
  category: new Set(['categoria', 'category']),
  link: new Set(['link', 'url'])
};

const CATEGORY_ALIASES = [
  { category: 'Filmes', aliases: ['filme', 'filmes', 'movies'] },
  { category: 'Series', aliases: ['serie', 'series', 'seriado', 'seriados'] },
  { category: 'Canais', aliases: ['canal', 'canais', 'tv', 'programa de tv', 'programas de tv'] },
  { category: 'Novelas', aliases: ['novela', 'novelas'] },
  { category: 'Doramas', aliases: ['dorama', 'doramas', 'drama', 'kdrama', 'k-drama'] },
  { category: 'Animes', aliases: ['anime', 'animes', 'animacao', 'animacoes'] },
  { category: 'Realsshorts', aliases: ['realshort', 'realshorts', 'reals short', 'reals shorts', 'reels', 'shorts'] }
];

export function extractTelegramMessage(update) {
  return update?.channel_post ?? update?.message ?? update?.edited_channel_post ?? update?.edited_message ?? null;
}

export function parseTelegramPosts(message) {
  const rawText = String(message.caption ?? message.text ?? '').trim();
  const singlePost = parseSingleTelegramPost(rawText);

  if (singlePost.isValid) {
    return {
      isValid: true,
      errors: [],
      posts: [
        {
          title: singlePost.title,
          category: normalizeCategory(singlePost.category),
          link: singlePost.link,
          sourceItemKey: 'single'
        }
      ]
    };
  }

  const batchPosts = parseBatchTelegramPosts(rawText);

  if (batchPosts.length > 0) {
    return {
      isValid: true,
      errors: [],
      posts: batchPosts
    };
  }

  return {
    isValid: false,
    errors: singlePost.errors,
    posts: []
  };
}

export function parseTelegramPost(message) {
  const parsed = parseTelegramPosts(message);
  const firstPost = parsed.posts[0] ?? {};

  return {
    isValid: parsed.isValid,
    errors: parsed.errors,
    title: firstPost.title ?? '',
    category: firstPost.category ?? '',
    link: firstPost.link ?? ''
  };
}

function parseSingleTelegramPost(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const fields = {};
  const freeLines = [];

  for (const line of lines) {
    const labeledField = parseLabeledLine(line);

    if (labeledField) {
      fields[labeledField.key] = labeledField.value;
      continue;
    }

    freeLines.push(line);
  }

  const link = cleanUrl(fields.link ?? rawText.match(URL_PATTERN)?.[1]);
  const title = cleanText(fields.title ?? removeUrl(freeLines[0] ?? '', link));
  const category = normalizeCategory(cleanText(fields.category ?? removeUrl(freeLines[1] ?? '', link)));
  const errors = [];

  if (!title) {
    errors.push('title_required');
  }

  if (!link) {
    errors.push('link_required');
  }

  return {
    isValid: errors.length === 0,
    errors,
    title,
    category,
    link
  };
}

function parseBatchTelegramPosts(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean);

  const posts = [];
  let currentCategory = 'Series';

  for (const line of lines) {
    if (shouldIgnoreBatchLine(line)) {
      continue;
    }

    const cleanLine = stripLeadingSymbol(line);

    if (!cleanLine) {
      continue;
    }

    if (isCategoryLine(cleanLine)) {
      currentCategory = normalizeCategory(cleanLine);
      continue;
    }

    if (!isLikelyContentLine(cleanLine, currentCategory)) {
      continue;
    }

    const link = cleanUrl(cleanLine.match(URL_PATTERN)?.[1]);
    const title = cleanText(removeUrl(cleanLine, link));

    if (!title) {
      continue;
    }

    posts.push({
      title,
      category: currentCategory,
      link: link || null,
      sourceItemKey: `${posts.length}-${hashText(`${currentCategory}:${title}`)}`
    });
  }

  return posts;
}

function parseLabeledLine(line) {
  const match = line.match(/^([^:=\-]{2,30})\s*[:=\-]\s*(.+)$/);

  if (!match) {
    return null;
  }

  const label = normalizeLabel(match[1]);
  const key = Object.entries(FIELD_ALIASES).find(([, aliases]) => aliases.has(label))?.[0];

  if (!key) {
    return null;
  }

  return {
    key,
    value: match[2].trim()
  };
}

function normalizeLabel(label) {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingSymbol(value) {
  return value.replace(/^[^\p{L}\p{N}#@]+/u, '').trim();
}

function cleanUrl(value) {
  const url = String(value ?? '')
    .trim()
    .replace(/[).,\]]+$/, '');

  try {
    const parsedUrl = new URL(url);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return '';
    }

    return parsedUrl.toString();
  } catch {
    return '';
  }
}

function removeUrl(value, link) {
  if (!link) {
    return value;
  }

  return value.replace(link, '').replace(URL_PATTERN, '').trim();
}

function isCategoryLine(line) {
  const normalized = normalizeLabel(line);

  if (URL_PATTERN.test(line) || SEASON_PATTERN.test(line)) {
    return false;
  }

  return normalized.includes('atualizad')
    || normalized.includes('adicionad')
    || normalized.includes('lancament')
    || normalized.includes('novidade')
    || isCategoryHeader(normalized);
}

function isLikelyContentLine(line, currentCategory) {
  if (SEASON_PATTERN.test(line) || URL_PATTERN.test(line)) {
    return true;
  }

  return ['Filmes', 'Series', 'Canais', 'Novelas', 'Doramas', 'Animes', 'Realsshorts'].includes(currentCategory) && line.length > 2;
}

function shouldIgnoreBatchLine(line) {
  const normalized = normalizeLabel(stripLeadingSymbol(line));

  return normalized === 's = temporada / e = episodio';
}

function normalizeCategory(value) {
  const normalized = normalizeLabel(value);

  if (!normalized) {
    return 'Outros';
  }

  const matchedCategory = CATEGORY_ALIASES.find(({ aliases }) => {
    return aliases.some((alias) => normalized.includes(normalizeLabel(alias)));
  });

  return matchedCategory?.category ?? 'Outros';
}

function isCategoryHeader(normalizedLine) {
  if (!normalizedLine || normalizedLine.length > 52 || /\d/.test(normalizedLine) || normalizedLine.includes('(')) {
    return false;
  }

  return CATEGORY_ALIASES.some(({ aliases }) => {
    return aliases.some((alias) => {
      const normalizedAlias = normalizeLabel(alias);
      const canMatchInsideHeader = normalizedAlias.includes(' ')
        || normalizedAlias.endsWith('s')
        || ['tv', 'movies', 'reels', 'shorts'].includes(normalizedAlias);

      return normalizedLine === normalizedAlias
        || (canMatchInsideHeader && (
          normalizedLine.startsWith(`${normalizedAlias} `)
          || normalizedLine.endsWith(` ${normalizedAlias}`)
          || normalizedLine.includes(` ${normalizedAlias} `)
        ));
    });
  });
}

function hashText(value) {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash.toString(36);
}

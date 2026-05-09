const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

const TV_CATEGORIES = new Set(['series', 'novelas', 'doramas', 'animes', 'canais']);
const MOVIE_CATEGORIES = new Set(['filmes']);

const memoryCache = new Map();

export async function syncTmdbMetadata({ title, category, mediaType, tmdbId } = {}) {
  if (!hasTmdbCredentials()) {
    return null;
  }

  const parsed = parseTitle(title);
  const preferredMediaType = normalizeMediaType(mediaType) ?? inferMediaTypeFromCategory(category);
  const cacheKey = JSON.stringify({
    title: parsed.cleanTitle,
    year: parsed.year,
    preferredMediaType,
    tmdbId: tmdbId ? String(tmdbId).trim() : ''
  });

  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }

  try {
    const metadata = tmdbId
      ? await getDetailsById({ tmdbId, mediaType: preferredMediaType ?? 'movie' })
      : await searchBestMatch({
        title: parsed.cleanTitle,
        year: parsed.year,
        preferredMediaType
      });

    memoryCache.set(cacheKey, metadata);
    return metadata;
  } catch (error) {
    console.error('TMDb sync failed:', error.message);
    memoryCache.set(cacheKey, null);
    return null;
  }
}

export function parseTitle(title) {
  const rawTitle = String(title ?? '').trim();
  const yearMatch = rawTitle.match(/\b(19\d{2}|20\d{2})\b/);
  const cleanTitle = rawTitle
    .replace(/\([^)]*S\d{1,3}E[^)]*\)/gi, '')
    .replace(/\bS\d{1,3}E\d{1,3}(?:\s*-\s*E?\d{1,3})?\b/gi, '')
    .replace(/\((19\d{2}|20\d{2})\)/g, '')
    .replace(/\b(19\d{2}|20\d{2})\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    rawTitle,
    cleanTitle: cleanTitle || rawTitle,
    year: yearMatch ? Number(yearMatch[1]) : null
  };
}

export function inferMediaTypeFromCategory(category) {
  const normalized = normalizeText(category);

  if (MOVIE_CATEGORIES.has(normalized)) {
    return 'movie';
  }

  if (TV_CATEGORIES.has(normalized)) {
    return 'tv';
  }

  return null;
}

async function searchBestMatch({ title, year, preferredMediaType }) {
  if (!title) {
    return null;
  }

  const params = {
    query: title,
    language: 'pt-BR',
    include_adult: 'false',
    page: '1'
  };

  if (year) {
    params.year = String(year);
  }

  const payload = await tmdbRequest('/search/multi', params);
  const candidates = Array.isArray(payload.results)
    ? payload.results.filter((item) => ['movie', 'tv'].includes(item.media_type))
    : [];

  if (candidates.length === 0) {
    return null;
  }

  const scoredCandidates = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, { title, year, preferredMediaType })
    }))
    .sort((first, second) => second.score - first.score);

  const bestCandidate = scoredCandidates[0]?.candidate;

  if (!bestCandidate) {
    return null;
  }

  return buildMetadata(bestCandidate);
}

async function getDetailsById({ tmdbId, mediaType }) {
  const safeMediaType = normalizeMediaType(mediaType) ?? 'movie';
  const safeId = String(tmdbId ?? '').trim();

  if (!safeId || !/^\d+$/.test(safeId)) {
    return null;
  }

  const payload = await tmdbRequest(`/${safeMediaType}/${safeId}`, {
    language: 'pt-BR'
  });

  return buildMetadata({
    ...payload,
    media_type: safeMediaType
  });
}

async function tmdbRequest(endpoint, params = {}) {
  const url = new URL(`${TMDB_API_BASE_URL}${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  const headers = { accept: 'application/json' };
  const readToken = process.env.TMDB_READ_TOKEN?.trim();

  if (readToken) {
    headers.authorization = `Bearer ${readToken}`;
  } else if (process.env.TMDB_API_KEY?.trim()) {
    url.searchParams.set('api_key', process.env.TMDB_API_KEY.trim());
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`TMDb request failed with status ${response.status}`);
  }

  return response.json();
}

function scoreCandidate(candidate, { title, year, preferredMediaType }) {
  const candidateYear = getCandidateYear(candidate);
  const titles = getCandidateTitles(candidate);
  const titleScore = Math.max(...titles.map((candidateTitle) => compareTitles(title, candidateTitle)), 0);
  let score = titleScore * 100;

  if (preferredMediaType && candidate.media_type === preferredMediaType) {
    score += 40;
  } else if (preferredMediaType) {
    score -= 20;
  }

  if (year && candidateYear) {
    const distance = Math.abs(year - candidateYear);

    if (distance === 0) {
      score += 35;
    } else if (distance === 1) {
      score += 16;
    } else if (distance <= 3) {
      score += 6;
    } else {
      score -= Math.min(25, distance * 3);
    }
  }

  if (candidate.poster_path) {
    score += 8;
  }

  if (candidate.overview) {
    score += 3;
  }

  return score;
}

function buildMetadata(candidate) {
  if (!candidate?.id || !['movie', 'tv'].includes(candidate.media_type)) {
    return null;
  }

  return {
    tmdbId: candidate.id,
    mediaType: candidate.media_type,
    posterPath: candidate.poster_path ?? null,
    backdropPath: candidate.backdrop_path ?? null,
    tmdbTitle: getPrimaryTitle(candidate),
    tmdbYear: getCandidateYear(candidate),
    overview: candidate.overview ?? '',
    tmdbSyncedAt: new Date().toISOString()
  };
}

function getCandidateTitles(candidate) {
  return [
    candidate.title,
    candidate.name,
    candidate.original_title,
    candidate.original_name
  ].filter(Boolean);
}

function getPrimaryTitle(candidate) {
  return candidate.title ?? candidate.name ?? candidate.original_title ?? candidate.original_name ?? '';
}

function getCandidateYear(candidate) {
  const date = candidate.release_date ?? candidate.first_air_date ?? '';
  const match = String(date).match(/^(\d{4})/);

  return match ? Number(match[1]) : null;
}

function compareTitles(firstTitle, secondTitle) {
  const first = normalizeTitle(firstTitle);
  const second = normalizeTitle(secondTitle);

  if (!first || !second) {
    return 0;
  }

  if (first === second) {
    return 1;
  }

  if (first.includes(second) || second.includes(first)) {
    return 0.86;
  }

  const distance = levenshtein(first, second);
  return Math.max(0, 1 - distance / Math.max(first.length, second.length));
}

function normalizeTitle(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeMediaType(value) {
  const normalized = normalizeText(value);

  if (['movie', 'filme', 'filmes'].includes(normalized)) {
    return 'movie';
  }

  if (['tv', 'serie', 'series'].includes(normalized)) {
    return 'tv';
  }

  return null;
}

function hasTmdbCredentials() {
  return Boolean(process.env.TMDB_READ_TOKEN?.trim() || process.env.TMDB_API_KEY?.trim());
}

function levenshtein(first, second) {
  const matrix = Array.from({ length: first.length + 1 }, () => []);

  for (let index = 0; index <= first.length; index += 1) {
    matrix[index][0] = index;
  }

  for (let index = 0; index <= second.length; index += 1) {
    matrix[0][index] = index;
  }

  for (let row = 1; row <= first.length; row += 1) {
    for (let column = 1; column <= second.length; column += 1) {
      const substitutionCost = first[row - 1] === second[column - 1] ? 0 : 1;

      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );
    }
  }

  return matrix[first.length][second.length];
}

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

  const detailedMetadata = await getDetailsById({
    tmdbId: bestCandidate.id,
    mediaType: bestCandidate.media_type
  });

  return detailedMetadata ?? buildMetadata(bestCandidate);
}

async function getDetailsById({ tmdbId, mediaType }) {
  const safeMediaType = normalizeMediaType(mediaType) ?? 'movie';
  const safeId = String(tmdbId ?? '').trim();

  if (!safeId || !/^\d+$/.test(safeId)) {
    return null;
  }

  const payload = await tmdbRequest(`/${safeMediaType}/${safeId}`, {
    language: 'pt-BR',
    append_to_response: safeMediaType === 'movie'
      ? 'credits,videos,release_dates'
      : 'credits,videos,content_ratings',
    include_video_language: 'pt-BR,en-US,null'
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

  const response = await fetch(url, {
    headers,
    signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(5000)
      : undefined
  });

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
    releaseDate: getReleaseDate(candidate),
    genres: getGenres(candidate),
    voteAverage: getVoteAverage(candidate),
    runtimeMinutes: getRuntimeMinutes(candidate),
    seasonsCount: getSeasonsCount(candidate),
    episodesCount: getEpisodesCount(candidate),
    cast: getCast(candidate),
    trailerUrl: getTrailerUrl(candidate),
    trailerKey: getTrailer(candidate)?.key ?? null,
    certification: getCertification(candidate),
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
  const date = getReleaseDate(candidate);
  const match = String(date).match(/^(\d{4})/);

  return match ? Number(match[1]) : null;
}

function getReleaseDate(candidate) {
  return candidate.release_date ?? candidate.first_air_date ?? null;
}

function getGenres(candidate) {
  if (!Array.isArray(candidate.genres)) {
    return [];
  }

  return candidate.genres
    .map((genre) => genre?.name)
    .filter(Boolean)
    .slice(0, 5);
}

function getVoteAverage(candidate) {
  if (typeof candidate.vote_average !== 'number' || candidate.vote_average <= 0) {
    return null;
  }

  return Math.round(candidate.vote_average * 10) / 10;
}

function getRuntimeMinutes(candidate) {
  if (candidate.media_type !== 'movie' || typeof candidate.runtime !== 'number' || candidate.runtime <= 0) {
    return null;
  }

  return candidate.runtime;
}

function getSeasonsCount(candidate) {
  if (candidate.media_type !== 'tv' || typeof candidate.number_of_seasons !== 'number') {
    return null;
  }

  return candidate.number_of_seasons > 0 ? candidate.number_of_seasons : null;
}

function getEpisodesCount(candidate) {
  if (candidate.media_type !== 'tv' || typeof candidate.number_of_episodes !== 'number') {
    return null;
  }

  return candidate.number_of_episodes > 0 ? candidate.number_of_episodes : null;
}

function getCast(candidate) {
  const cast = candidate.credits?.cast;

  if (!Array.isArray(cast)) {
    return [];
  }

  return cast
    .filter((person) => person?.name)
    .sort((first, second) => (first.order ?? 999) - (second.order ?? 999))
    .slice(0, 8)
    .map((person) => ({
      name: person.name,
      character: person.character || ''
    }));
}

function getTrailerUrl(candidate) {
  const trailer = getTrailer(candidate);

  if (!trailer?.key) {
    return null;
  }

  if (trailer.site === 'YouTube') {
    return `https://www.youtube.com/watch?v=${trailer.key}`;
  }

  return null;
}

function getTrailer(candidate) {
  const videos = candidate.videos?.results;

  if (!Array.isArray(videos)) {
    return null;
  }

  return videos
    .filter((video) => video?.site === 'YouTube' && video?.key)
    .sort((first, second) => scoreTrailer(second) - scoreTrailer(first))[0] ?? null;
}

function scoreTrailer(video) {
  let score = 0;

  if (video.type === 'Trailer') score += 5;
  if (video.official) score += 3;
  if (video.iso_639_1 === 'pt') score += 2;
  if (video.iso_3166_1 === 'BR') score += 2;
  if (video.type === 'Teaser') score += 1;

  return score;
}

function getCertification(candidate) {
  if (candidate.media_type === 'movie') {
    return getMovieCertification(candidate.release_dates);
  }

  if (candidate.media_type === 'tv') {
    return getTvCertification(candidate.content_ratings);
  }

  return null;
}

function getMovieCertification(releaseDates) {
  const results = releaseDates?.results;

  if (!Array.isArray(results)) {
    return null;
  }

  return ['BR', 'US']
    .map((country) => results.find((item) => item.iso_3166_1 === country))
    .map((item) => item?.release_dates?.find((release) => release.certification)?.certification)
    .find(Boolean) ?? null;
}

function getTvCertification(contentRatings) {
  const results = contentRatings?.results;

  if (!Array.isArray(results)) {
    return null;
  }

  return ['BR', 'US']
    .map((country) => results.find((item) => item.iso_3166_1 === country)?.rating)
    .find(Boolean) ?? null;
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

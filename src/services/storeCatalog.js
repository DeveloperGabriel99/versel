import fs from 'node:fs/promises';
import path from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export async function listStoreProducts(imagesDir) {
  const [categories, prices] = await Promise.all([
    readImageCategories(imagesDir),
    readPrices(path.join(imagesDir, 'valores.txt'))
  ]);

  return categories.map((category) => ({
    ...category,
    products: category.products.map((product) => {
      const priceMatch = findPriceMatch(product.name, prices);

      return {
        ...product,
        price: priceMatch?.price ?? null,
        priceText: priceMatch?.priceText ?? 'Consultar valor'
      };
    })
  }));
}

async function readImageCategories(imagesDir) {
  const entries = await fs.readdir(imagesDir, { withFileTypes: true });
  const categories = [];

  for (const entry of entries.filter((item) => item.isDirectory())) {
    const categoryDir = path.join(imagesDir, entry.name);
    const products = await readCategoryProducts(imagesDir, categoryDir, entry.name);

    if (products.length > 0) {
      categories.push({
        id: slugify(entry.name),
        name: entry.name,
        products
      });
    }
  }

  return categories.sort((first, second) => first.name.localeCompare(second.name, 'pt-BR'));
}

async function readCategoryProducts(imagesDir, categoryDir, categoryName) {
  const entries = await fs.readdir(categoryDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => {
      const relativePath = path.relative(imagesDir, path.join(categoryDir, entry.name));
      const name = path.basename(entry.name, path.extname(entry.name));

      return {
        id: slugify(`${categoryName}-${name}`),
        name,
        category: categoryName,
        imageUrl: `/store-images/${encodePathSegments(relativePath)}`
      };
    })
    .sort((first, second) => first.name.localeCompare(second.name, 'pt-BR'));
}

async function readPrices(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');

    return raw
      .split(/\r?\n/)
      .map(parsePriceLine)
      .filter(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

function parsePriceLine(line) {
  const cleanLine = String(line ?? '').trim();

  if (!cleanLine) {
    return null;
  }

  const match = cleanLine.match(/^(.+?)(?::\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})$/);

  if (!match) {
    return null;
  }

  const name = match[1].replace(/:\s*$/, '').trim();
  const rawPrice = Number(match[2].replace(/\./g, '').replace(',', '.'));
  const price = normalizeDisplayPrice(rawPrice);

  return {
    name,
    normalizedName: normalizeForMatch(name),
    tokens: tokenize(name),
    price,
    priceText: price == null ? 'Consultar valor' : formatCurrency(price)
  };
}

function normalizeDisplayPrice(price) {
  if (!Number.isFinite(price)) {
    return null;
  }

  const cents = Math.round((price - Math.trunc(price)) * 100);

  if (cents === 90) {
    return Number(price.toFixed(2));
  }

  return Number(Math.max(0, Math.trunc(price) - 0.1).toFixed(2));
}

function formatCurrency(price) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(price);
}

function findPriceMatch(productName, prices) {
  const normalizedProduct = normalizeForMatch(productName);
  const exact = prices.find((item) => item.normalizedName === normalizedProduct);

  if (exact) {
    return exact;
  }

  const productTokens = tokenize(productName);
  let bestMatch = null;
  let bestScore = 0;

  for (const price of prices) {
    const score = scoreTokenMatch(productTokens, price.tokens);

    if (score > bestScore) {
      bestMatch = price;
      bestScore = score;
    }
  }

  return bestScore >= 0.72 ? bestMatch : null;
}

function scoreTokenMatch(productTokens, priceTokens) {
  if (productTokens.length === 0 || priceTokens.length === 0) {
    return 0;
  }

  const usedIndexes = new Set();
  let matches = 0;

  for (const productToken of productTokens) {
    const exactIndex = priceTokens.findIndex((priceToken, index) => (
      !usedIndexes.has(index) && priceToken === productToken
    ));

    if (exactIndex >= 0) {
      usedIndexes.add(exactIndex);
      matches += 1;
      continue;
    }

    const looseIndex = priceTokens.findIndex((priceToken, index) => (
      !usedIndexes.has(index) && areLooseTokenMatches(productToken, priceToken)
    ));

    if (looseIndex >= 0) {
      usedIndexes.add(looseIndex);
      matches += 0.82;
    }
  }

  return matches / Math.max(productTokens.length, priceTokens.length);
}

function areLooseTokenMatches(first, second) {
  if (first.length < 4 || second.length < 4) {
    return false;
  }

  return first.includes(second) || second.includes(first);
}

function tokenize(value) {
  return normalizeForMatch(value)
    .split(' ')
    .filter((token) => token.length > 0);
}

function normalizeForMatch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function slugify(value) {
  return normalizeForMatch(value)
    .toLowerCase()
    .replace(/\s+/g, '-')
    || 'produto';
}

function encodePathSegments(value) {
  return value
    .split(path.sep)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

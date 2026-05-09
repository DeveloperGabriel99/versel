const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

const categoryMenu = document.querySelector('#category-menu');
const dateFeed = document.querySelector('#date-feed');
const emptyState = document.querySelector('#empty-state');
const postsCount = document.querySelector('#posts-count');
const activeTitle = document.querySelector('#active-title');
const activeSummary = document.querySelector('#active-summary');
const detailsModal = document.querySelector('#details-modal');
const modalHero = document.querySelector('#modal-hero');
const modalPoster = document.querySelector('#modal-poster');
const modalCategory = document.querySelector('#modal-category');
const modalTitle = document.querySelector('#modal-title');
const modalMeta = document.querySelector('#modal-meta');
const modalOverview = document.querySelector('#modal-overview');

const CATEGORY_MENUS = [
  { id: 'todos', label: 'Todos' },
  { id: 'filmes', label: 'Filmes' },
  { id: 'series', label: 'Séries' },
  { id: 'canais', label: 'Canais' },
  { id: 'novelas', label: 'Novelas' },
  { id: 'doramas', label: 'Doramas' },
  { id: 'animes', label: 'Animes' },
  { id: 'realsshorts', label: 'Real Shorts' },
  { id: 'outros', label: 'Outros' }
];

let activeCategory = 'todos';
let latestPosts = [];

renderCategoryMenu([]);
bindModalEvents();
loadPosts();
setInterval(loadPosts, 15000);
startParticles();

async function loadPosts() {
  try {
    const response = await fetch(`/api/posts?ts=${Date.now()}`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error('Não foi possível carregar os conteúdos.');
    }

    const { posts } = await response.json();
    renderPosts(posts);
  } catch (error) {
    dateFeed.innerHTML = '';
    emptyState.hidden = false;
    emptyState.textContent = 'Não foi possível carregar os conteúdos agora.';
    postsCount.textContent = 'Indisponível';
    console.error(error);
  }
}

function renderPosts(posts) {
  latestPosts = posts.map((post) => ({
    ...post,
    category: normalizeCategory(post.category)
  }));

  renderCategoryMenu(latestPosts);
  renderActiveFeed();
}

function renderCategoryMenu(posts) {
  const counts = countByCategory(posts);
  categoryMenu.innerHTML = '';

  const fragment = document.createDocumentFragment();

  for (const category of CATEGORY_MENUS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-button';
    button.dataset.category = category.id;
    button.setAttribute('aria-pressed', String(activeCategory === category.id));

    const label = document.createElement('span');
    label.textContent = category.label;

    const count = document.createElement('strong');
    count.textContent = category.id === 'todos' ? posts.length : counts[category.id] ?? 0;

    button.append(label, count);
    button.addEventListener('click', () => {
      activeCategory = category.id;
      renderCategoryMenu(latestPosts);
      renderActiveFeed();
    });

    fragment.appendChild(button);
  }

  categoryMenu.appendChild(fragment);
}

function renderActiveFeed() {
  const filteredPosts = getFilteredPosts();
  const activeMenu = CATEGORY_MENUS.find((category) => category.id === activeCategory);

  dateFeed.innerHTML = '';
  emptyState.hidden = filteredPosts.length > 0;
  activeTitle.textContent = activeMenu?.label ?? 'Todos';
  activeSummary.textContent = `${filteredPosts.length} ${filteredPosts.length === 1 ? 'conteúdo neste menu' : 'conteúdos neste menu'}`;
  postsCount.textContent = `${latestPosts.length} ${latestPosts.length === 1 ? 'conteúdo' : 'conteúdos'}`;

  if (filteredPosts.length === 0) {
    emptyState.textContent = activeCategory === 'todos'
      ? 'Nenhum conteúdo publicado ainda.'
      : 'Nenhum conteúdo publicado neste menu ainda.';
    return;
  }

  const groups = groupPostsByDate(filteredPosts);
  const fragment = document.createDocumentFragment();

  for (const group of groups) {
    fragment.appendChild(createDateSection(group));
  }

  dateFeed.appendChild(fragment);
}

function getFilteredPosts() {
  if (activeCategory === 'todos') {
    return latestPosts;
  }

  return latestPosts.filter((post) => categoryId(post.category) === activeCategory);
}

function createDateSection(group) {
  const section = document.createElement('section');
  section.className = 'date-section';

  const header = document.createElement('header');
  header.className = 'date-header';

  const title = document.createElement('h3');
  title.textContent = group.label;

  const count = document.createElement('span');
  count.textContent = `${group.posts.length} ${group.posts.length === 1 ? 'atualização' : 'atualizações'}`;

  header.append(title, count);

  const grid = document.createElement('div');
  grid.className = 'posts-grid';

  for (const post of group.posts) {
    grid.appendChild(createPostCard(post));
  }

  section.append(header, grid);
  return section;
}

function createPostCard(post) {
  const card = document.createElement('article');
  card.className = 'post-card';

  card.appendChild(createPosterElement(post, 'card'));

  const content = document.createElement('div');
  content.className = 'post-content';

  const category = document.createElement('span');
  category.className = 'post-category';
  category.textContent = post.category;

  const title = document.createElement('h2');
  title.textContent = post.tmdbTitle || post.title;

  const description = document.createElement('p');
  description.className = 'post-description';
  description.textContent = getOverviewText(post, 128);

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const moreButton = document.createElement('button');
  moreButton.type = 'button';
  moreButton.className = 'btn-action';
  moreButton.textContent = 'Ver mais';
  moreButton.addEventListener('click', () => openPostModal(post.id));

  actions.appendChild(moreButton);
  content.append(category, title, description, actions);
  card.appendChild(content);

  return card;
}

function createPosterElement(post, mode = 'card') {
  const imageUrl = getPosterUrl(post);

  if (imageUrl) {
    const image = document.createElement('img');
    image.className = mode === 'modal' ? 'poster-image modal-poster-image' : 'poster-image';
    image.src = imageUrl;
    image.alt = post.tmdbTitle || post.title;
    image.loading = mode === 'modal' ? 'eager' : 'lazy';
    image.addEventListener('error', () => {
      image.replaceWith(createFallbackCover(post, mode));
    });
    return image;
  }

  return createFallbackCover(post, mode);
}

function createFallbackCover(post, mode = 'card') {
  const fallback = document.createElement('div');
  fallback.className = mode === 'modal' ? 'poster-fallback modal-poster-fallback' : 'poster-fallback';

  const genre = document.createElement('span');
  genre.className = 'fallback-genre';
  genre.textContent = post.category;

  const initials = document.createElement('strong');
  initials.className = 'fallback-initials';
  initials.textContent = getInitials(post.title);

  const label = document.createElement('span');
  label.className = 'fallback-label';
  label.textContent = 'StreamCode';

  fallback.append(genre, initials, label);
  return fallback;
}

function getPosterUrl(post) {
  if (post.posterPath) {
    return `${TMDB_IMAGE_BASE_URL}/w500${post.posterPath}`;
  }

  return post.thumbnailUrl || '';
}

function getBackdropUrl(post) {
  if (post.backdropPath) {
    return `${TMDB_IMAGE_BASE_URL}/w780${post.backdropPath}`;
  }

  return getPosterUrl(post);
}

function openPostModal(postId) {
  const post = latestPosts.find((item) => item.id === postId);

  if (!post) {
    return;
  }

  modalCategory.textContent = post.category;
  modalTitle.textContent = post.tmdbTitle || post.title;
  modalMeta.textContent = buildMetaText(post);
  modalOverview.textContent = getOverviewText(post, 900);
  modalHero.style.backgroundImage = getBackdropUrl(post)
    ? `linear-gradient(180deg, rgba(1, 12, 54, 0.18), rgba(1, 12, 54, 0.9)), url("${getBackdropUrl(post)}")`
    : '';
  modalPoster.innerHTML = '';
  modalPoster.appendChild(createPosterElement(post, 'modal'));
  detailsModal.hidden = false;
  document.body.classList.add('modal-open');
}

function closePostModal() {
  detailsModal.hidden = true;
  document.body.classList.remove('modal-open');
}

function bindModalEvents() {
  document.querySelectorAll('[data-close-modal]').forEach((element) => {
    element.addEventListener('click', closePostModal);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !detailsModal.hidden) {
      closePostModal();
    }
  });

}

function getOverviewText(post, maxLength) {
  const overview = String(post.overview ?? '').trim();

  if (!overview) {
    return 'Conteúdo adicionado ao servidor StreamCode.';
  }

  if (overview.length <= maxLength) {
    return overview;
  }

  return `${overview.slice(0, maxLength).replace(/\s+\S*$/, '')}...`;
}

function buildMetaText(post) {
  const parts = [
    post.tmdbYear ? String(post.tmdbYear) : '',
    post.mediaType === 'movie' ? 'Filme' : post.mediaType === 'tv' ? 'Série/TV' : ''
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' • ') : 'Conteúdo do servidor';
}

function getInitials(title) {
  const cleanTitle = removeAccents(title)
    .replace(/\([^)]*S\d{1,3}E[^)]*\)/gi, '')
    .replace(/\bS\d{1,3}E\d{1,3}(?:\s*-\s*E?\d{1,3})?\b/gi, '');
  const tokens = cleanTitle.match(/[a-z0-9]+/gi) ?? [];

  if (tokens[0]?.length >= 2) {
    return tokens[0].slice(0, 2).toUpperCase();
  }

  return tokens
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || 'SC';
}

function groupPostsByDate(posts) {
  const groups = new Map();

  for (const post of posts) {
    const date = post.publishedAt ? new Date(post.publishedAt) : new Date();
    const key = Number.isNaN(date.getTime()) ? 'sem-data' : date.toISOString().slice(0, 10);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: formatDateLabel(date),
        posts: []
      });
    }

    groups.get(key).posts.push(post);
  }

  return [...groups.values()].sort((first, second) => second.key.localeCompare(first.key));
}

function formatDateLabel(date) {
  if (Number.isNaN(date.getTime())) {
    return 'Sem data';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function countByCategory(posts) {
  return posts.reduce((counts, post) => {
    const id = categoryId(post.category);
    counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, {});
}

function normalizeCategory(value) {
  const normalized = removeAccents(value).toLowerCase();

  if (normalized.includes('filme')) return 'Filmes';
  if (normalized.includes('serie')) return 'Séries';
  if (normalized.includes('canai') || normalized.includes('canal') || normalized.includes('programa de tv')) return 'Canais';
  if (normalized.includes('novela')) return 'Novelas';
  if (normalized.includes('dorama')) return 'Doramas';
  if (normalized.includes('anime') || normalized.includes('animacao')) return 'Animes';
  if (normalized.includes('realshort') || normalized.includes('reals short') || normalized.includes('short')) return 'Real Shorts';

  return 'Outros';
}

function categoryId(value) {
  return removeAccents(normalizeCategory(value)).toLowerCase();
}

function removeAccents(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function startParticles() {
  const canvas = document.querySelector('#particles-js');

  if (!canvas) {
    return;
  }

  const context = canvas.getContext('2d');
  let particles = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    particles = Array.from({ length: Math.min(90, Math.floor((canvas.width * canvas.height) / 16000)) }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      size: Math.random() * 1.8 + 0.7
    }));
  }

  function draw() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(6, 236, 252, 0.65)';
    context.strokeStyle = 'rgba(2, 172, 249, 0.16)';

    for (const particle of particles) {
      particle.x += particle.vx;
      particle.y += particle.vy;

      if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
      if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;

      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }

    for (let firstIndex = 0; firstIndex < particles.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < particles.length; secondIndex += 1) {
        const first = particles[firstIndex];
        const second = particles[secondIndex];
        const distance = Math.hypot(first.x - second.x, first.y - second.y);

        if (distance < 125) {
          context.globalAlpha = 1 - distance / 125;
          context.beginPath();
          context.moveTo(first.x, first.y);
          context.lineTo(second.x, second.y);
          context.stroke();
        }
      }
    }

    context.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  draw();
}

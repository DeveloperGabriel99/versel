const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const STORE_WHATSAPP_NUMBER = '5511983370949';
const CART_STORAGE_KEY = 'streamcode-store-cart';

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
const modalContent = document.querySelector('.modal-content');
const viewLinks = document.querySelectorAll('[data-view-link]');
const updatesView = document.querySelector('#atualizacoes-view');
const storeView = document.querySelector('#loja-view');
const storeCategoryMenu = document.querySelector('#store-category-menu');
const storeFeed = document.querySelector('#store-feed');
const storeEmptyState = document.querySelector('#store-empty-state');
const storeCount = document.querySelector('#store-count');
const storeModal = document.querySelector('#store-modal');
const storeModalImage = document.querySelector('#store-modal-image');
const storeModalCategory = document.querySelector('#store-modal-category');
const storeModalTitle = document.querySelector('#store-modal-title');
const storeModalDescription = document.querySelector('#store-modal-description');
const storeModalPrice = document.querySelector('#store-modal-price');
const storeModalQuantity = document.querySelector('#store-modal-quantity');
const storeQuantityMinus = document.querySelector('#store-quantity-minus');
const storeQuantityPlus = document.querySelector('#store-quantity-plus');
const storeAddCartButton = document.querySelector('#store-add-cart-button');
const storeBuyNowButton = document.querySelector('#store-buy-now-button');
const storeFeedback = document.querySelector('#store-feedback');
const storeCartSummary = document.querySelector('#store-cart-summary');
const openCartButton = document.querySelector('#open-cart-button');
const cartCheckoutButton = document.querySelector('#cart-checkout-button');
const cartModal = document.querySelector('#cart-modal');
const cartItems = document.querySelector('#cart-items');
const cartModalSummary = document.querySelector('#cart-modal-summary');
const cartTotal = document.querySelector('#cart-total');
const cartFinalButton = document.querySelector('#cart-final-button');

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
let activeView = window.location.hash === '#loja' ? 'store' : 'updates';
let activeStoreCategory = 'todos';
let storeCategories = [];
let storeProducts = [];
let selectedStoreProduct = null;
let cart = readCart();

renderCategoryMenu([]);
renderStoreCategoryMenu([]);
renderActiveView();
bindViewEvents();
bindModalEvents();
bindStoreEvents();
renderCart();
loadPosts();
loadStoreProducts();
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

async function loadStoreProducts() {
  try {
    const response = await fetch(`/api/store/products?ts=${Date.now()}`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error('Não foi possível carregar os produtos.');
    }

    const { categories } = await response.json();
    storeCategories = Array.isArray(categories) ? categories : [];
    storeProducts = storeCategories.flatMap((category) => category.products ?? []);
    syncCartWithProducts();
    renderStore();
    renderCart();
  } catch (error) {
    storeFeed.innerHTML = '';
    storeEmptyState.hidden = false;
    storeEmptyState.textContent = 'Não foi possível carregar os produtos agora.';
    storeCount.textContent = 'Indisponível';
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

function renderStore() {
  renderStoreCategoryMenu(storeCategories);
  renderActiveStoreFeed();
}

function renderStoreCategoryMenu(categories) {
  if (!storeCategoryMenu) {
    return;
  }

  storeCategoryMenu.innerHTML = '';

  const fragment = document.createDocumentFragment();
  const menus = [
    { id: 'todos', name: 'Todos', count: storeProducts.length },
    ...categories.map((category) => ({
      id: category.id,
      name: category.name,
      count: category.products?.length ?? 0
    }))
  ];

  for (const category of menus) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-button';
    button.dataset.storeCategory = category.id;
    button.setAttribute('aria-pressed', String(activeStoreCategory === category.id));

    const label = document.createElement('span');
    label.textContent = category.name;

    const count = document.createElement('strong');
    count.textContent = category.count;

    button.append(label, count);
    button.addEventListener('click', () => {
      activeStoreCategory = category.id;
      renderStoreCategoryMenu(storeCategories);
      renderActiveStoreFeed();
    });

    fragment.appendChild(button);
  }

  storeCategoryMenu.appendChild(fragment);
}

function renderActiveStoreFeed() {
  if (!storeFeed) {
    return;
  }

  const filteredCategories = activeStoreCategory === 'todos'
    ? storeCategories
    : storeCategories.filter((category) => category.id === activeStoreCategory);
  const visibleProducts = filteredCategories.flatMap((category) => category.products ?? []);

  storeFeed.innerHTML = '';
  storeEmptyState.hidden = visibleProducts.length > 0;
  storeCount.textContent = `${storeProducts.length} ${storeProducts.length === 1 ? 'produto' : 'produtos'}`;

  if (visibleProducts.length === 0) {
    storeEmptyState.textContent = 'Nenhum produto cadastrado nesta categoria.';
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const category of filteredCategories) {
    if (!category.products?.length) {
      continue;
    }

    fragment.appendChild(createStoreCategorySection(category));
  }

  storeFeed.appendChild(fragment);
}

function createStoreCategorySection(category) {
  const section = document.createElement('section');
  section.className = 'store-category-section';

  const header = document.createElement('header');
  header.className = 'date-header store-category-header';

  const title = document.createElement('h3');
  title.textContent = category.name;

  const count = document.createElement('span');
  count.textContent = `${category.products.length} ${category.products.length === 1 ? 'produto' : 'produtos'}`;

  header.append(title, count);

  const grid = document.createElement('div');
  grid.className = 'store-grid';

  for (const product of category.products) {
    grid.appendChild(createStoreProductCard(product));
  }

  section.append(header, grid);
  return section;
}

function createStoreProductCard(product) {
  const card = document.createElement('article');
  card.className = 'store-product-card';

  const image = document.createElement('img');
  image.className = 'store-product-image';
  image.src = product.imageUrl;
  image.alt = product.name;
  image.loading = 'lazy';

  const content = document.createElement('div');
  content.className = 'store-product-content';

  const category = document.createElement('span');
  category.className = 'post-category';
  category.textContent = product.category;

  const title = document.createElement('h3');
  title.textContent = product.name;

  const price = document.createElement('p');
  price.className = 'store-card-price';

  const priceLabel = document.createElement('span');
  priceLabel.textContent = 'Valor';

  const priceValue = document.createElement('strong');
  priceValue.textContent = product.priceText || 'Consultar valor';

  price.append(priceLabel, priceValue);

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'btn-action';
  action.textContent = 'Ver detalhes';
  action.addEventListener('click', () => openStoreModal(product.id));

  content.append(category, title, price, action);
  card.append(image, content);
  return card;
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

  const cardMeta = document.createElement('p');
  cardMeta.className = 'post-extra-meta';
  cardMeta.textContent = buildCardMetaText(post);

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
  content.append(category, title, cardMeta, description, actions);
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
  modalContent.querySelectorAll('.modal-extra').forEach((element) => element.remove());
  modalContent.appendChild(createModalExtras(post));
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

function openStoreModal(productId) {
  const product = storeProducts.find((item) => item.id === productId);

  if (!product) {
    return;
  }

  selectedStoreProduct = product;
  storeModalImage.src = product.imageUrl;
  storeModalImage.alt = product.name;
  storeModalCategory.textContent = product.category;
  storeModalTitle.textContent = product.name;
  storeModalDescription.textContent = `Produto da categoria ${product.category}. Escolha a quantidade e finalize pelo WhatsApp.`;
  storeModalPrice.textContent = product.priceText || 'Consultar valor';
  storeModalQuantity.value = '1';
  storeFeedback.textContent = '';
  updateBuyNowLink();
  storeModal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeStoreModal() {
  storeModal.hidden = true;
  storeModalImage.removeAttribute('src');
  selectedStoreProduct = null;
  document.body.classList.remove('modal-open');
}

function openCartModal() {
  renderCartModal();
  cartModal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeCartModal() {
  cartModal.hidden = true;
  document.body.classList.remove('modal-open');
}

function bindViewEvents() {
  viewLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      const nextView = link.dataset.viewLink;

      if (!nextView) {
        return;
      }

      event.preventDefault();
      setActiveView(nextView);
    });
  });

  window.addEventListener('hashchange', () => {
    setActiveView(window.location.hash === '#loja' ? 'store' : 'updates', { updateHash: false });
  });
}

function bindStoreEvents() {
  storeQuantityMinus.addEventListener('click', () => {
    setSelectedQuantity(getSelectedQuantity() - 1);
  });

  storeQuantityPlus.addEventListener('click', () => {
    setSelectedQuantity(getSelectedQuantity() + 1);
  });

  storeModalQuantity.addEventListener('input', () => {
    setSelectedQuantity(getSelectedQuantity(), { quiet: true });
  });

  storeAddCartButton.addEventListener('click', () => {
    if (!selectedStoreProduct) {
      return;
    }

    addToCart(selectedStoreProduct, getSelectedQuantity());
    storeFeedback.textContent = 'Produto adicionado ao carrinho.';
  });

  openCartButton.addEventListener('click', openCartModal);
  cartCheckoutButton.addEventListener('click', (event) => {
    if (cart.length === 0) {
      event.preventDefault();
      openCartModal();
    }
  });
}

function setActiveView(view, options = {}) {
  activeView = view === 'store' ? 'store' : 'updates';
  renderActiveView();

  if (options.updateHash === false) {
    return;
  }

  history.replaceState(null, '', activeView === 'store' ? '#loja' : '#atualizacoes');
}

function renderActiveView() {
  updatesView.hidden = activeView !== 'updates';
  storeView.hidden = activeView !== 'store';

  viewLinks.forEach((link) => {
    const isActive = link.dataset.viewLink === activeView;
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

function bindModalEvents() {
  document.querySelectorAll('[data-close-modal]').forEach((element) => {
    element.addEventListener('click', closePostModal);
  });

  document.querySelectorAll('[data-close-store-modal]').forEach((element) => {
    element.addEventListener('click', closeStoreModal);
  });

  document.querySelectorAll('[data-close-cart-modal]').forEach((element) => {
    element.addEventListener('click', closeCartModal);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !detailsModal.hidden) {
      closePostModal();
    }

    if (event.key === 'Escape' && !storeModal.hidden) {
      closeStoreModal();
    }

    if (event.key === 'Escape' && !cartModal.hidden) {
      closeCartModal();
    }
  });

}

function getSelectedQuantity() {
  const quantity = Number(storeModalQuantity.value);

  if (!Number.isFinite(quantity)) {
    return 1;
  }

  return Math.min(99, Math.max(1, Math.floor(quantity)));
}

function setSelectedQuantity(quantity, options = {}) {
  const nextQuantity = Math.min(99, Math.max(1, Math.floor(Number(quantity) || 1)));
  storeModalQuantity.value = String(nextQuantity);
  updateBuyNowLink();

  if (!options.quiet) {
    storeFeedback.textContent = '';
  }
}

function addToCart(product, quantity) {
  const safeQuantity = Math.min(99, Math.max(1, Math.floor(Number(quantity) || 1)));
  const existing = cart.find((item) => item.id === product.id);

  if (existing) {
    existing.quantity = Math.min(99, existing.quantity + safeQuantity);
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      priceText: product.priceText,
      imageUrl: product.imageUrl,
      quantity: safeQuantity
    });
  }

  saveCart();
  renderCart();
}

function updateCartQuantity(productId, quantity) {
  const item = cart.find((cartItem) => cartItem.id === productId);

  if (!item) {
    return;
  }

  item.quantity = Math.min(99, Math.max(1, Math.floor(Number(quantity) || 1)));
  saveCart();
  renderCart();
  renderCartModal();
}

function removeCartItem(productId) {
  cart = cart.filter((item) => item.id !== productId);
  saveCart();
  renderCart();
  renderCartModal();
}

function renderCart() {
  const { quantity, total } = getCartTotals();
  const hasItems = quantity > 0;
  const summary = hasItems
    ? `${quantity} ${quantity === 1 ? 'item' : 'itens'} - ${formatStoreMoney(total)}`
    : 'Nenhum produto adicionado';

  storeCartSummary.textContent = summary;
  cartCheckoutButton.href = hasItems ? getWhatsAppUrl(buildCartMessage()) : '#';
  cartCheckoutButton.setAttribute('aria-disabled', String(!hasItems));
  openCartButton.textContent = hasItems ? `Ver carrinho (${quantity})` : 'Ver carrinho';
}

function renderCartModal() {
  cartItems.innerHTML = '';

  if (cart.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state cart-empty-state';
    empty.textContent = 'Seu carrinho está vazio.';
    cartItems.appendChild(empty);
    cartModalSummary.textContent = 'Adicione produtos da loja para finalizar pelo WhatsApp.';
    cartTotal.textContent = formatStoreMoney(0);
    cartFinalButton.href = '#';
    cartFinalButton.setAttribute('aria-disabled', 'true');
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const item of cart) {
    fragment.appendChild(createCartItemElement(item));
  }

  const { quantity, total } = getCartTotals();
  cartItems.appendChild(fragment);
  cartModalSummary.textContent = `${quantity} ${quantity === 1 ? 'item selecionado' : 'itens selecionados'}.`;
  cartTotal.textContent = formatStoreMoney(total);
  cartFinalButton.href = getWhatsAppUrl(buildCartMessage());
  cartFinalButton.setAttribute('aria-disabled', 'false');
}

function createCartItemElement(item) {
  const row = document.createElement('article');
  row.className = 'cart-item';

  const image = document.createElement('img');
  image.src = item.imageUrl;
  image.alt = item.name;
  image.loading = 'lazy';

  const content = document.createElement('div');
  content.className = 'cart-item-content';

  const category = document.createElement('span');
  category.textContent = item.category;

  const title = document.createElement('h3');
  title.textContent = item.name;

  const price = document.createElement('p');
  price.textContent = `${item.quantity} x ${item.priceText || formatStoreMoney(item.price)} = ${formatStoreMoney(getCartItemSubtotal(item))}`;

  content.append(category, title, price);

  const controls = document.createElement('div');
  controls.className = 'cart-item-controls';

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.textContent = '-';
  minus.setAttribute('aria-label', `Diminuir quantidade de ${item.name}`);
  minus.addEventListener('click', () => updateCartQuantity(item.id, item.quantity - 1));

  const quantity = document.createElement('input');
  quantity.type = 'number';
  quantity.min = '1';
  quantity.max = '99';
  quantity.value = String(item.quantity);
  quantity.addEventListener('input', () => updateCartQuantity(item.id, quantity.value));

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.textContent = '+';
  plus.setAttribute('aria-label', `Aumentar quantidade de ${item.name}`);
  plus.addEventListener('click', () => updateCartQuantity(item.id, item.quantity + 1));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'cart-remove';
  remove.textContent = 'Remover';
  remove.addEventListener('click', () => removeCartItem(item.id));

  controls.append(minus, quantity, plus, remove);
  row.append(image, content, controls);
  return row;
}

function updateBuyNowLink() {
  if (!selectedStoreProduct) {
    storeBuyNowButton.href = '#';
    return;
  }

  storeBuyNowButton.href = getWhatsAppUrl(buildProductMessage(selectedStoreProduct, getSelectedQuantity()));
}

function buildProductMessage(product, quantity) {
  const total = Number(product.price) * quantity;

  return [
    'Olá, vim pela Loja StreamCode e quero comprar este produto:',
    '',
    `Produto: ${product.name}`,
    `Categoria: ${product.category}`,
    `Quantidade: ${quantity}`,
    `Valor unitário: ${product.priceText || formatStoreMoney(product.price)}`,
    `Total: ${formatStoreMoney(total)}`
  ].join('\n');
}

function buildCartMessage() {
  const { total } = getCartTotals();
  const lines = [
    'Olá, vim pela Loja StreamCode e quero finalizar este pedido:',
    ''
  ];

  cart.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.name}`,
      `Categoria: ${item.category}`,
      `Quantidade: ${item.quantity}`,
      `Valor unitário: ${item.priceText || formatStoreMoney(item.price)}`,
      `Subtotal: ${formatStoreMoney(getCartItemSubtotal(item))}`,
      ''
    );
  });

  lines.push(`Total do pedido: ${formatStoreMoney(total)}`);
  return lines.join('\n');
}

function getWhatsAppUrl(message) {
  return `https://api.whatsapp.com/send?phone=${STORE_WHATSAPP_NUMBER}&text=${encodeURIComponent(message)}`;
}

function getCartTotals() {
  return cart.reduce((totals, item) => ({
    quantity: totals.quantity + item.quantity,
    total: totals.total + getCartItemSubtotal(item)
  }), { quantity: 0, total: 0 });
}

function getCartItemSubtotal(item) {
  const price = Number(item.price);

  if (!Number.isFinite(price)) {
    return 0;
  }

  return price * item.quantity;
}

function formatStoreMoney(value) {
  const amount = Number(value);

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number.isFinite(amount) ? amount : 0);
}

function saveCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

function readCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');

    return Array.isArray(parsed)
      ? parsed
        .filter((item) => item?.id && item?.name)
        .map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category ?? 'Produto',
          price: Number(item.price) || 0,
          priceText: item.priceText || formatStoreMoney(item.price),
          imageUrl: item.imageUrl ?? '',
          quantity: Math.min(99, Math.max(1, Math.floor(Number(item.quantity) || 1)))
        }))
      : [];
  } catch {
    return [];
  }
}

function syncCartWithProducts() {
  let changed = false;
  cart = cart
    .map((item) => {
      const product = storeProducts.find((storeProduct) => storeProduct.id === item.id);

      if (!product) {
        changed = true;
        return null;
      }

      if (
        item.name !== product.name
        || item.category !== product.category
        || item.price !== product.price
        || item.priceText !== product.priceText
        || item.imageUrl !== product.imageUrl
      ) {
        changed = true;
      }

      return {
        ...item,
        name: product.name,
        category: product.category,
        price: product.price,
        priceText: product.priceText,
        imageUrl: product.imageUrl
      };
    })
    .filter(Boolean);

  if (changed) {
    saveCart();
  }
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
    post.mediaType === 'movie' ? 'Filme' : post.mediaType === 'tv' ? 'Série/TV' : '',
    post.tmdbYear ? String(post.tmdbYear) : '',
    formatRuntime(post.runtimeMinutes),
    formatSeriesSize(post),
    formatVote(post.voteAverage)
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' • ') : 'Conteúdo do servidor';
}

function buildCardMetaText(post) {
  const parts = [
    post.tmdbYear ? String(post.tmdbYear) : '',
    Array.isArray(post.genres) ? post.genres.slice(0, 2).join(' / ') : '',
    formatVote(post.voteAverage)
  ].filter(Boolean);

  return parts.join(' • ') || 'Atualização do servidor';
}

function createModalExtras(post) {
  const wrapper = document.createElement('div');
  wrapper.className = 'modal-extra';

  const facts = [
    ['Estreia', formatDate(post.releaseDate)],
    ['Gêneros', Array.isArray(post.genres) ? post.genres.join(', ') : ''],
    ['Nota', formatVote(post.voteAverage)],
    ['Duração', formatRuntime(post.runtimeMinutes)],
    ['Temporadas', post.seasonsCount ? String(post.seasonsCount) : ''],
    ['Episódios', post.episodesCount ? String(post.episodesCount) : ''],
    ['Classificação', post.certification || '']
  ].filter(([, value]) => value);

  if (facts.length > 0) {
    const factsGrid = document.createElement('div');
    factsGrid.className = 'modal-facts';

    for (const [label, value] of facts) {
      const item = document.createElement('div');
      item.className = 'modal-fact';

      const itemLabel = document.createElement('span');
      itemLabel.textContent = label;

      const itemValue = document.createElement('strong');
      itemValue.textContent = value;

      item.append(itemLabel, itemValue);
      factsGrid.appendChild(item);
    }

    wrapper.appendChild(factsGrid);
  }

  if (Array.isArray(post.cast) && post.cast.length > 0) {
    const title = document.createElement('h3');
    title.className = 'modal-section-title';
    title.textContent = 'Elenco principal';

    const cast = document.createElement('p');
    cast.className = 'cast-list';
    cast.textContent = post.cast
      .slice(0, 8)
      .map((person) => person.character ? `${person.name} (${person.character})` : person.name)
      .join(', ');

    wrapper.append(title, cast);
  }

  if (post.trailerUrl) {
    const trailer = document.createElement('a');
    trailer.className = 'trailer-link';
    trailer.href = post.trailerUrl;
    trailer.target = '_blank';
    trailer.rel = 'noopener noreferrer';
    trailer.textContent = 'Ver trailer';
    wrapper.appendChild(trailer);
  }

  return wrapper;
}

function formatRuntime(minutes) {
  if (!minutes || Number.isNaN(Number(minutes))) {
    return '';
  }

  const totalMinutes = Number(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (!hours) {
    return `${remainingMinutes}min`;
  }

  return remainingMinutes ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
}

function formatSeriesSize(post) {
  const parts = [
    post.seasonsCount ? `${post.seasonsCount} temp.` : '',
    post.episodesCount ? `${post.episodesCount} eps.` : ''
  ].filter(Boolean);

  return parts.join(' / ');
}

function formatVote(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return '';
  }

  return `★ ${Number(value).toFixed(1)}`;
}

function formatDate(value) {
  if (!value) {
    return '';
  }

  const [year, month, day] = String(value).split('-');

  if (!year || !month || !day) {
    return String(value);
  }

  return `${day}/${month}/${year}`;
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

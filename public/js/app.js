/**
 * NOVA VOGUE | PUBLIC STOREFRONT CONTROLLER
 */

// Global State
const state = {
  settings: {},
  products: [],
  filteredProducts: [],
  currentCategory: 'Todas',
  searchQuery: '',
  sortOrder: 'featured',
  cart: [],
  selectedSizes: {}, // productId -> size
  selectedQuantities: {}, // productId -> quantity
  customImageBase64: null,
  deliveryType: 'shipping'
};

// Utilities
function formatARS(amount) {
  const num = Math.round(Number(amount) || 0);
  return '$ ' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function resolveAssetUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return '.' + url;
  return url;
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// Local Storage for Cart
function saveCartToStorage() {
  localStorage.setItem('nv_cart', JSON.stringify(state.cart));
  updateCartUI();
}

function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem('nv_cart');
    if (saved) {
      state.cart = JSON.parse(saved);
    }
  } catch {
    state.cart = [];
  }
  updateCartUI();
}

// Fetch Settings
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Error al cargar configuración');
    state.settings = await res.json();
    renderSettingsInUI();
  } catch (err) {
    console.warn('Backend API no disponible (usando configuración local de respaldo):', err);
    state.settings = {
      store_name: 'NOVA VOGUE',
      store_tagline: 'Indumentaria Urbana Masculina',
      store_location: 'Puerto Iguazú, Misiones, Argentina',
      whatsapp_number: '+54 9 3757 458920',
      instagram_handle: '@novavogue.ar',
      contact_email: 'contacto@novavogue.com.ar',
      shipping_cost: '5500',
      free_shipping_threshold: '85000',
      pickup_address: 'Av. Victoria Aguirre 480, Local 3, Puerto Iguazú, Misiones',
      pickup_hours: 'Lunes a Viernes de 17:00 a 21:00 hs | Sábados de 10:00 a 13:00 y 17:00 a 21:00 hs',
      pickup_instructions: 'Presentar documento de identidad (DNI) y el código de pedido al retirar.'
    };
    renderSettingsInUI();
  }
}

function renderSettingsInUI() {
  const s = state.settings;
  // Update WhatsApp links
  const cleanPhone = (s.whatsapp_number || '').replace(/\D/g, '');
  const waLinks = document.querySelectorAll('.dynamic-wa-link');
  waLinks.forEach(el => {
    el.href = `https://wa.me/${cleanPhone}?text=Hola%20Nova%20Vogue!%20Quiero%20hacer%20una%20consulta.`;
  });

  // Update Instagram
  const igEls = document.querySelectorAll('.dynamic-ig-text');
  igEls.forEach(el => el.textContent = s.instagram_handle || '@novavogue.ar');

  const igLinks = document.querySelectorAll('.dynamic-ig-link');
  const igHandle = (s.instagram_handle || 'novavogue.ar').replace('@', '');
  igLinks.forEach(el => el.href = `https://instagram.com/${igHandle}`);

  // Update Pickup info
  const pickupAddr = document.querySelectorAll('.dynamic-pickup-address');
  pickupAddr.forEach(el => el.textContent = s.pickup_address || '');

  const pickupHours = document.querySelectorAll('.dynamic-pickup-hours');
  pickupHours.forEach(el => el.textContent = s.pickup_hours || '');

  const pickupInst = document.querySelectorAll('.dynamic-pickup-instructions');
  pickupInst.forEach(el => el.textContent = s.pickup_instructions || '');

  // Update shipping cost label in checkout
  const shippingValEl = document.getElementById('checkout-shipping-val');
  if (shippingValEl) {
    shippingValEl.textContent = formatARS(s.shipping_cost || 5500);
  }
}

// Fetch Products
async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error('Error al obtener productos');
    state.products = await res.json();
    filterAndRenderProducts();
  } catch (err) {
    console.warn('Backend API no disponible (usando catálogo local de respaldo):', err);
    state.products = [
      { id: 1, name: 'Remera Boxy Heavyweight "Eclipse"', category: 'Remeras', price: 38000, description: 'Remera corte boxy fit en algodón peinado premium 24/1 pesado (240g). Color negro lavado carbón con estampa sutil celestial en espalda.', sizes: ['S', 'M', 'L', 'XL', 'XXL'], image_url: './assets/products/remera-eclipse.jpg', stock: 24, is_featured: 1 },
      { id: 2, name: 'Remera Oversize "Astral Void"', category: 'Remeras', price: 39500, description: 'Remera oversize en jersey de algodón pesado color blanco roto. Caída estructurada y hombros caídos.', sizes: ['M', 'L', 'XL', 'XXL'], image_url: './assets/products/remera-astral.jpg', stock: 18, is_featured: 1 },
      { id: 3, name: 'Remera Acid Wash "Orbit"', category: 'Remeras', price: 41000, description: 'Confeccionada con proceso de lavado artesanal acid wash en gris mineral.', sizes: ['S', 'M', 'L', 'XL'], image_url: './assets/products/remera-acid.jpg', stock: 12, is_featured: 1 },
      { id: 4, name: 'Remera Minimal Pocket "Punto Cero"', category: 'Remeras', price: 36000, description: 'Básico esencial de alta densidad en tono gris carbón profundo con bolsillo frontal cuadrado.', sizes: ['S', 'M', 'L', 'XL', 'XXL'], image_url: './assets/products/remera-cero.jpg', stock: 30, is_featured: 0 },
      { id: 5, name: 'Hoodie Oversize "Gravity 400g"', category: 'Hoodies y buzos', price: 68000, description: 'Buzo con capucha confeccionado en frisa invisible pesada de 400 gramos. Bolsillo canguro.', sizes: ['S', 'M', 'L', 'XL', 'XXL'], image_url: './assets/products/hoodie-gravity.jpg', stock: 15, is_featured: 1 },
      { id: 6, name: 'Buzo Crewneck "Subtropical"', category: 'Hoodies y buzos', price: 58000, description: 'Cuello redondo clásico de silueta relajada en rústico pesado color gris ceniza.', sizes: ['S', 'M', 'L', 'XL'], image_url: './assets/products/buzo-subtropical.jpg', stock: 16, is_featured: 1 },
      { id: 7, name: 'Hoodie Full Zip "Vortex"', category: 'Hoodies y buzos', price: 72000, description: 'Hoodie con cierre metálico bidireccional YKK en frisa premium gris grafito oscuro.', sizes: ['M', 'L', 'XL', 'XXL'], image_url: './assets/products/hoodie-vortex.jpg', stock: 11, is_featured: 0 },
      { id: 8, name: 'Pantalón Wide Cargo "Tactical Utility"', category: 'Pantalones', price: 64000, description: 'Pantalón cargo en gabardina esmerilada con 6 bolsillos funcionales.', sizes: ['S', 'M', 'L', 'XL'], image_url: './assets/products/pant-tactical.jpg', stock: 14, is_featured: 1 },
      { id: 9, name: 'Pantalón Relaxed Parachute "Nomad"', category: 'Pantalones', price: 59000, description: 'Silueta balloon parachute en tejido ripstop liviano estructurado.', sizes: ['S', 'M', 'L', 'XL'], image_url: './assets/products/pant-nomad.jpg', stock: 9, is_featured: 0 },
      { id: 10, name: 'Gorra Dad Cap "Nova Star" Bordada', category: 'Accesorios', price: 22000, description: 'Gorra estilo Dad Hat en sarga lavada con bordado frontal 3D del isotipo celestial.', sizes: ['Único'], image_url: './assets/products/cap-novastar.jpg', stock: 25, is_featured: 1 },
      { id: 11, name: 'Beanie Ribbed "Horizon"', category: 'Accesorios', price: 18500, description: 'Gorro tejido en ribb doble de acrílico premium hipoalergénico.', sizes: ['Único'], image_url: './assets/products/beanie-horizon.jpg', stock: 20, is_featured: 0 },
      { id: 12, name: 'Tote Bag Heavy Canvas "Iguazú Urban"', category: 'Accesorios', price: 24000, description: 'Bolso tote en lona cruda pesada de 14 oz con asas reforzadas para hombro.', sizes: ['Único'], image_url: './assets/products/tote-iguazu.jpg', stock: 19, is_featured: 1 },
      { id: 13, name: 'Prenda Personalizada Lab "Custom Piece"', category: 'Indumentaria personalizada', price: 46000, description: 'Prenda base confeccionada a medida según tus especificaciones de diseño.', sizes: ['S', 'M', 'L', 'XL', 'XXL'], image_url: './assets/custom-sample.jpg', stock: 50, is_featured: 1 }
    ];
    filterAndRenderProducts();
  }
}

function filterAndRenderProducts() {
  let list = [...state.products];

  // Filter category
  if (state.currentCategory !== 'Todas') {
    list = list.filter(p => p.category === state.currentCategory);
  }

  // Search filter
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q)));
  }

  // Sort
  if (state.sortOrder === 'price_asc') {
    list.sort((a, b) => a.price - b.price);
  } else if (state.sortOrder === 'price_desc') {
    list.sort((a, b) => b.price - a.price);
  } else if (state.sortOrder === 'name_asc') {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    list.sort((a, b) => (b.is_featured || 0) - (a.is_featured || 0));
  }

  state.filteredProducts = list;
  renderProductGrid();
}

function renderProductGrid() {
  const container = document.getElementById('products-grid');
  if (!container) return;

  if (state.filteredProducts.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
        <p style="font-size: 1.15rem; margin-bottom: 0.5rem;">No se encontraron prendas para los filtros seleccionados.</p>
        <button class="btn btn-secondary btn-sm" onclick="resetFilters()">Restablecer filtros</button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.filteredProducts.map(p => {
    const sizes = Array.isArray(p.sizes) ? p.sizes : ['S', 'M', 'L', 'XL'];
    const currentSize = state.selectedSizes[p.id] || sizes[0];
    const currentQty = state.selectedQuantities[p.id] || 1;

    return `
      <div class="product-card" data-id="${p.id}">
        <div class="product-img-wrap">
          <img src="${resolveAssetUrl(p.image_url)}" alt="${p.name}" class="product-img" loading="lazy" />
          ${p.is_featured ? `<span class="badge badge-charcoal product-badge-overlay">Destacado</span>` : ''}
        </div>
        <div class="product-info">
          <span class="product-category">${p.category}</span>
          <h3 class="product-name">${p.name}</h3>
          <p class="product-desc">${p.description || ''}</p>
          
          <div class="product-price-row">
            <span class="product-price">${formatARS(p.price)}</span>
            <span class="stock-tag">${p.stock > 0 ? `${p.stock} disponibles` : 'Sin stock'}</span>
          </div>

          <div class="form-group" style="margin-bottom: 0.85rem;">
            <label class="form-label" style="font-size: 0.7rem; margin-bottom: 0.35rem;">Talle:</label>
            <div class="size-selector">
              ${sizes.map(s => `
                <button type="button" 
                  class="size-btn ${s === currentSize ? 'selected' : ''}" 
                  onclick="selectProductSize(${p.id}, '${s}')">
                  ${s}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="product-actions">
            <div class="qty-picker">
              <button type="button" class="qty-btn" onclick="changeProductQty(${p.id}, -1)">-</button>
              <span class="qty-val" id="qty-val-${p.id}">${currentQty}</span>
              <button type="button" class="qty-btn" onclick="changeProductQty(${p.id}, 1)">+</button>
            </div>
            <button type="button" 
              class="btn btn-primary btn-full" 
              onclick="addToCart(${p.id})"
              ${p.stock <= 0 ? 'disabled' : ''}>
              ${p.stock <= 0 ? 'Agotado' : 'Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function selectProductSize(productId, size) {
  state.selectedSizes[productId] = size;
  const card = document.querySelector(`.product-card[data-id="${productId}"]`);
  if (card) {
    card.querySelectorAll('.size-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.textContent.trim() === size);
    });
  }
}

function changeProductQty(productId, delta) {
  const cur = state.selectedQuantities[productId] || 1;
  const next = Math.max(1, cur + delta);
  state.selectedQuantities[productId] = next;
  const valEl = document.getElementById(`qty-val-${productId}`);
  if (valEl) valEl.textContent = next;
}

function resetFilters() {
  state.currentCategory = 'Todas';
  state.searchQuery = '';
  state.sortOrder = 'featured';

  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === 'Todas');
  });
  const searchInput = document.getElementById('catalog-search');
  if (searchInput) searchInput.value = '';
  const sortSelect = document.getElementById('catalog-sort');
  if (sortSelect) sortSelect.value = 'featured';

  filterAndRenderProducts();
}

// Cart Functions
function addToCart(productId) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;

  const sizes = Array.isArray(prod.sizes) ? prod.sizes : ['S', 'M', 'L', 'XL'];
  const size = state.selectedSizes[productId] || sizes[0];
  const qty = state.selectedQuantities[productId] || 1;

  const existingIdx = state.cart.findIndex(item => item.id === productId && item.size === size);
  if (existingIdx > -1) {
    state.cart[existingIdx].quantity += qty;
  } else {
    state.cart.push({
      id: prod.id,
      name: prod.name,
      price: Number(prod.price),
      size: size,
      quantity: qty,
      image_url: prod.image_url
    });
  }

  saveCartToStorage();
  showToast(`"${prod.name}" (Talle ${size}) agregado al carrito.`);
  openCartDrawer();
}

function updateCartItemQty(index, delta) {
  if (!state.cart[index]) return;
  state.cart[index].quantity += delta;
  if (state.cart[index].quantity <= 0) {
    state.cart.splice(index, 1);
  }
  saveCartToStorage();
}

function removeCartItem(index) {
  if (!state.cart[index]) return;
  state.cart.splice(index, 1);
  saveCartToStorage();
}

function updateCartUI() {
  const badge = document.getElementById('cart-badge');
  const totalCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  if (badge) {
    badge.textContent = totalCount;
    badge.style.display = totalCount > 0 ? 'flex' : 'none';
  }

  const itemsContainer = document.getElementById('cart-drawer-items');
  const subtotalEl = document.getElementById('cart-drawer-subtotal');
  const totalEl = document.getElementById('cart-drawer-total');
  const btnCheckout = document.getElementById('cart-btn-checkout');

  if (!itemsContainer) return;

  if (state.cart.length === 0) {
    itemsContainer.innerHTML = `
      <div class="cart-empty">
        <svg class="cart-empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="8" cy="21" r="1"/>
          <circle cx="19" cy="21" r="1"/>
          <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>
        </svg>
        <p>Tu carrito está vacío</p>
        <span style="font-size: 0.8rem; display: block; margin-top: 0.25rem;">Explorá nuestra colección urbana y sumá tus prendas favoritas.</span>
      </div>
    `;
    if (subtotalEl) subtotalEl.textContent = '$ 0';
    if (totalEl) totalEl.textContent = '$ 0';
    if (btnCheckout) btnCheckout.disabled = true;
    return;
  }

  let subtotal = 0;
  itemsContainer.innerHTML = state.cart.map((item, idx) => {
    const itemSubtotal = item.price * item.quantity;
    subtotal += itemSubtotal;

    return `
      <div class="cart-item">
        <img src="${resolveAssetUrl(item.image_url)}" alt="${item.name}" class="cart-item-img" />
        <div class="cart-item-details">
          <div class="cart-item-header">
            <h4 class="cart-item-name">${item.name}</h4>
            <button type="button" class="cart-item-remove" onclick="removeCartItem(${idx})">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="cart-item-meta">
            <span>Talle: <strong>${item.size}</strong></span>
          </div>
          <div class="cart-item-footer">
            <div class="qty-picker" style="height: 32px;">
              <button type="button" class="qty-btn" style="width: 26px;" onclick="updateCartItemQty(${idx}, -1)">-</button>
              <span class="qty-val" style="width: 24px; font-size: 0.8rem;">${item.quantity}</span>
              <button type="button" class="qty-btn" style="width: 26px;" onclick="updateCartItemQty(${idx}, 1)">+</button>
            </div>
            <span class="cart-item-price">${formatARS(itemSubtotal)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (subtotalEl) subtotalEl.textContent = formatARS(subtotal);
  if (totalEl) totalEl.textContent = formatARS(subtotal);
  if (btnCheckout) btnCheckout.disabled = false;
}

function openCartDrawer() {
  const backdrop = document.getElementById('cart-drawer-backdrop');
  if (backdrop) backdrop.classList.add('active');
}

function closeCartDrawer() {
  const backdrop = document.getElementById('cart-drawer-backdrop');
  if (backdrop) backdrop.classList.remove('active');
}

// Checkout Modal
function openCheckoutModal() {
  if (state.cart.length === 0) return;
  closeCartDrawer();
  const modal = document.getElementById('checkout-modal');
  if (modal) {
    modal.classList.add('active');
    updateCheckoutSummary();
  }
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkout-modal');
  if (modal) modal.classList.remove('active');
}

function selectDeliveryType(type) {
  state.deliveryType = type;
  document.querySelectorAll('.delivery-card').forEach(card => {
    const isSelected = card.dataset.delivery === type;
    card.classList.toggle('selected', isSelected);
    const radio = card.querySelector('input[type="radio"]');
    if (radio) radio.checked = isSelected;
  });

  const shippingFields = document.getElementById('shipping-address-fields');
  const pickupInfo = document.getElementById('pickup-store-info');

  if (type === 'shipping') {
    if (shippingFields) shippingFields.style.display = 'block';
    if (pickupInfo) pickupInfo.style.display = 'none';
  } else {
    if (shippingFields) shippingFields.style.display = 'none';
    if (pickupInfo) pickupInfo.style.display = 'block';
  }

  updateCheckoutSummary();
}

function updateCheckoutSummary() {
  const subtotal = state.cart.reduce((sum, it) => sum + (it.price * it.quantity), 0);
  const stdShipping = Number(state.settings.shipping_cost || 5500);
  const freeThreshold = Number(state.settings.free_shipping_threshold || 85000);

  let shippingCost = 0;
  if (state.deliveryType === 'shipping') {
    if (freeThreshold > 0 && subtotal >= freeThreshold) {
      shippingCost = 0;
    } else {
      shippingCost = stdShipping;
    }
  }

  const grandTotal = subtotal + shippingCost;

  const subtotalEl = document.getElementById('checkout-subtotal');
  const shippingEl = document.getElementById('checkout-shipping-val');
  const totalEl = document.getElementById('checkout-total');

  if (subtotalEl) subtotalEl.textContent = formatARS(subtotal);
  if (shippingEl) {
    shippingEl.textContent = state.deliveryType === 'pickup' ? 'Gratis ($ 0)' : (shippingCost === 0 ? 'Gratis' : formatARS(shippingCost));
  }
  if (totalEl) totalEl.textContent = formatARS(grandTotal);
}

// Submit Checkout Order
async function submitOrder(e) {
  e.preventDefault();
  const form = document.getElementById('checkout-form');
  if (!form) return;

  const btnConfirm = document.getElementById('btn-confirm-order');
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.textContent = 'Procesando pedido...';
  }

  const customer_name = `${form.nombre.value.trim()} ${form.apellido.value.trim()}`;
  const customer_phone = form.telefono.value.trim();
  const customer_email = form.email.value.trim();

  let shipping_address = null;
  if (state.deliveryType === 'shipping') {
    shipping_address = {
      province: form.provincia.value.trim(),
      city: form.ciudad.value.trim(),
      address: form.direccion.value.trim(),
      postalCode: form.codigo_postal.value.trim(),
      notes: form.referencias.value.trim()
    };
  }

  const payload = {
    customer_name,
    customer_email,
    customer_phone,
    delivery_type: state.deliveryType,
    shipping_address,
    items: state.cart.map(it => ({
      productId: it.id,
      size: it.size,
      quantity: it.quantity
    })),
    notes: form.observaciones ? form.observaciones.value.trim() : ''
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error al procesar el pedido');

    // Clear cart
    state.cart = [];
    saveCartToStorage();

    closeCheckoutModal();
    showOrderConfirmationModal(data);
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.textContent = 'Confirmar Pedido';
    }
  }
}

function showOrderConfirmationModal(orderData) {
  const modal = document.getElementById('order-confirmation-modal');
  if (!modal) return;

  document.getElementById('confirm-order-number').textContent = orderData.orderNumber;
  document.getElementById('confirm-customer-name').textContent = orderData.customerName;
  document.getElementById('confirm-order-total').textContent = formatARS(orderData.total);
  document.getElementById('confirm-delivery-type').textContent = orderData.deliveryType === 'shipping' ? 'Envío a domicilio' : 'Retiro en local físico';

  // Format WhatsApp share text
  const cleanPhone = (state.settings.whatsapp_number || '').replace(/\D/g, '');
  const itemsText = orderData.items.map(it => `• ${it.quantity}x ${it.name} (Talle: ${it.size}) - ${formatARS(it.unitPrice * it.quantity)}`).join('%0A');
  const deliveryText = orderData.deliveryType === 'shipping' ? 'Envío a domicilio' : 'Retiro en local';
  const waMsg = `Hola Nova Vogue! Acabo de realizar el pedido *${orderData.orderNumber}* a nombre de *${orderData.customerName}*.%0A%0A*Detalle del pedido:*%0A${itemsText}%0A%0A*Modalidad:* ${deliveryText}%0A*Total:* ${formatARS(orderData.total)}%0A%0AQuedo a la espera de la confirmación. Gracias!`;

  const waBtn = document.getElementById('btn-share-whatsapp');
  if (waBtn) {
    waBtn.href = `https://wa.me/${cleanPhone}?text=${waMsg}`;
  }

  modal.classList.add('active');
}

function closeOrderConfirmationModal() {
  const modal = document.getElementById('order-confirmation-modal');
  if (modal) modal.classList.remove('active');
}

// Custom Garment Request
function setupCustomizerImageUpload() {
  const fileInput = document.getElementById('custom-file-input');
  const dropzone = document.getElementById('custom-dropzone');
  const previewWrap = document.getElementById('custom-preview-wrap');
  const previewImg = document.getElementById('custom-preview-img');
  const btnRemove = document.getElementById('btn-remove-custom-img');

  if (!fileInput || !dropzone) return;

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      alert('Por favor seleccione un archivo de imagen válido (JPG, PNG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      state.customImageBase64 = e.target.result;
      if (previewImg) previewImg.src = e.target.result;
      if (previewWrap) previewWrap.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  };

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  });

  if (btnRemove) {
    btnRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      state.customImageBase64 = null;
      fileInput.value = '';
      if (previewWrap) previewWrap.style.display = 'none';
    });
  }

  // Drag and drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
}

async function submitCustomRequest(e) {
  e.preventDefault();
  const form = document.getElementById('custom-form');
  if (!form) return;

  const btnSubmit = document.getElementById('btn-submit-custom');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Enviando solicitud...';
  }

  const payload = {
    customer_name: form.nombre.value.trim(),
    customer_phone: form.telefono.value.trim(),
    customer_email: form.email.value.trim(),
    garment_type: form.tipo_prenda.value,
    size: form.talle.value,
    color: form.color.value.trim(),
    design_description: form.descripcion.value.trim(),
    notes: form.observaciones.value.trim(),
    image_data: state.customImageBase64
  };

  try {
    const res = await fetch('/api/custom-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error al enviar solicitud');

    // Reset form
    form.reset();
    state.customImageBase64 = null;
    const previewWrap = document.getElementById('custom-preview-wrap');
    if (previewWrap) previewWrap.style.display = 'none';

    alert(`¡Solicitud enviada con éxito! Ticket de seguimiento: ${data.ticketNumber}. Nos comunicaremos por WhatsApp para coordinar el presupuesto y la confección.`);
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Enviar Solicitud de Personalización';
    }
  }
}

// Contact Form
async function submitContactForm(e) {
  e.preventDefault();
  const form = document.getElementById('contact-form');
  if (!form) return;

  const btn = document.getElementById('btn-submit-contact');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Enviando...';
  }

  const payload = {
    name: form.nombre.value.trim(),
    contact: form.contacto.value.trim(),
    subject: form.asunto.value.trim(),
    message: form.mensaje.value.trim()
  };

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error al enviar mensaje');

    form.reset();
    showToast('Mensaje enviado correctamente. ¡Gracias por contactarnos!');
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Enviar Mensaje';
    }
  }
}

// Event Listeners & Initialization
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadProducts();
  loadCartFromStorage();
  setupCustomizerImageUpload();

  // Mobile menu toggle
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const navLinks = document.getElementById('nav-links');
  if (hamburgerBtn && navLinks) {
    hamburgerBtn.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
    navLinks.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  }

  // Category filter pills
  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentCategory = btn.dataset.category;
      filterAndRenderProducts();
    });
  });

  // Search input
  const searchInput = document.getElementById('catalog-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      filterAndRenderProducts();
    });
  }

  // Sort dropdown
  const sortSelect = document.getElementById('catalog-sort');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      state.sortOrder = e.target.value;
      filterAndRenderProducts();
    });
  }

  // Cart Drawer open/close
  const cartBtn = document.getElementById('cart-btn');
  const cartDrawerClose = document.getElementById('cart-drawer-close');
  const cartBackdrop = document.getElementById('cart-drawer-backdrop');

  if (cartBtn) cartBtn.addEventListener('click', openCartDrawer);
  if (cartDrawerClose) cartDrawerClose.addEventListener('click', closeCartDrawer);
  if (cartBackdrop) {
    cartBackdrop.addEventListener('click', (e) => {
      if (e.target === cartBackdrop) closeCartDrawer();
    });
  }

  // Checkout modal triggers
  const btnCheckout = document.getElementById('cart-btn-checkout');
  const checkoutClose = document.getElementById('checkout-modal-close');
  const checkoutBackdrop = document.getElementById('checkout-modal');

  if (btnCheckout) btnCheckout.addEventListener('click', openCheckoutModal);
  if (checkoutClose) checkoutClose.addEventListener('click', closeCheckoutModal);
  if (checkoutBackdrop) {
    checkoutBackdrop.addEventListener('click', (e) => {
      if (e.target === checkoutBackdrop) closeCheckoutModal();
    });
  }

  // Delivery option selector in checkout
  document.querySelectorAll('.delivery-card').forEach(card => {
    card.addEventListener('click', () => {
      selectDeliveryType(card.dataset.delivery);
    });
  });

  // Checkout form submit
  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) checkoutForm.addEventListener('submit', submitOrder);

  // Custom garment form submit
  const customForm = document.getElementById('custom-form');
  if (customForm) customForm.addEventListener('submit', submitCustomRequest);

  // Contact form submit
  const contactForm = document.getElementById('contact-form');
  if (contactForm) contactForm.addEventListener('submit', submitContactForm);

  // Order confirmation modal close
  const orderConfirmClose = document.getElementById('order-confirmation-close');
  if (orderConfirmClose) orderConfirmClose.addEventListener('click', closeOrderConfirmationModal);
});

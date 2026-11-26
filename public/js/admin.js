/**
 * NOVA VOGUE | PRIVATE ADMINISTRATION DASHBOARD CONTROLLER
 */

// Admin State
const adminState = {
  token: localStorage.getItem('nv_admin_token') || '',
  activeTab: 'overview',
  overview: null,
  orders: [],
  products: [],
  fixedCosts: [],
  variableCosts: [],
  customRequests: [],
  settings: {},
  charts: {}
};

// Currency Formatter
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

// API Fetch Helper with Auth Header
async function fetchAdmin(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(adminState.token ? { 'Authorization': `Bearer ${adminState.token}` } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(endpoint, { ...options, headers });

  if (res.status === 401 && endpoint !== '/api/admin/login') {
    handleUnauthorized();
    throw new Error('Sesión expirada o no autorizada');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Error en la petición');
  }
  return data;
}

// Auth Handlers
function handleUnauthorized() {
  adminState.token = '';
  localStorage.removeItem('nv_admin_token');
  document.getElementById('auth-view').style.display = 'flex';
  document.getElementById('admin-shell').style.display = 'none';
}

async function checkSession() {
  if (!adminState.token) {
    handleUnauthorized();
    return;
  }

  try {
    const res = await fetchAdmin('/api/admin/check');
    if (res.authenticated) {
      document.getElementById('auth-view').style.display = 'none';
      document.getElementById('admin-shell').style.display = 'flex';
      initDashboard();
    } else {
      handleUnauthorized();
    }
  } catch {
    handleUnauthorized();
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const input = document.getElementById('login-password');
  const alertEl = document.getElementById('login-alert');
  const btn = document.getElementById('btn-login');

  const password = input.value.trim();
  if (!password) return;

  btn.disabled = true;
  btn.textContent = 'Verificando...';
  if (alertEl) alertEl.className = 'auth-alert';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Error de autenticación');
    }

    adminState.token = data.token;
    localStorage.setItem('nv_admin_token', data.token);

    document.getElementById('auth-view').style.display = 'none';
    document.getElementById('admin-shell').style.display = 'flex';
    initDashboard();
  } catch (err) {
    if (alertEl) {
      alertEl.textContent = err.message;
      alertEl.classList.add('error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar al Panel';
  }
}

async function handleLogout() {
  try {
    await fetchAdmin('/api/admin/logout', { method: 'POST' });
  } catch {}
  handleUnauthorized();
}

// Dashboard Navigation
function switchTab(tabId) {
  adminState.activeTab = tabId;

  document.querySelectorAll('.nav-item-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${tabId}`);
  });

  // Load relevant data on tab switch
  if (tabId === 'overview') loadOverview();
  else if (tabId === 'finance') loadFinanceTab();
  else if (tabId === 'orders') loadOrders();
  else if (tabId === 'products') loadProducts();
  else if (tabId === 'fixed') loadFixedCosts();
  else if (tabId === 'variable') loadVariableCosts();
  else if (tabId === 'custom') loadCustomRequests();
  else if (tabId === 'settings') loadSettingsTab();
}

// 1. OVERVIEW & CHARTS
async function loadOverview() {
  try {
    const data = await fetchAdmin('/api/admin/overview');
    adminState.overview = data;

    // Render KPIs
    const k = data.kpis;
    document.getElementById('kpi-revenue').textContent = formatARS(k.totalRevenue);
    document.getElementById('kpi-net-profit').textContent = formatARS(k.netProfit);
    document.getElementById('kpi-net-margin').textContent = `${k.netMarginPercent}%`;
    document.getElementById('kpi-orders-count').textContent = k.allOrdersCount;
    document.getElementById('kpi-ticket').textContent = formatARS(k.averageTicket);

    // Badges
    if (data.counts.pendingOrders > 0) {
      const b = document.getElementById('badge-orders-count');
      if (b) {
        b.textContent = data.counts.pendingOrders;
        b.style.display = 'inline-block';
      }
    }

    // Render Charts
    renderOverviewCharts(data);
  } catch (err) {
    console.error('Error loading overview:', err);
  }
}

function renderOverviewCharts(data) {
  if (typeof Chart === 'undefined') return;

  // Chart 1: Monthly Evolution
  const ctxMonthly = document.getElementById('chart-monthly');
  if (ctxMonthly) {
    if (adminState.charts.monthly) adminState.charts.monthly.destroy();

    const labels = data.monthlyList.map(m => m.month);
    const revenues = data.monthlyList.map(m => m.revenue);
    const directCosts = data.monthlyList.map(m => m.directCosts);
    const grossProfits = data.monthlyList.map(m => m.grossProfit);

    adminState.charts.monthly = new Chart(ctxMonthly, {
      type: 'bar',
      data: {
        labels: labels.length ? labels : ['Nov 2026'],
        datasets: [
          {
            label: 'Ingresos por Ventas',
            data: revenues.length ? revenues : [0],
            backgroundColor: '#f3f4f6',
            borderRadius: 4
          },
          {
            label: 'Costos Directos (Variables)',
            data: directCosts.length ? directCosts : [0],
            backgroundColor: '#4b5263',
            borderRadius: 4
          },
          {
            label: 'Ganancia Bruta',
            data: grossProfits.length ? grossProfits : [0],
            backgroundColor: '#22c55e',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#8b92a0', font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${formatARS(ctx.raw)}`
            }
          }
        },
        scales: {
          x: { grid: { color: '#252830' }, ticks: { color: '#8b92a0' } },
          y: {
            grid: { color: '#252830' },
            ticks: {
              color: '#8b92a0',
              callback: (val) => '$ ' + (val >= 1000 ? (val / 1000) + 'k' : val)
            }
          }
        }
      }
    });
  }

  // Chart 2: Cost Structure Donut
  const ctxCosts = document.getElementById('chart-cost-structure');
  if (ctxCosts) {
    if (adminState.charts.costs) adminState.charts.costs.destroy();

    const fixed = data.kpis.totalFixedCosts;
    const variable = data.kpis.totalDirectVariableCosts;

    adminState.charts.costs = new Chart(ctxCosts, {
      type: 'doughnut',
      data: {
        labels: ['Costos Fijos', 'Costos Variables Directos'],
        datasets: [{
          data: [fixed, variable],
          backgroundColor: ['#3b82f6', '#f59e0b'],
          borderColor: '#17191e',
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#8b92a0', font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${formatARS(ctx.raw)}`
            }
          }
        },
        cutout: '65%'
      }
    });
  }
}

// 2. FINANCIAL CALCULATOR & SIMULATOR
async function loadFinanceTab() {
  try {
    const data = await fetchAdmin('/api/admin/overview');
    const k = data.kpis;

    document.getElementById('fin-fixed-total').textContent = formatARS(k.totalFixedCosts);
    document.getElementById('fin-var-sales').textContent = formatARS(k.totalDirectVariableCosts);
    document.getElementById('fin-cost-per-unit').textContent = formatARS(k.averageCostPerUnit);
    document.getElementById('fin-revenue').textContent = formatARS(k.totalRevenue);
    document.getElementById('fin-gross-profit').textContent = formatARS(k.grossProfit);
    document.getElementById('fin-gross-margin').textContent = `${k.grossMarginPercent}%`;
    document.getElementById('fin-net-profit').textContent = formatARS(k.netProfit);
    document.getElementById('fin-net-margin').textContent = `${k.netMarginPercent}%`;

    // Break-even
    document.getElementById('fin-breakeven-units').textContent = `${k.breakEvenUnits} prendas`;
    document.getElementById('fin-breakeven-revenue').textContent = formatARS(k.breakEvenRevenue);

    // Update Simulator
    setupProfitSimulator(k);
  } catch (err) {
    console.error('Error loading finance tab:', err);
  }
}

function setupProfitSimulator(kpis) {
  const inputTarget = document.getElementById('sim-target-profit');
  const resultUnits = document.getElementById('sim-result-units');
  const resultRev = document.getElementById('sim-result-revenue');

  if (!inputTarget) return;

  const calculate = () => {
    const targetProfit = Number(inputTarget.value) || 0;
    const fixedCosts = kpis.totalFixedCosts;
    const avgPrice = kpis.averagePricePerUnit || 45000;
    const avgCost = kpis.averageCostPerUnit || 18000;
    const marginPerUnit = avgPrice - avgCost;

    if (marginPerUnit > 0) {
      const requiredUnits = Math.ceil((fixedCosts + targetProfit) / marginPerUnit);
      const requiredRevenue = requiredUnits * avgPrice;
      if (resultUnits) resultUnits.textContent = `${requiredUnits} prendas`;
      if (resultRev) resultRev.textContent = formatARS(requiredRevenue);
    }
  };

  inputTarget.removeEventListener('input', calculate);
  inputTarget.addEventListener('input', calculate);
  calculate();
}

// 3. ORDERS MANAGEMENT & INDIVIDUAL ORDER AUDIT
async function loadOrders(statusFilter = '') {
  try {
    let url = '/api/admin/orders';
    if (statusFilter && statusFilter !== 'Todos') url += `?status=${encodeURIComponent(statusFilter)}`;
    const orders = await fetchAdmin(url);
    adminState.orders = orders;
    renderOrdersTable(orders);
  } catch (err) {
    console.error('Error loading orders:', err);
  }
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;

  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 2rem;">No se encontraron pedidos.</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const itemsCount = (o.items || []).reduce((sum, it) => sum + (it.quantity || 1), 0);
    const statusClass = `status-${o.status.toLowerCase().replace(/\s+/g, '')}`;

    return `
      <tr>
        <td><strong>${o.order_number}</strong></td>
        <td>
          <div style="font-weight: 600;">${o.customer_name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${o.customer_phone}</div>
        </td>
        <td>
          <span class="badge ${o.delivery_type === 'shipping' ? 'badge-info' : 'badge-charcoal'}">
            ${o.delivery_type === 'shipping' ? 'Envío' : 'Retiro local'}
          </span>
        </td>
        <td>${itemsCount} u.</td>
        <td><strong>${formatARS(o.total)}</strong></td>
        <td>
          <span class="status-pill ${statusClass}">${o.status}</span>
        </td>
        <td>
          <div style="font-weight: 700; color: ${o.profit_gross >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
            ${formatARS(o.profit_gross)}
          </div>
        </td>
        <td>
          <div class="table-actions">
            <button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="openOrderAuditModal(${o.id})">
              Ver Desglose
            </button>
            <select class="admin-select" style="width: auto; padding: 0.35rem 0.6rem; font-size: 0.75rem;" 
              onchange="updateOrderStatus(${o.id}, this.value)">
              ${['Pendiente', 'Confirmado', 'En preparación', 'Listo para retirar', 'Enviado', 'Entregado', 'Cancelado'].map(st => `
                <option value="${st}" ${st === o.status ? 'selected' : ''}>${st}</option>
              `).join('')}
            </select>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    await fetchAdmin(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    loadOrders();
    loadOverview();
  } catch (err) {
    alert('Error al actualizar estado: ' + err.message);
  }
}

// INDIVIDUAL ORDER FINANCIAL AUDIT MODAL
async function openOrderAuditModal(orderId) {
  try {
    const data = await fetchAdmin(`/api/admin/orders/${orderId}`);
    const o = data.order;
    const f = data.financials;

    document.getElementById('audit-order-num').textContent = o.order_number;
    document.getElementById('audit-customer').textContent = `${o.customer_name} (${o.customer_phone})`;
    document.getElementById('audit-delivery').textContent = o.delivery_type === 'shipping' ? 'Envío a Domicilio' : 'Retiro en Local Físico';
    
    // Items table
    const itemsTbody = document.getElementById('audit-items-tbody');
    itemsTbody.innerHTML = (o.items || []).map(it => `
      <tr>
        <td>${it.name} (Talle: ${it.size})</td>
        <td>${it.quantity}</td>
        <td>${formatARS(it.unitPrice)}</td>
        <td>${formatARS(it.unitCost)}</td>
        <td><strong>${formatARS(it.unitPrice * it.quantity)}</strong></td>
      </tr>
    `).join('');

    // Financial breakdown
    document.getElementById('audit-inc-products').textContent = formatARS(f.income.productSales);
    document.getElementById('audit-inc-shipping').textContent = formatARS(f.income.shippingCharged);
    document.getElementById('audit-inc-total').textContent = formatARS(f.income.totalIncome);

    document.getElementById('audit-cost-prod').textContent = `- ${formatARS(f.costs.costProduction)}`;
    document.getElementById('audit-cost-pack').textContent = `- ${formatARS(f.costs.costPackaging)}`;
    document.getElementById('audit-cost-ship').textContent = `- ${formatARS(f.costs.costShippingReal)}`;
    document.getElementById('audit-cost-fee').textContent = `- ${formatARS(f.costs.costFee)}`;
    document.getElementById('audit-cost-var-total').textContent = `- ${formatARS(f.costs.totalVariable)}`;

    document.getElementById('audit-gross-profit').textContent = formatARS(f.grossProfit);
    document.getElementById('audit-gross-margin').textContent = `${f.grossMarginPercent}%`;

    document.getElementById('audit-fixed-allocated').textContent = `- ${formatARS(f.allocatedFixedCost)}`;
    document.getElementById('audit-net-profit').textContent = formatARS(f.netProfitEstimated);
    document.getElementById('audit-net-margin').textContent = `${f.netMarginPercent}%`;

    document.getElementById('order-audit-modal').classList.add('active');
  } catch (err) {
    alert('Error al abrir desglose: ' + err.message);
  }
}

function closeOrderAuditModal() {
  document.getElementById('order-audit-modal').classList.remove('active');
}

// 4. PRODUCT MANAGEMENT (CRUD)
async function loadProducts() {
  try {
    const products = await fetchAdmin('/api/admin/products');
    adminState.products = products;
    renderProductsTable(products);
  } catch (err) {
    console.error('Error loading products:', err);
  }
}

function renderProductsTable(products) {
  const tbody = document.getElementById('products-tbody');
  if (!tbody) return;

  tbody.innerHTML = products.map(p => {
    const margin = p.price - p.cost_price;
    const marginPercent = p.price > 0 ? ((margin / p.price) * 100).toFixed(1) : 0;
    const sizes = Array.isArray(p.sizes) ? p.sizes.join(', ') : p.sizes;

    return `
      <tr>
        <td style="width: 50px;">
          <img src="${resolveAssetUrl(p.image_url)}" style="width: 44px; height: 52px; object-fit: cover; border-radius: 4px;" />
        </td>
        <td>
          <div style="font-weight: 700;">${p.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${p.category}</div>
        </td>
        <td><strong>${formatARS(p.price)}</strong></td>
        <td>${formatARS(p.cost_price)}</td>
        <td>
          <span style="font-weight: 700; color: ${margin >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
            ${formatARS(margin)} (${marginPercent}%)
          </span>
        </td>
        <td>${p.stock}</td>
        <td>${p.sold_count}</td>
        <td>
          <div class="table-actions">
            <button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="openEditProductModal(${p.id})">Editar</button>
            <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="deleteProduct(${p.id})">Eliminar</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openNewProductModal() {
  const form = document.getElementById('product-form');
  form.reset();
  form.productId.value = '';
  document.getElementById('product-modal-title').textContent = 'Nuevo Producto';
  document.getElementById('prod-preview-wrap').style.display = 'none';
  document.getElementById('product-modal').classList.add('active');
}

function openEditProductModal(id) {
  const p = adminState.products.find(item => item.id === id);
  if (!p) return;

  const form = document.getElementById('product-form');
  form.productId.value = p.id;
  form.name.value = p.name;
  form.category.value = p.category;
  form.price.value = p.price;
  form.cost_price.value = p.cost_price;
  form.stock.value = p.stock;
  form.description.value = p.description || '';
  form.is_featured.checked = !!p.is_featured;

  // Sizes checkbox
  const sizes = Array.isArray(p.sizes) ? p.sizes : ['S', 'M', 'L', 'XL'];
  ['S', 'M', 'L', 'XL', 'XXL', 'Único'].forEach(sz => {
    const cb = document.getElementById(`sz-cb-${sz}`);
    if (cb) cb.checked = sizes.includes(sz);
  });

  const preview = document.getElementById('prod-preview-img');
  if (preview) {
    preview.src = resolveAssetUrl(p.image_url);
    document.getElementById('prod-preview-wrap').style.display = 'flex';
  }

  document.getElementById('product-modal-title').textContent = 'Editar Producto';
  document.getElementById('product-modal').classList.add('active');
}

function closeProductModal() {
  document.getElementById('product-modal').classList.remove('active');
}

async function saveProduct(e) {
  e.preventDefault();
  const form = document.getElementById('product-form');
  const id = form.productId.value;

  const selectedSizes = [];
  ['S', 'M', 'L', 'XL', 'XXL', 'Único'].forEach(sz => {
    const cb = document.getElementById(`sz-cb-${sz}`);
    if (cb && cb.checked) selectedSizes.push(sz);
  });

  const payload = {
    name: form.name.value.trim(),
    category: form.category.value,
    price: Number(form.price.value),
    cost_price: Number(form.cost_price.value),
    stock: parseInt(form.stock.value) || 0,
    description: form.description.value.trim(),
    sizes: selectedSizes.length ? selectedSizes : ['S', 'M', 'L', 'XL'],
    is_featured: form.is_featured.checked
  };

  if (window.uploadedProductImageBase64) {
    payload.image_data = window.uploadedProductImageBase64;
  }

  try {
    if (id) {
      await fetchAdmin(`/api/admin/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      await fetchAdmin('/api/admin/products', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    window.uploadedProductImageBase64 = null;
    closeProductModal();
    loadProducts();
    loadOverview();
  } catch (err) {
    alert('Error al guardar producto: ' + err.message);
  }
}

async function deleteProduct(id) {
  if (!confirm('¿Está seguro de eliminar este producto?')) return;
  try {
    await fetchAdmin(`/api/admin/products/${id}`, { method: 'DELETE' });
    loadProducts();
  } catch (err) {
    alert('Error al eliminar producto: ' + err.message);
  }
}

// 5. FIXED COSTS (CRUD)
async function loadFixedCosts() {
  try {
    const data = await fetchAdmin('/api/admin/fixed-costs');
    adminState.fixedCosts = data.items;
    document.getElementById('fixed-total-sum').textContent = formatARS(data.total);

    const tbody = document.getElementById('fixed-tbody');
    if (!tbody) return;

    tbody.innerHTML = data.items.map(f => `
      <tr>
        <td><strong>${f.concept}</strong></td>
        <td><span class="badge badge-charcoal">${f.category}</span></td>
        <td><strong>${formatARS(f.amount)}</strong></td>
        <td>${f.frequency}</td>
        <td>${f.notes || '-'}</td>
        <td>
          <div class="table-actions">
            <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="deleteFixedCost(${f.id})">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading fixed costs:', err);
  }
}

function openNewFixedCostModal() {
  const form = document.getElementById('fixed-cost-form');
  form.reset();
  document.getElementById('fixed-cost-modal').classList.add('active');
}

function closeFixedCostModal() {
  document.getElementById('fixed-cost-modal').classList.remove('active');
}

async function saveFixedCost(e) {
  e.preventDefault();
  const form = document.getElementById('fixed-cost-form');
  const payload = {
    concept: form.concept.value.trim(),
    category: form.category.value,
    amount: Number(form.amount.value),
    frequency: form.frequency.value,
    notes: form.notes.value.trim()
  };

  try {
    await fetchAdmin('/api/admin/fixed-costs', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    closeFixedCostModal();
    loadFixedCosts();
    loadOverview();
  } catch (err) {
    alert('Error al registrar costo fijo: ' + err.message);
  }
}

async function deleteFixedCost(id) {
  if (!confirm('¿Eliminar este costo fijo?')) return;
  try {
    await fetchAdmin(`/api/admin/fixed-costs/${id}`, { method: 'DELETE' });
    loadFixedCosts();
    loadOverview();
  } catch (err) {
    alert('Error al eliminar: ' + err.message);
  }
}

// 6. VARIABLE COSTS (CRUD)
async function loadVariableCosts() {
  try {
    const data = await fetchAdmin('/api/admin/variable-costs');
    adminState.variableCosts = data.items;
    document.getElementById('variable-total-sum').textContent = formatARS(data.total);

    const tbody = document.getElementById('variable-tbody');
    if (!tbody) return;

    tbody.innerHTML = data.items.map(v => `
      <tr>
        <td><strong>${v.concept}</strong></td>
        <td><span class="badge badge-charcoal">${v.category}</span></td>
        <td><strong>${formatARS(v.amount)}</strong></td>
        <td>${v.unit_type}</td>
        <td>${v.notes || '-'}</td>
        <td>
          <div class="table-actions">
            <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="deleteVariableCost(${v.id})">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading variable costs:', err);
  }
}

function openNewVariableCostModal() {
  const form = document.getElementById('variable-cost-form');
  form.reset();
  document.getElementById('variable-cost-modal').classList.add('active');
}

function closeVariableCostModal() {
  document.getElementById('variable-cost-modal').classList.remove('active');
}

async function saveVariableCost(e) {
  e.preventDefault();
  const form = document.getElementById('variable-cost-form');
  const payload = {
    concept: form.concept.value.trim(),
    category: form.category.value,
    amount: Number(form.amount.value),
    unit_type: form.unit_type.value,
    notes: form.notes.value.trim()
  };

  try {
    await fetchAdmin('/api/admin/variable-costs', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    closeVariableCostModal();
    loadVariableCosts();
    loadOverview();
  } catch (err) {
    alert('Error al registrar costo variable: ' + err.message);
  }
}

async function deleteVariableCost(id) {
  if (!confirm('¿Eliminar este costo variable?')) return;
  try {
    await fetchAdmin(`/api/admin/variable-costs/${id}`, { method: 'DELETE' });
    loadVariableCosts();
    loadOverview();
  } catch (err) {
    alert('Error al eliminar: ' + err.message);
  }
}

// 7. CUSTOM GARMENT REQUESTS
async function loadCustomRequests() {
  try {
    const requests = await fetchAdmin('/api/admin/custom-requests');
    adminState.customRequests = requests;

    const tbody = document.getElementById('custom-tbody');
    if (!tbody) return;

    tbody.innerHTML = requests.map(r => `
      <tr>
        <td><strong>${r.ticket_number}</strong></td>
        <td>
          <div style="font-weight: 600;">${r.customer_name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${r.customer_phone}</div>
        </td>
        <td>${r.garment_type}</td>
        <td>${r.size} / ${r.color}</td>
        <td><div style="max-width: 250px; font-size: 0.8rem;">${r.design_description}</div></td>
        <td>
          ${r.image_path ? `
            <a href="${resolveAssetUrl(r.image_path)}" target="_blank" style="display: inline-block;">
              <img src="${resolveAssetUrl(r.image_path)}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 4px; border: 1px solid var(--admin-border);" />
            </a>
          ` : '<span style="color: var(--text-dim);">-</span>'}
        </td>
        <td>
          <select class="admin-select" style="width: auto; padding: 0.35rem 0.6rem; font-size: 0.75rem;" 
            onchange="updateCustomStatus(${r.id}, this.value)">
            ${['Pendiente', 'En cotización', 'Aprobado', 'En producción', 'Completado', 'Rechazado'].map(st => `
              <option value="${st}" ${st === r.status ? 'selected' : ''}>${st}</option>
            `).join('')}
          </select>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading custom requests:', err);
  }
}

async function updateCustomStatus(reqId, status) {
  try {
    await fetchAdmin(`/api/admin/custom-requests/${reqId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// 8. SETTINGS & PASSWORD CHANGE
async function loadSettingsTab() {
  try {
    const s = await fetchAdmin('/api/admin/settings');
    adminState.settings = s;

    const form = document.getElementById('settings-form');
    if (!form) return;

    form.shipping_cost.value = s.shipping_cost || 5500;
    form.free_shipping_threshold.value = s.free_shipping_threshold || 85000;
    form.packaging_cost_default.value = s.packaging_cost_default || 850;
    form.payment_fee_percent.value = s.payment_fee_percent || 3.5;
    form.pickup_address.value = s.pickup_address || '';
    form.pickup_hours.value = s.pickup_hours || '';
    form.pickup_instructions.value = s.pickup_instructions || '';
    form.whatsapp_number.value = s.whatsapp_number || '';
    form.instagram_handle.value = s.instagram_handle || '';
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const form = document.getElementById('settings-form');
  const payload = {
    shipping_cost: form.shipping_cost.value,
    free_shipping_threshold: form.free_shipping_threshold.value,
    packaging_cost_default: form.packaging_cost_default.value,
    payment_fee_percent: form.payment_fee_percent.value,
    pickup_address: form.pickup_address.value.trim(),
    pickup_hours: form.pickup_hours.value.trim(),
    pickup_instructions: form.pickup_instructions.value.trim(),
    whatsapp_number: form.whatsapp_number.value.trim(),
    instagram_handle: form.instagram_handle.value.trim()
  };

  try {
    await fetchAdmin('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    alert('Configuración comercial actualizada correctamente.');
  } catch (err) {
    alert('Error al guardar configuración: ' + err.message);
  }
}

async function handlePasswordChange(e) {
  e.preventDefault();
  const form = document.getElementById('password-form');
  const currentPassword = form.current_password.value;
  const newPassword = form.new_password.value;
  const confirmPassword = form.confirm_password.value;

  if (newPassword !== confirmPassword) {
    alert('La nueva contraseña y su confirmación no coinciden.');
    return;
  }

  try {
    const res = await fetchAdmin('/api/admin/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    adminState.token = res.token;
    localStorage.setItem('nv_admin_token', res.token);
    form.reset();
    alert('Contraseña actualizada con éxito.');
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Image upload handling for product create/edit
function setupProductImageUpload() {
  const fileInput = document.getElementById('prod-file-input');
  const previewImg = document.getElementById('prod-preview-img');
  const previewWrap = document.getElementById('prod-preview-wrap');

  if (!fileInput) return;

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        window.uploadedProductImageBase64 = evt.target.result;
        if (previewImg) previewImg.src = evt.target.result;
        if (previewWrap) previewWrap.style.display = 'flex';
      };
      reader.readAsDataURL(file);
    }
  });
}

// Initialization
function initDashboard() {
  loadOverview();
  setupProductImageUpload();
}

document.addEventListener('DOMContentLoaded', () => {
  checkSession();

  // Login form submit
  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  // Logout button
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  // Nav buttons
  document.querySelectorAll('.nav-item-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Modals & forms
  const productForm = document.getElementById('product-form');
  if (productForm) productForm.addEventListener('submit', saveProduct);

  const fixedCostForm = document.getElementById('fixed-cost-form');
  if (fixedCostForm) fixedCostForm.addEventListener('submit', saveFixedCost);

  const variableCostForm = document.getElementById('variable-cost-form');
  if (variableCostForm) variableCostForm.addEventListener('submit', saveVariableCost);

  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) settingsForm.addEventListener('submit', saveSettings);

  const passwordForm = document.getElementById('password-form');
  if (passwordForm) passwordForm.addEventListener('submit', handlePasswordChange);

  // Filter orders by status
  const orderFilter = document.getElementById('filter-order-status');
  if (orderFilter) {
    orderFilter.addEventListener('change', (e) => {
      loadOrders(e.target.value);
    });
  }
});

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const { db } = require('./db.js');
const { loginAdmin, changeAdminPassword, destroySession, requireAdmin, extractToken } = require('./auth.js');
const { getFinancialOverview, getOrderFinancialAudit, formatARS } = require('./finance.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// Helper: send JSON response
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// Helper: send error
function sendError(res, statusCode, message) {
  sendJSON(res, statusCode, { error: true, message });
}

// Helper: parse JSON request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) { // 25MB limit (for image uploads)
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(body);
        resolve(parsed);
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Helper: save Base64 image
function saveBase64Image(dataUri, prefix = 'img') {
  if (!dataUri || typeof dataUri !== 'string') return null;
  const matches = dataUri.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    if (dataUri.startsWith('/')) return dataUri; // Already a URL
    return null;
  }

  const mime = matches[1];
  const base64Data = matches[2];
  let ext = '.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) ext = '.jpg';
  else if (mime.includes('webp')) ext = '.webp';
  else if (mime.includes('svg')) ext = '.svg';

  const filename = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
  return `/uploads/${filename}`;
}

// Helper: serve static file
function serveStatic(req, res, pathname) {
  let safePath = pathname;
  if (safePath === '/' || safePath === '') safePath = '/index.html';
  else if (safePath === '/admin' || safePath === '/admin/') safePath = '/admin.html';

  // Normalize and prevent directory traversal
  const resolvedPath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    sendError(res, 403, 'Acceso prohibido');
    return;
  }

  fs.stat(resolvedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      // If asking for a page without extension, try .html
      if (!path.extname(resolvedPath)) {
        const htmlPath = resolvedPath + '.html';
        if (fs.existsSync(htmlPath)) {
          const ext = '.html';
          res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] });
          fs.createReadStream(htmlPath).pipe(res);
          return;
        }
      }
      sendError(res, 404, 'Archivo no encontrado');
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600'
    });
    fs.createReadStream(resolvedPath).pipe(res);
  });
}

// Main HTTP request handler
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // Client IP helper
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  try {
    // ==========================================
    // PUBLIC API ENDPOINTS
    // ==========================================

    // 1. GET /api/settings - Store configuration
    if (method === 'GET' && pathname === '/api/settings') {
      const rows = db.prepare('SELECT key, value FROM settings').all();
      const settings = {};
      for (const row of rows) {
        // Do NOT expose password hash to the public API
        if (row.key !== 'admin_password_hash') {
          settings[row.key] = row.value;
        }
      }
      return sendJSON(res, 200, settings);
    }

    // 2. GET /api/products - Catalog list
    if (method === 'GET' && pathname === '/api/products') {
      const category = parsedUrl.query.category;
      const search = parsedUrl.query.search;
      const sort = parsedUrl.query.sort || 'featured';

      let sql = 'SELECT id, name, category, price, description, sizes, image_url, stock, sold_count, is_featured FROM products WHERE is_active = 1';
      const params = [];

      if (category && category !== 'Todas') {
        sql += ' AND category = ?';
        params.push(category);
      }

      if (search && search.trim()) {
        sql += ' AND (name LIKE ? OR description LIKE ?)';
        params.push(`%${search.trim()}%`, `%${search.trim()}%`);
      }

      if (sort === 'price_asc') {
        sql += ' ORDER BY price ASC';
      } else if (sort === 'price_desc') {
        sql += ' ORDER BY price DESC';
      } else if (sort === 'name_asc') {
        sql += ' ORDER BY name ASC';
      } else {
        sql += ' ORDER BY is_featured DESC, id DESC';
      }

      const products = db.prepare(sql).all(...params).map(p => ({
        ...p,
        sizes: JSON.parse(p.sizes || '[]')
      }));

      return sendJSON(res, 200, products);
    }

    // 3. GET /api/products/:id - Single product
    const productMatch = pathname.match(/^\/api\/products\/(\d+)$/);
    if (method === 'GET' && productMatch) {
      const id = productMatch[1];
      const p = db.prepare('SELECT id, name, category, price, description, sizes, image_url, stock, sold_count, is_featured FROM products WHERE id = ? AND is_active = 1').get(id);
      if (!p) return sendError(res, 404, 'Producto no encontrado');
      p.sizes = JSON.parse(p.sizes || '[]');
      return sendJSON(res, 200, p);
    }

    // 4. POST /api/orders - Customer checkout
    if (method === 'POST' && pathname === '/api/orders') {
      const body = await parseBody(req);
      const {
        customer_name,
        customer_email,
        customer_phone,
        delivery_type,
        shipping_address,
        items,
        notes
      } = body;

      if (!customer_name || !customer_phone || !items || !Array.isArray(items) || items.length === 0) {
        return sendError(res, 400, 'Datos incompletos. Debe ingresar nombre, teléfono y al menos un producto.');
      }

      if (!['shipping', 'pickup'].includes(delivery_type)) {
        return sendError(res, 400, 'Modalidad de entrega inválida.');
      }

      if (delivery_type === 'shipping') {
        if (!shipping_address || !shipping_address.address || !shipping_address.city || !shipping_address.province) {
          return sendError(res, 400, 'Debe completar los datos del domicilio para el envío.');
        }
      }

      // Calculate totals from database to prevent price tampering
      let subtotal = 0;
      let costProductionTotal = 0;
      const orderItems = [];

      for (const item of items) {
        const prod = db.prepare('SELECT id, name, price, cost_price, stock FROM products WHERE id = ? AND is_active = 1').get(item.productId || item.id);
        if (!prod) {
          return sendError(res, 400, `El producto con ID ${item.productId || item.id} no existe o no está disponible.`);
        }
        const qty = Math.max(1, parseInt(item.quantity) || 1);
        if (prod.stock < qty) {
          return sendError(res, 400, `Stock insuficiente para "${prod.name}". Stock actual: ${prod.stock}`);
        }

        const unitPrice = Number(prod.price);
        const unitCost = Number(prod.cost_price);
        subtotal += unitPrice * qty;
        costProductionTotal += unitCost * qty;

        orderItems.push({
          productId: prod.id,
          name: prod.name,
          size: item.size || 'M',
          quantity: qty,
          unitPrice,
          unitCost
        });
      }

      // Settings lookup for shipping cost, packaging, payment fee
      const getSettingVal = (key, fallback) => {
        const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return r ? r.value : fallback;
      };

      const stdShippingCost = Number(getSettingVal('shipping_cost', '5500'));
      const freeThreshold = Number(getSettingVal('free_shipping_threshold', '85000'));
      const packagingCostDefault = Number(getSettingVal('packaging_cost_default', '850'));
      const paymentFeePercent = Number(getSettingVal('payment_fee_percent', '3.5'));

      let shippingCostCharged = 0;
      let costShippingReal = 0;

      if (delivery_type === 'shipping') {
        if (freeThreshold > 0 && subtotal >= freeThreshold) {
          shippingCostCharged = 0;
        } else {
          shippingCostCharged = stdShippingCost;
        }
        costShippingReal = stdShippingCost; // What the business actually pays the courier
      }

      const total = subtotal + shippingCostCharged;
      const costPackaging = packagingCostDefault;
      const costFee = Math.round((total * paymentFeePercent) / 100);

      // Gross profit of the order
      const totalDirectCost = costProductionTotal + costPackaging + costShippingReal + costFee;
      const profitGross = total - totalDirectCost;

      // Allocate fixed cost proportionally
      const fixedMonthlyTotal = db.prepare('SELECT SUM(amount) as t FROM fixed_costs WHERE is_active = 1').get().t || 0;
      const activeOrdersCount = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status != 'Cancelado'").get().c || 0;
      const allocatedFixed = Math.round(fixedMonthlyTotal / Math.max(activeOrdersCount + 1, 1));
      const profitNetEstimated = profitGross - allocatedFixed;

      // Generate unique order number (NV-2026-XXXX)
      const orderNumber = `NV-2026-${Math.floor(1000 + Math.random() * 9000)}`;

      // Insert order into DB
      const insertStmt = db.prepare(`
        INSERT INTO orders (
          order_number, customer_name, customer_email, customer_phone, delivery_type,
          shipping_address, items, subtotal, shipping_cost_charged, total,
          cost_production_total, cost_packaging, cost_shipping_real, cost_fee,
          profit_gross, profit_net_estimated, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?)
      `);

      const resInsert = insertStmt.run(
        orderNumber,
        customer_name.trim(),
        customer_email ? customer_email.trim() : null,
        customer_phone.trim(),
        delivery_type,
        shipping_address ? JSON.stringify(shipping_address) : null,
        JSON.stringify(orderItems),
        subtotal,
        shippingCostCharged,
        total,
        costProductionTotal,
        costPackaging,
        costShippingReal,
        costFee,
        profitGross,
        profitNetEstimated,
        notes ? notes.trim() : ''
      );

      // Decrement stock and increment sold_count
      const updateStockStmt = db.prepare('UPDATE products SET stock = stock - ?, sold_count = sold_count + ? WHERE id = ?');
      for (const it of orderItems) {
        updateStockStmt.run(it.quantity, it.quantity, it.productId);
      }

      return sendJSON(res, 201, {
        success: true,
        orderId: resInsert.lastInsertRowid,
        orderNumber,
        customerName: customer_name,
        total,
        subtotal,
        shippingCostCharged,
        deliveryType: delivery_type,
        items: orderItems,
        message: 'Pedido confirmado con éxito.'
      });
    }

    // 5. POST /api/custom-requests - Custom garment request
    if (method === 'POST' && pathname === '/api/custom-requests') {
      const body = await parseBody(req);
      const {
        customer_name,
        customer_phone,
        customer_email,
        garment_type,
        size,
        color,
        design_description,
        notes,
        image_data
      } = body;

      if (!customer_name || !customer_phone || !garment_type || !size || !color || !design_description) {
        return sendError(res, 400, 'Todos los campos principales del diseño son requeridos.');
      }

      let imagePath = null;
      if (image_data) {
        imagePath = saveBase64Image(image_data, 'custom');
      }

      const ticketNumber = `NV-CUST-${Math.floor(100 + Math.random() * 900)}`;

      db.prepare(`
        INSERT INTO custom_requests (
          ticket_number, customer_name, customer_phone, customer_email,
          garment_type, size, color, design_description, notes, image_path, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente')
      `).run(
        ticketNumber,
        customer_name.trim(),
        customer_phone.trim(),
        customer_email ? customer_email.trim() : null,
        garment_type,
        size,
        color,
        design_description.trim(),
        notes ? notes.trim() : null,
        imagePath
      );

      return sendJSON(res, 201, {
        success: true,
        ticketNumber,
        message: 'Solicitud de personalización enviada con éxito. Te contactaremos por WhatsApp con el presupuesto.'
      });
    }

    // 6. POST /api/contact - Contact message
    if (method === 'POST' && pathname === '/api/contact') {
      const body = await parseBody(req);
      const { name, contact, subject, message } = body;

      if (!name || !contact || !message) {
        return sendError(res, 400, 'Nombre, contacto y mensaje son obligatorios.');
      }

      db.prepare(`
        INSERT INTO contact_messages (name, contact, subject, message)
        VALUES (?, ?, ?, ?)
      `).run(name.trim(), contact.trim(), subject ? subject.trim() : 'Consulta Web', message.trim());

      return sendJSON(res, 201, {
        success: true,
        message: 'Mensaje recibido correctamente. Nos comunicaremos a la brevedad.'
      });
    }

    // ==========================================
    // ADMIN AUTHENTICATION
    // ==========================================

    // POST /api/admin/login
    if (method === 'POST' && pathname === '/api/admin/login') {
      const body = await parseBody(req);
      const { password } = body;
      if (!password) {
        return sendError(res, 400, 'Debe ingresar la contraseña.');
      }

      const result = loginAdmin(password, clientIp);
      if (!result.success) {
        return sendError(res, result.status || 401, result.message);
      }

      return sendJSON(res, 200, {
        success: true,
        token: result.token,
        message: result.message
      });
    }

    // POST /api/admin/logout
    if (method === 'POST' && pathname === '/api/admin/logout') {
      const token = extractToken(req);
      destroySession(token);
      return sendJSON(res, 200, { success: true, message: 'Sesión cerrada correctamente.' });
    }

    // GET /api/admin/check
    if (method === 'GET' && pathname === '/api/admin/check') {
      const isValid = requireAdmin(req);
      return sendJSON(res, 200, { authenticated: isValid });
    }

    // ==========================================
    // PROTECTED ADMIN ENDPOINTS
    // ==========================================
    if (pathname.startsWith('/api/admin/')) {
      if (!requireAdmin(req)) {
        return sendError(res, 401, 'No autorizado. Debe iniciar sesión en el panel.');
      }

      // POST /api/admin/change-password
      if (method === 'POST' && pathname === '/api/admin/change-password') {
        const body = await parseBody(req);
        const { currentPassword, newPassword } = body;
        const result = changeAdminPassword(currentPassword, newPassword);
        if (!result.success) {
          return sendError(res, result.status, result.message);
        }
        return sendJSON(res, 200, result);
      }

      // GET /api/admin/overview
      if (method === 'GET' && pathname === '/api/admin/overview') {
        const overview = getFinancialOverview();
        const pendingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'Pendiente'").get().c;
        const pendingCustom = db.prepare("SELECT COUNT(*) as c FROM custom_requests WHERE status = 'Pendiente'").get().c;
        const lowStockCount = db.prepare('SELECT COUNT(*) as c FROM products WHERE stock <= 5 AND is_active = 1').get().c;

        return sendJSON(res, 200, {
          ...overview,
          counts: {
            pendingOrders,
            pendingCustom,
            lowStockCount
          }
        });
      }

      // GET /api/admin/orders
      if (method === 'GET' && pathname === '/api/admin/orders') {
        const status = parsedUrl.query.status;
        let sql = 'SELECT * FROM orders';
        const params = [];
        if (status && status !== 'Todos') {
          sql += ' WHERE status = ?';
          params.push(status);
        }
        sql += ' ORDER BY id DESC';
        const orders = db.prepare(sql).all(...params).map(o => ({
          ...o,
          items: JSON.parse(o.items || '[]'),
          shipping_address: o.shipping_address ? JSON.parse(o.shipping_address) : null
        }));
        return sendJSON(res, 200, orders);
      }

      // GET /api/admin/orders/:id
      const orderDetailMatch = pathname.match(/^\/api\/admin\/orders\/(\d+)$/);
      if (method === 'GET' && orderDetailMatch) {
        const orderId = orderDetailMatch[1];
        const audit = getOrderFinancialAudit(orderId);
        if (!audit) return sendError(res, 404, 'Pedido no encontrado');
        return sendJSON(res, 200, audit);
      }

      // PATCH /api/admin/orders/:id/status
      const orderStatusMatch = pathname.match(/^\/api\/admin\/orders\/(\d+)\/status$/);
      if (method === 'PATCH' && orderStatusMatch) {
        const orderId = orderStatusMatch[1];
        const body = await parseBody(req);
        const { status } = body;
        const validStatuses = ['Pendiente', 'Confirmado', 'En preparación', 'Listo para retirar', 'Enviado', 'Entregado', 'Cancelado'];
        if (!validStatuses.includes(status)) {
          return sendError(res, 400, 'Estado inválido.');
        }

        db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, orderId);
        return sendJSON(res, 200, { success: true, message: `Estado actualizado a "${status}".` });
      }

      // GET /api/admin/products
      if (method === 'GET' && pathname === '/api/admin/products') {
        const products = db.prepare('SELECT * FROM products ORDER BY id DESC').all().map(p => ({
          ...p,
          sizes: JSON.parse(p.sizes || '[]')
        }));
        return sendJSON(res, 200, products);
      }

      // POST /api/admin/products
      if (method === 'POST' && pathname === '/api/admin/products') {
        const body = await parseBody(req);
        const {
          name, category, price, cost_price, description, sizes, image_url, image_data, stock, is_featured
        } = body;

        if (!name || !category || price === undefined) {
          return sendError(res, 400, 'Nombre, categoría y precio son obligatorios.');
        }

        let finalImageUrl = image_url || '/assets/products/remera-eclipse.jpg';
        if (image_data) {
          finalImageUrl = saveBase64Image(image_data, 'prod');
        }

        const sizesJson = Array.isArray(sizes) ? JSON.stringify(sizes) : JSON.stringify(['S', 'M', 'L', 'XL']);

        const stmt = db.prepare(`
          INSERT INTO products (name, category, price, cost_price, description, sizes, image_url, stock, is_featured, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `);

        const result = stmt.run(
          name.trim(),
          category,
          Number(price),
          Number(cost_price || 0),
          description ? description.trim() : '',
          sizesJson,
          finalImageUrl,
          parseInt(stock) || 0,
          is_featured ? 1 : 0
        );

        return sendJSON(res, 201, { success: true, id: result.lastInsertRowid, message: 'Producto creado exitosamente.' });
      }

      // PUT /api/admin/products/:id
      const prodUpdateMatch = pathname.match(/^\/api\/admin\/products\/(\d+)$/);
      if (method === 'PUT' && prodUpdateMatch) {
        const prodId = prodUpdateMatch[1];
        const body = await parseBody(req);
        const {
          name, category, price, cost_price, description, sizes, image_url, image_data, stock, is_featured, is_active
        } = body;

        let finalImageUrl = image_url;
        if (image_data) {
          finalImageUrl = saveBase64Image(image_data, 'prod');
        }

        const sizesJson = Array.isArray(sizes) ? JSON.stringify(sizes) : JSON.stringify(['S', 'M', 'L', 'XL']);

        db.prepare(`
          UPDATE products SET
            name = ?, category = ?, price = ?, cost_price = ?,
            description = ?, sizes = ?, image_url = COALESCE(?, image_url),
            stock = ?, is_featured = ?, is_active = ?
          WHERE id = ?
        `).run(
          name.trim(),
          category,
          Number(price),
          Number(cost_price || 0),
          description ? description.trim() : '',
          sizesJson,
          finalImageUrl || null,
          parseInt(stock) || 0,
          is_featured ? 1 : 0,
          is_active !== undefined ? (is_active ? 1 : 0) : 1,
          prodId
        );

        return sendJSON(res, 200, { success: true, message: 'Producto actualizado.' });
      }

      // DELETE /api/admin/products/:id
      if (method === 'DELETE' && prodUpdateMatch) {
        const prodId = prodUpdateMatch[1];
        db.prepare('DELETE FROM products WHERE id = ?').run(prodId);
        return sendJSON(res, 200, { success: true, message: 'Producto eliminado.' });
      }

      // GET /api/admin/fixed-costs
      if (method === 'GET' && pathname === '/api/admin/fixed-costs') {
        const rows = db.prepare('SELECT * FROM fixed_costs ORDER BY id DESC').all();
        const total = rows.filter(r => r.is_active).reduce((sum, r) => sum + Number(r.amount), 0);
        return sendJSON(res, 200, { items: rows, total });
      }

      // POST /api/admin/fixed-costs
      if (method === 'POST' && pathname === '/api/admin/fixed-costs') {
        const body = await parseBody(req);
        const { concept, category, amount, frequency, notes } = body;
        if (!concept || !category || amount === undefined) {
          return sendError(res, 400, 'Concepto, categoría y monto son requeridos.');
        }

        const resCost = db.prepare(`
          INSERT INTO fixed_costs (concept, category, amount, frequency, notes, is_active)
          VALUES (?, ?, ?, ?, ?, 1)
        `).run(concept.trim(), category, Number(amount), frequency || 'Mensual', notes || null);

        return sendJSON(res, 201, { success: true, id: resCost.lastInsertRowid, message: 'Costo fijo registrado.' });
      }

      // PUT /api/admin/fixed-costs/:id
      const fixedUpdateMatch = pathname.match(/^\/api\/admin\/fixed-costs\/(\d+)$/);
      if (method === 'PUT' && fixedUpdateMatch) {
        const costId = fixedUpdateMatch[1];
        const body = await parseBody(req);
        const { concept, category, amount, frequency, notes, is_active } = body;

        db.prepare(`
          UPDATE fixed_costs SET
            concept = ?, category = ?, amount = ?, frequency = ?,
            notes = ?, is_active = ?
          WHERE id = ?
        `).run(
          concept.trim(),
          category,
          Number(amount),
          frequency || 'Mensual',
          notes || null,
          is_active !== undefined ? (is_active ? 1 : 0) : 1,
          costId
        );

        return sendJSON(res, 200, { success: true, message: 'Costo fijo actualizado.' });
      }

      // DELETE /api/admin/fixed-costs/:id
      if (method === 'DELETE' && fixedUpdateMatch) {
        const costId = fixedUpdateMatch[1];
        db.prepare('DELETE FROM fixed_costs WHERE id = ?').run(costId);
        return sendJSON(res, 200, { success: true, message: 'Costo fijo eliminado.' });
      }

      // GET /api/admin/variable-costs
      if (method === 'GET' && pathname === '/api/admin/variable-costs') {
        const rows = db.prepare(`
          SELECT vc.*, p.name as product_name
          FROM variable_costs vc
          LEFT JOIN products p ON vc.product_id = p.id
          ORDER BY vc.id DESC
        `).all();
        const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);
        return sendJSON(res, 200, { items: rows, total });
      }

      // POST /api/admin/variable-costs
      if (method === 'POST' && pathname === '/api/admin/variable-costs') {
        const body = await parseBody(req);
        const { concept, category, amount, unit_type, product_id, order_id, notes } = body;
        if (!concept || !category || amount === undefined) {
          return sendError(res, 400, 'Concepto, categoría y monto son requeridos.');
        }

        const resVar = db.prepare(`
          INSERT INTO variable_costs (concept, category, amount, unit_type, product_id, order_id, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(concept.trim(), category, Number(amount), unit_type || 'Por unidad producida', product_id || null, order_id || null, notes || null);

        return sendJSON(res, 201, { success: true, id: resVar.lastInsertRowid, message: 'Costo variable registrado.' });
      }

      // PUT /api/admin/variable-costs/:id
      const varUpdateMatch = pathname.match(/^\/api\/admin\/variable-costs\/(\d+)$/);
      if (method === 'PUT' && varUpdateMatch) {
        const costId = varUpdateMatch[1];
        const body = await parseBody(req);
        const { concept, category, amount, unit_type, product_id, order_id, notes } = body;

        db.prepare(`
          UPDATE variable_costs SET
            concept = ?, category = ?, amount = ?, unit_type = ?,
            product_id = ?, order_id = ?, notes = ?
          WHERE id = ?
        `).run(concept.trim(), category, Number(amount), unit_type, product_id || null, order_id || null, notes || null, costId);

        return sendJSON(res, 200, { success: true, message: 'Costo variable actualizado.' });
      }

      // DELETE /api/admin/variable-costs/:id
      if (method === 'DELETE' && varUpdateMatch) {
        const costId = varUpdateMatch[1];
        db.prepare('DELETE FROM variable_costs WHERE id = ?').run(costId);
        return sendJSON(res, 200, { success: true, message: 'Costo variable eliminado.' });
      }

      // GET /api/admin/custom-requests
      if (method === 'GET' && pathname === '/api/admin/custom-requests') {
        const requests = db.prepare('SELECT * FROM custom_requests ORDER BY id DESC').all();
        return sendJSON(res, 200, requests);
      }

      // PATCH /api/admin/custom-requests/:id/status
      const customStatusMatch = pathname.match(/^\/api\/admin\/custom-requests\/(\d+)\/status$/);
      if (method === 'PATCH' && customStatusMatch) {
        const reqId = customStatusMatch[1];
        const body = await parseBody(req);
        const { status } = body;
        db.prepare('UPDATE custom_requests SET status = ? WHERE id = ?').run(status, reqId);
        return sendJSON(res, 200, { success: true, message: 'Estado actualizado.' });
      }

      // GET /api/admin/contact-messages
      if (method === 'GET' && pathname === '/api/admin/contact-messages') {
        const messages = db.prepare('SELECT * FROM contact_messages ORDER BY id DESC').all();
        return sendJSON(res, 200, messages);
      }

      // GET /api/admin/settings
      if (method === 'GET' && pathname === '/api/admin/settings') {
        const rows = db.prepare('SELECT key, value FROM settings').all();
        const settings = {};
        for (const row of rows) {
          if (row.key !== 'admin_password_hash') {
            settings[row.key] = row.value;
          }
        }
        return sendJSON(res, 200, settings);
      }

      // PUT /api/admin/settings
      if (method === 'PUT' && pathname === '/api/admin/settings') {
        const body = await parseBody(req);
        const updateSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        for (const [k, v] of Object.entries(body)) {
          if (k !== 'admin_password_hash') {
            updateSetting.run(k, String(v));
          }
        }
        return sendJSON(res, 200, { success: true, message: 'Configuración guardada correctamente.' });
      }

      // POST /api/admin/upload - Direct upload helper
      if (method === 'POST' && pathname === '/api/admin/upload') {
        const body = await parseBody(req);
        const { image_data, prefix } = body;
        if (!image_data) return sendError(res, 400, 'Datos de imagen requeridos.');
        const url = saveBase64Image(image_data, prefix || 'admin_upload');
        return sendJSON(res, 200, { success: true, url });
      }

      return sendError(res, 404, 'Ruta administrativa no encontrada');
    }

    // Default: Serve static files
    serveStatic(req, res, pathname);

  } catch (error) {
    console.error('Unhandled Server Error:', error);
    sendError(res, 500, 'Error interno del servidor');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[NOVA VOGUE SERVER] Running at http://localhost:${PORT}`);
  console.log(`[NOVA VOGUE SERVER] Storefront: http://localhost:${PORT}/`);
  console.log(`[NOVA VOGUE SERVER] Admin Panel: http://localhost:${PORT}/admin`);
});

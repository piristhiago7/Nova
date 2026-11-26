const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'novavogue.sqlite');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for concurrency and performance
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Helper for secure password hashing
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHash] = storedHash.split(':');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(originalHash));
  } catch {
    return false;
  }
}

// Initialize database schema
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      ip TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      cost_price REAL NOT NULL DEFAULT 0,
      description TEXT,
      sizes TEXT NOT NULL,
      image_url TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 10,
      sold_count INTEGER NOT NULL DEFAULT 0,
      is_featured INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS fixed_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concept TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      frequency TEXT DEFAULT 'Mensual',
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS variable_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concept TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      unit_type TEXT DEFAULT 'Por unidad producida',
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      order_id INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      customer_phone TEXT NOT NULL,
      delivery_type TEXT NOT NULL,
      shipping_address TEXT,
      items TEXT NOT NULL,
      subtotal REAL NOT NULL,
      shipping_cost_charged REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      cost_production_total REAL NOT NULL DEFAULT 0,
      cost_packaging REAL NOT NULL DEFAULT 0,
      cost_shipping_real REAL NOT NULL DEFAULT 0,
      cost_fee REAL NOT NULL DEFAULT 0,
      profit_gross REAL NOT NULL DEFAULT 0,
      profit_net_estimated REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pendiente',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS custom_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT,
      garment_type TEXT NOT NULL,
      size TEXT NOT NULL,
      color TEXT NOT NULL,
      design_description TEXT NOT NULL,
      notes TEXT,
      image_path TEXT,
      status TEXT NOT NULL DEFAULT 'Pendiente',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact TEXT NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'No leído',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);
}

// Seed initial default settings and data if empty
function seedData() {
  // Check settings
  const checkSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  const initialPassword = process.env.ADMIN_PASSWORD || '49391826';
  if (!checkSetting.get('admin_password_hash')) {
    setSetting.run('admin_password_hash', hashPassword(initialPassword));
  }
  if (!checkSetting.get('store_name')) setSetting.run('store_name', 'NOVA VOGUE');
  if (!checkSetting.get('store_tagline')) setSetting.run('store_tagline', 'Indumentaria Urbana Masculina');
  if (!checkSetting.get('store_location')) setSetting.run('store_location', 'Puerto Iguazú, Misiones, Argentina');
  if (!checkSetting.get('whatsapp_number')) setSetting.run('whatsapp_number', '+54 9 3757 458920');
  if (!checkSetting.get('instagram_handle')) setSetting.run('instagram_handle', '@novavogue.ar');
  if (!checkSetting.get('contact_email')) setSetting.run('contact_email', 'contacto@novavogue.com.ar');
  if (!checkSetting.get('shipping_cost')) setSetting.run('shipping_cost', '5500');
  if (!checkSetting.get('free_shipping_threshold')) setSetting.run('free_shipping_threshold', '85000');
  if (!checkSetting.get('pickup_address')) setSetting.run('pickup_address', 'Av. Victoria Aguirre 480, Local 3, Puerto Iguazú, Misiones');
  if (!checkSetting.get('pickup_hours')) setSetting.run('pickup_hours', 'Lunes a Viernes de 17:00 a 21:00 hs | Sábados de 10:00 a 13:00 y 17:00 a 21:00 hs');
  if (!checkSetting.get('pickup_instructions')) setSetting.run('pickup_instructions', 'Presentar documento de identidad (DNI) y el código de pedido al retirar.');
  if (!checkSetting.get('packaging_cost_default')) setSetting.run('packaging_cost_default', '850');
  if (!checkSetting.get('payment_fee_percent')) setSetting.run('payment_fee_percent', '3.5');

  // Check products
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (productCount === 0) {
    const insertProduct = db.prepare(`
      INSERT INTO products (name, category, price, cost_price, description, sizes, image_url, stock, sold_count, is_featured)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const demoProducts = [
      {
        name: 'Remera Boxy Heavyweight "Eclipse"',
        category: 'Remeras',
        price: 38000,
        cost_price: 14500,
        description: 'Remera corte boxy fit en algodón peinado premium 24/1 pesado (240g). Color negro lavado carbón con estampa sutil celestial en espalda y cuello cerrado de ribb reforzado.',
        sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
        image_url: '/assets/products/remera-eclipse.jpg',
        stock: 24,
        sold_count: 32,
        is_featured: 1
      },
      {
        name: 'Remera Oversize "Astral Void"',
        category: 'Remeras',
        price: 39500,
        cost_price: 15200,
        description: 'Remera oversize en jersey de algodón pesado color blanco roto con tratamiento pre-encogido. Caída estructurada, hombros caídos y bordado tonal en el pecho.',
        sizes: JSON.stringify(['M', 'L', 'XL', 'XXL']),
        image_url: '/assets/products/remera-astral.jpg',
        stock: 18,
        sold_count: 27,
        is_featured: 1
      },
      {
        name: 'Remera Acid Wash "Orbit"',
        category: 'Remeras',
        price: 41000,
        cost_price: 16400,
        description: 'Confeccionada con proceso de lavado artesanal acid wash en gris mineral. Cada prenda presenta un veteado exclusivo con costuras reforzadas de inspiración streetwear noventera.',
        sizes: JSON.stringify(['S', 'M', 'L', 'XL']),
        image_url: '/assets/products/remera-acid.jpg',
        stock: 12,
        sold_count: 19,
        is_featured: 1
      },
      {
        name: 'Remera Minimal Pocket "Punto Cero"',
        category: 'Remeras',
        price: 36000,
        cost_price: 13800,
        description: 'Básico esencial de alta densidad en tono gris carbón profundo. Bolsillo frontal cuadrado de corte geométrico y etiqueta textil de alta definición en dobladillo.',
        sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
        image_url: '/assets/products/remera-cero.jpg',
        stock: 30,
        sold_count: 22,
        is_featured: 0
      },
      {
        name: 'Hoodie Oversize "Gravity 400g"',
        category: 'Hoodies y buzos',
        price: 68000,
        cost_price: 26800,
        description: 'Buzo con capucha confeccionado en frisa invisible pesada de 400 gramos. Interior perchado ultra cálido, bolsillo canguro amplio, capucha doble tela estructurada sin cordones.',
        sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
        image_url: '/assets/products/hoodie-gravity.jpg',
        stock: 15,
        sold_count: 29,
        is_featured: 1
      },
      {
        name: 'Buzo Crewneck "Subtropical"',
        category: 'Hoodies y buzos',
        price: 58000,
        cost_price: 22500,
        description: 'Cuello redondo clásico de silueta relajada en rústico pesado color gris ceniza. Puños y cintura en ribb elastizado con detalle bordado en manga izquierda.',
        sizes: JSON.stringify(['S', 'M', 'L', 'XL']),
        image_url: '/assets/products/buzo-subtropical.jpg',
        stock: 16,
        sold_count: 18,
        is_featured: 1
      },
      {
        name: 'Hoodie Full Zip "Vortex"',
        category: 'Hoodies y buzos',
        price: 72000,
        cost_price: 28900,
        description: 'Hoodie con cierre metálico bidireccional YKK. Silueta boxy en frisa premium gris grafito oscuro con detalles de pespunte a la vista y calce contemporáneo.',
        sizes: JSON.stringify(['M', 'L', 'XL', 'XXL']),
        image_url: '/assets/products/hoodie-vortex.jpg',
        stock: 11,
        sold_count: 14,
        is_featured: 0
      },
      {
        name: 'Pantalón Wide Cargo "Tactical Utility"',
        category: 'Pantalones',
        price: 64000,
        cost_price: 24800,
        description: 'Pantalón cargo en gabardina esmerilada de alta resistencia. 6 bolsillos funcionales con fuelles, cintura elasticada con cordón técnico y reguladores en botamanga.',
        sizes: JSON.stringify(['S', 'M', 'L', 'XL']),
        image_url: '/assets/products/pant-tactical.jpg',
        stock: 14,
        sold_count: 21,
        is_featured: 1
      },
      {
        name: 'Pantalón Relaxed Parachute "Nomad"',
        category: 'Pantalones',
        price: 59000,
        cost_price: 23200,
        description: 'Silueta balloon parachute en tejido ripstop liviano pero estructurado. Color negro mate con pliegues en rodillas y ajuste elástico con tanca en tobillos.',
        sizes: JSON.stringify(['S', 'M', 'L', 'XL']),
        image_url: '/assets/products/pant-nomad.jpg',
        stock: 9,
        sold_count: 15,
        is_featured: 0
      },
      {
        name: 'Gorra Dad Cap "Nova Star" Bordada',
        category: 'Accesorios',
        price: 22000,
        cost_price: 7500,
        description: 'Gorra estilo Dad Hat de 6 gajos en sarga de algodón lavado color negro carbón. Bordado frontal 3D del isotipo celestial Nova Vogue y hebilla metálica de ajuste.',
        sizes: JSON.stringify(['Único']),
        image_url: '/assets/products/cap-novastar.jpg',
        stock: 25,
        sold_count: 38,
        is_featured: 1
      },
      {
        name: 'Beanie Ribbed "Horizon"',
        category: 'Accesorios',
        price: 18500,
        cost_price: 6200,
        description: 'Gorro tejido en ribb doble de acrílico premium hipoalergénico. Color gris medio con doblez clásico y etiqueta engomada minimalista.',
        sizes: JSON.stringify(['Único']),
        image_url: '/assets/products/beanie-horizon.jpg',
        stock: 20,
        sold_count: 25,
        is_featured: 0
      },
      {
        name: 'Tote Bag Heavy Canvas "Iguazú Urban"',
        category: 'Accesorios',
        price: 24000,
        cost_price: 8400,
        description: 'Bolso tote en lona cruda pesada de 14 oz con asas reforzadas para hombro. Serigrafía monocromática en tintas ecológicas al agua.',
        sizes: JSON.stringify(['Único']),
        image_url: '/assets/products/tote-iguazu.jpg',
        stock: 19,
        sold_count: 16,
        is_featured: 1
      },
      {
        name: 'Prenda Personalizada Lab "Custom Piece"',
        category: 'Indumentaria personalizada',
        price: 46000,
        cost_price: 18000,
        description: 'Prenda base confeccionada a medida según tus especificaciones de diseño, estampa o bordado en nuestro laboratorio textil de Puerto Iguazú.',
        sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
        image_url: '/assets/custom-sample.jpg',
        stock: 50,
        sold_count: 12,
        is_featured: 1
      }
    ];

    for (const p of demoProducts) {
      insertProduct.run(
        p.name,
        p.category,
        p.price,
        p.cost_price,
        p.description,
        p.sizes,
        p.image_url,
        p.stock,
        p.sold_count,
        p.is_featured
      );
    }
  }

  // Check Fixed Costs
  const fixedCount = db.prepare('SELECT COUNT(*) as count FROM fixed_costs').get().count;
  if (fixedCount === 0) {
    const insertFixed = db.prepare(`
      INSERT INTO fixed_costs (concept, category, amount, frequency, notes)
      VALUES (?, ?, ?, ?, ?)
    `);

    const defaultFixed = [
      ['Alquiler Showroom & Taller Comercial', 'Alquiler', 320000, 'Mensual', 'Local céntrico sobre Av. Victoria Aguirre'],
      ['Energía Eléctrica (Climatización y Maquinaria)', 'Electricidad', 85000, 'Mensual', 'Consumo de taller textil y luces de exhibición'],
      ['Conexión Fibra Óptica & Línea Comercial', 'Internet', 32000, 'Mensual', 'Internet 300 Mbps para terminal y e-commerce'],
      ['Mano de Obra & Asistencia de Taller', 'Sueldos', 480000, 'Mensual', 'Confección, control de calidad y despacho'],
      ['Mantenimiento de Máquinas y Local', 'Mantenimiento', 45000, 'Mensual', 'Calibración recta, overlock y estampadora'],
      ['Software de Gestión, Hosting & Dominio', 'Servicios', 28000, 'Mensual', 'Infraestructura tecnológica y servicios contables']
    ];

    for (const [concept, cat, amount, freq, notes] of defaultFixed) {
      insertFixed.run(concept, cat, amount, freq, notes);
    }
  }

  // Check Variable Costs
  const varCount = db.prepare('SELECT COUNT(*) as count FROM variable_costs').get().count;
  if (varCount === 0) {
    const insertVar = db.prepare(`
      INSERT INTO variable_costs (concept, category, amount, unit_type, notes)
      VALUES (?, ?, ?, ?, ?)
    `);

    const defaultVar = [
      ['Rollos Jersey Peinado 24/1 Algodón Pesado', 'Telas', 285000, 'Por lote de producción', 'Adquisición de rollos directo de hilandería nacional'],
      ['Frisa Invisible 400g Negro y Gris Melange', 'Materia prima', 340000, 'Por lote de producción', 'Material para confección de hoodies y buzos de invierno'],
      ['Tintas Ecológicas Plastisol & Al Agua', 'Estampados', 42000, 'Por lote de producción', 'Tintas serigráficas de alta cobertura y tacto cero'],
      ['Matrices de Bordado & Hilados Reforzados', 'Bordados', 38000, 'Por lote de producción', 'Bordado industrial para gorras y logos frontales'],
      ['Cajas Kraft Rígidas Nova Vogue con Papel Seda', 'Packaging', 95000, 'Por pedido', 'Cajas premium de entrega para e-commerce (lote 100u)'],
      ['Etiquetas Textiles Tejidas Damasco & Hangtags', 'Etiquetas', 36000, 'Por lote de producción', 'Etiquetas de marca, talle y composición'],
      ['Bolsas E-Commerce Herméticas e Hidrófugas', 'Packaging', 48000, 'Por pedido', 'Para envíos por correo a todo el país']
    ];

    for (const [concept, cat, amount, unit, notes] of defaultVar) {
      insertVar.run(concept, cat, amount, unit, notes);
    }
  }

  // Check Orders
  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  if (orderCount === 0) {
    const insertOrder = db.prepare(`
      INSERT INTO orders (
        order_number, customer_name, customer_email, customer_phone, delivery_type,
        shipping_address, items, subtotal, shipping_cost_charged, total,
        cost_production_total, cost_packaging, cost_shipping_real, cost_fee,
        profit_gross, profit_net_estimated, status, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Sample historical orders with exact financial breakdown
    const sampleOrders = [
      {
        order_number: 'NV-2026-1001',
        customer_name: 'Santiago Morales',
        customer_email: 'santiago.morales@gmail.com',
        customer_phone: '+54 9 3757 512034',
        delivery_type: 'shipping',
        shipping_address: JSON.stringify({
          province: 'Misiones',
          city: 'Posadas',
          address: 'Av. Corrientes 1542, Piso 4 B',
          postalCode: '3300',
          notes: 'Timbre Morales'
        }),
        items: JSON.stringify([
          { productId: 5, name: 'Hoodie Oversize "Gravity 400g"', size: 'L', quantity: 1, unitPrice: 68000, unitCost: 26800 },
          { productId: 1, name: 'Remera Boxy Heavyweight "Eclipse"', size: 'L', quantity: 1, unitPrice: 38000, unitCost: 14500 }
        ]),
        subtotal: 106000,
        shipping_cost_charged: 5500,
        total: 111500,
        cost_production_total: 41300,
        cost_packaging: 1200,
        cost_shipping_real: 5200,
        cost_fee: 3902,
        profit_gross: 59898,
        profit_net_estimated: 42350,
        status: 'Entregado',
        notes: 'Cliente satisfecho con la calidad del algodón pesado.',
        created_at: '2026-11-14 11:20:00'
      },
      {
        order_number: 'NV-2026-1002',
        customer_name: 'Mateo Fernández',
        customer_email: 'mateo.fdz@hotmail.com',
        customer_phone: '+54 9 3757 662910',
        delivery_type: 'pickup',
        shipping_address: null,
        items: JSON.stringify([
          { productId: 8, name: 'Pantalón Wide Cargo "Tactical Utility"', size: 'M', quantity: 1, unitPrice: 64000, unitCost: 24800 }
        ]),
        subtotal: 64000,
        shipping_cost_charged: 0,
        total: 64000,
        cost_production_total: 24800,
        cost_packaging: 850,
        cost_shipping_real: 0,
        cost_fee: 2240,
        profit_gross: 36110,
        profit_net_estimated: 25400,
        status: 'Listo para retirar',
        notes: 'Retira hoy después de las 18 hs por el local.',
        created_at: '2026-11-17 15:45:00'
      },
      {
        order_number: 'NV-2026-1003',
        customer_name: 'Ignacio Benítez',
        customer_email: 'ignacio.benitez@yahoo.com.ar',
        customer_phone: '+54 9 11 6842 1190',
        delivery_type: 'shipping',
        shipping_address: JSON.stringify({
          province: 'Buenos Aires',
          city: 'CABA',
          address: 'Thames 1890, Palermo',
          postalCode: '1414',
          notes: 'Dejar en recepción'
        }),
        items: JSON.stringify([
          { productId: 2, name: 'Remera Oversize "Astral Void"', size: 'XL', quantity: 2, unitPrice: 39500, unitCost: 15200 },
          { productId: 10, name: 'Gorra Dad Cap "Nova Star" Bordada', size: 'Único', quantity: 1, unitPrice: 22000, unitCost: 7500 }
        ]),
        subtotal: 101000,
        shipping_cost_charged: 5500,
        total: 106500,
        cost_production_total: 37900,
        cost_packaging: 1200,
        cost_shipping_real: 5200,
        cost_fee: 3727,
        profit_gross: 58473,
        profit_net_estimated: 41200,
        status: 'En preparación',
        notes: 'Embalar con caja de protección rígida.',
        created_at: '2026-11-19 18:10:00'
      },
      {
        order_number: 'NV-2026-1004',
        customer_name: 'Lucas Duarte',
        customer_email: 'lucas.duarte.iguazu@gmail.com',
        customer_phone: '+54 9 3757 401832',
        delivery_type: 'pickup',
        shipping_address: null,
        items: JSON.stringify([
          { productId: 6, name: 'Buzo Crewneck "Subtropical"', size: 'M', quantity: 1, unitPrice: 58000, unitCost: 22500 }
        ]),
        subtotal: 58000,
        shipping_cost_charged: 0,
        total: 58000,
        cost_production_total: 22500,
        cost_packaging: 850,
        cost_shipping_real: 0,
        cost_fee: 2030,
        profit_gross: 32620,
        profit_net_estimated: 22800,
        status: 'Confirmado',
        notes: 'Pago en efectivo al retirar en local.',
        created_at: '2026-11-20 09:30:00'
      },
      {
        order_number: 'NV-2026-1005',
        customer_name: 'Joaquín Valenzuela',
        customer_email: 'valenzuela.j@gmail.com',
        customer_phone: '+54 9 376 4981120',
        delivery_type: 'shipping',
        shipping_address: JSON.stringify({
          province: 'Misiones',
          city: 'Eldorado',
          address: 'San Martín 420',
          postalCode: '3380',
          notes: ''
        }),
        items: JSON.stringify([
          { productId: 3, name: 'Remera Acid Wash "Orbit"', size: 'L', quantity: 1, unitPrice: 41000, unitCost: 16400 }
        ]),
        subtotal: 41000,
        shipping_cost_charged: 5500,
        total: 46500,
        cost_production_total: 16400,
        cost_packaging: 850,
        cost_shipping_real: 5200,
        cost_fee: 1627,
        profit_gross: 22423,
        profit_net_estimated: 14500,
        status: 'Pendiente',
        notes: 'Coordinando detalles de envío por WhatsApp.',
        created_at: '2026-11-21 14:05:00'
      }
    ];

    for (const o of sampleOrders) {
      insertOrder.run(
        o.order_number,
        o.customer_name,
        o.customer_email,
        o.customer_phone,
        o.delivery_type,
        o.shipping_address,
        o.items,
        o.subtotal,
        o.shipping_cost_charged,
        o.total,
        o.cost_production_total,
        o.cost_packaging,
        o.cost_shipping_real,
        o.cost_fee,
        o.profit_gross,
        o.profit_net_estimated,
        o.status,
        o.notes,
        o.created_at
      );
    }
  }

  // Check Custom Requests
  const customCount = db.prepare('SELECT COUNT(*) as count FROM custom_requests').get().count;
  if (customCount === 0) {
    const insertCustom = db.prepare(`
      INSERT INTO custom_requests (
        ticket_number, customer_name, customer_phone, customer_email,
        garment_type, size, color, design_description, notes, image_path, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertCustom.run(
      'NV-CUST-801',
      'Rodrigo Almirón',
      '+54 9 3757 598812',
      'rodrigo.almiron@gmail.com',
      'Hoodie Oversize Frisa 400g',
      'XL',
      'Negro Lavado',
      'Logo Nova Star bordado en pecho centrado de 8x8 cm en hilo plateado metalizado y en espalda tipografía gótica "MISIONES URBAN ARCHIVE"',
      'Prefiero bordado antes que serigrafía. Lo necesito para un evento en dos semanas.',
      '/assets/custom-sample.jpg',
      'En cotización',
      '2026-11-18 16:30:00'
    );
  }
}

// Run schema and seed
initSchema();
seedData();

module.exports = {
  db,
  hashPassword,
  verifyPassword
};

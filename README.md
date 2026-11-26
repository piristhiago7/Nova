# NOVA VOGUE | Indumentaria Urbana Masculina
**Puerto Iguazú, Misiones, Argentina**

Plataforma web integral de comercio electrónico y sistema privado de control administrativo y financiero.

---

## 🚀 Arquitectura y Tecnologías
- **Servidor y Backend:** Node.js v24 (HTTP nativo, sin dependencias frágiles externas).
- **Base de Datos Persistente:** SQLite nativo en modo WAL (`data/novavogue.sqlite`).
- **Seguridad & Autenticación:** Algoritmo criptográfico de derivación de claves `scrypt` (NIST/OWASP), tokens de sesión criptográficos aleatorios de 256 bits, y protección anti fuerza bruta por limitación de tasa (rate limiting).
- **Frontend & Diseño:** HTML5 semántico, CSS3 modular con estética minimalista streetwear contemporánea (paleta carbón, gris oscuro, blanco roto y negro), y JavaScript reactivo vanilla con Chart.js para estadísticas visuales.

---

## 🔑 Credenciales de Acceso al Panel de Administración
- **Ruta de acceso:** `http://localhost:3000/admin`
- **Contraseña inicial:** `49391826`
*(La contraseña se valida del lado del servidor y puede modificarse en cualquier momento desde la pestaña Configuración).*

---

## 📦 Estructura del Proyecto
```
microemprendimiento/
├── data/
│   └── novavogue.sqlite          # Base de datos persistente SQLite
├── public/
│   ├── assets/                   # Logotipos oficiales e imágenes editoriales
│   ├── css/
│   │   ├── style.css             # Estilos de la tienda pública
│   │   └── admin.css             # Estilos del panel de control privado
│   ├── js/
│   │   ├── app.js                # Lógica del cliente, carrito y checkout
│   │   └── admin.js              # Controlador del dashboard y gráficos
│   ├── uploads/                  # Imágenes adjuntas de clientes y productos
│   ├── index.html                # Tienda pública (Storefront)
│   └── admin.html                # Panel de administración privado
├── src/
│   ├── db.js                     # Esquema, migraciones y seed de base de datos
│   ├── auth.js                   # Autenticación segura y rate limiter
│   ├── finance.js                # Motor de cálculo financiero y auditoría
│   └── server.js                 # Servidor HTTP y API REST
├── package.json
└── README.md
```

---

## 💎 Funcionalidades Principales

### 1. Tienda Online Pública
- **Identidad Streetwear:** Inspirada en la estética contemporánea de indumentaria urbana (prendas pesadas de 240g y 400g).
- **Catálogo Dinámico:** Remeras, Hoodies y buzos, Pantalones, Accesorios y Prendas Personalizadas. Filtros en vivo por categoría, buscador de texto y ordenamiento por precio o nombre.
- **Selector de Talles y Cantidades:** Validación de stock disponible en tiempo real.
- **Laboratorio de Personalización:** Formulario interactivo donde los clientes eligen prenda base, color, talle, detallan el diseño y adjuntan fotografías o bocetos de referencia. Genera un número de ticket único (`#NV-CUST-XXX`).
- **Carrito y Proceso de Compra (Checkout):**
  - **Envío a Domicilio:** Captura de provincia, ciudad, dirección, código postal y referencias. Aplica costo de envío configurable o bonificación automática por umbral de compra.
  - **Retiro en Local Físico:** Muestra dirección comercial en Puerto Iguazú, horarios de atención e instrucciones de entrega sin costo de envío.
  - **Confirmación con WhatsApp:** Genera número de pedido único (`#NV-2026-XXXX`) y permite enviar el detalle completo preformateado por WhatsApp con un solo clic.

### 2. Panel Administrativo & Calculadora Financiera
- **Resumen General:** Métricas de facturación total, ganancia neta, pedidos confirmados, margen neto porcentual y ticket promedio. Gráficos interactivos de evolución mensual y estructura de costos.
- **Calculadora Financiera:**
  - Registro de **Costos Fijos Mensuales** (Alquiler comercial, luz, internet, mano de obra, mantenimiento, software).
  - Registro de **Costos Variables** (Telas pesadas, tintas, bordados, cajas y embalaje, etiquetas, comisiones).
  - Cálculo del **Punto de Equilibrio** (en unidades de prendas mensuales y en facturación ARS).
  - **Simulador Interactivo:** Permite proyectar cuántas prendas se deben vender para alcanzar una meta deseada de ganancia neta de bolsillo.
- **Ganancia Neta por Pedido Individual:**
  - Desglose financiero transparente para cada compra:
    - **Ingresos:** Venta de productos + Envío cobrado.
    - **Costos Variables:** Fabricación unitaria de prendas + Embalaje + Costo real de correo + Comisiones de pasarela.
    - **Ganancia Bruta.**
    - **Prorrateo de Costos Fijos.**
    - **Ganancia Neta Estimada del Pedido** en ARS y porcentaje de margen neto.
- **Gestión de Pedidos:** Actualización de estados (Pendiente, Confirmado, En preparación, Listo para retirar, Enviado, Entregado, Cancelado).
- **Gestión de Productos (CRUD):** Creación, edición, precios, costos de confección, talles, stock y carga de fotos.
- **Parámetros Comerciales:** Costos de envío, datos de retiro en local, WhatsApp e Instagram editables.

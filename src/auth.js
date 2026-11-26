const crypto = require('node:crypto');
const { db, hashPassword, verifyPassword } = require('./db.js');

const SESSION_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Rate limiter / Brute-force check
function checkRateLimit(ip) {
  const now = Date.now();
  const row = db.prepare('SELECT attempts, locked_until FROM login_attempts WHERE ip = ?').get(ip);

  if (row) {
    if (row.locked_until > now) {
      const waitMinutes = Math.ceil((row.locked_until - now) / 60000);
      return {
        allowed: false,
        message: `Demasiados intentos fallidos. Acceso bloqueado por seguridad durante ${waitMinutes} minuto(s).`
      };
    }
    // Lock has expired
    if (row.locked_until > 0 && row.locked_until <= now) {
      db.prepare('DELETE FROM login_attempts WHERE ip = ?').run(ip);
    }
  }

  return { allowed: true };
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const row = db.prepare('SELECT attempts FROM login_attempts WHERE ip = ?').get(ip);
  const currentAttempts = (row ? row.attempts : 0) + 1;

  if (currentAttempts >= MAX_ATTEMPTS) {
    const lockedUntil = now + LOCKOUT_DURATION_MS;
    db.prepare('INSERT OR REPLACE INTO login_attempts (ip, attempts, locked_until) VALUES (?, ?, ?)')
      .run(ip, currentAttempts, lockedUntil);
    return {
      locked: true,
      message: `Ha alcanzado el límite de 5 intentos fallidos. Acceso bloqueado por 15 minutos.`
    };
  } else {
    db.prepare('INSERT OR REPLACE INTO login_attempts (ip, attempts, locked_until) VALUES (?, ?, 0)')
      .run(ip, currentAttempts);
    return {
      locked: false,
      remaining: MAX_ATTEMPTS - currentAttempts,
      message: `Contraseña incorrecta. Intentos restantes antes del bloqueo: ${MAX_ATTEMPTS - currentAttempts}`
    };
  }
}

function resetAttempts(ip) {
  db.prepare('DELETE FROM login_attempts WHERE ip = ?').run(ip);
}

// Session management
function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + SESSION_EXPIRATION_MS;

  db.prepare('INSERT INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)')
    .run(token, now, expiresAt);

  return token;
}

function validateSession(token) {
  if (!token) return false;
  const now = Date.now();
  const session = db.prepare('SELECT token, expires_at FROM admin_sessions WHERE token = ?').get(token);

  if (!session) return false;

  if (session.expires_at < now) {
    db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
    return false;
  }

  return true;
}

function destroySession(token) {
  if (token) {
    db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
  }
}

// Login admin
function loginAdmin(password, clientIp) {
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return { success: false, status: 429, message: rateLimit.message };
  }

  const storedHashRow = db.prepare("SELECT value FROM settings WHERE key = 'admin_password_hash'").get();
  if (!storedHashRow) {
    return { success: false, status: 500, message: 'Configuración de seguridad no encontrada.' };
  }

  const isValid = verifyPassword(password, storedHashRow.value);

  if (!isValid) {
    const attemptResult = recordFailedAttempt(clientIp);
    return {
      success: false,
      status: attemptResult.locked ? 429 : 401,
      message: attemptResult.message
    };
  }

  // Password is correct
  resetAttempts(clientIp);
  const token = createSession();
  return {
    success: true,
    token,
    message: 'Inicio de sesión exitoso.'
  };
}

// Change admin password
function changeAdminPassword(currentPassword, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, status: 400, message: 'La nueva contraseña debe tener al menos 6 caracteres.' };
  }

  const storedHashRow = db.prepare("SELECT value FROM settings WHERE key = 'admin_password_hash'").get();
  if (!storedHashRow) {
    return { success: false, status: 500, message: 'Configuración no encontrada.' };
  }

  const isValid = verifyPassword(currentPassword, storedHashRow.value);
  if (!isValid) {
    return { success: false, status: 401, message: 'La contraseña actual ingresada es incorrecta.' };
  }

  const newHash = hashPassword(newPassword);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'admin_password_hash'").run(newHash);

  // Invalidate all existing sessions for security
  db.prepare('DELETE FROM admin_sessions').run();
  const newToken = createSession();

  return { success: true, token: newToken, message: 'Contraseña actualizada correctamente.' };
}

// Extract session token from request
function extractToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  const cookieHeader = req.headers['cookie'];
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith('nv_admin_session=')) {
        return cookie.substring('nv_admin_session='.length);
      }
    }
  }

  return null;
}

// Middleware helper
function requireAdmin(req) {
  const token = extractToken(req);
  return validateSession(token);
}

module.exports = {
  loginAdmin,
  changeAdminPassword,
  destroySession,
  requireAdmin,
  extractToken
};

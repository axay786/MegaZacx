const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AuthManager {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.dbFile = path.join(this.dataDir, 'users.json');
    this.users = new Map(); // normalizedUsername -> user object
    this.usersById = new Map(); // id -> user object
    this.sessions = new Map(); // token -> session object
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      if (fs.existsSync(this.dbFile)) {
        const raw = fs.readFileSync(this.dbFile, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.users)) {
          data.users.forEach(u => {
            if (u && u.username) {
              const norm = u.normalizedUsername || u.username.toLowerCase();
              u.normalizedUsername = norm;
              this.users.set(norm, u);
              this.usersById.set(u.id, u);
            }
          });
        }
        if (data.sessions && typeof data.sessions === 'object') {
          Object.entries(data.sessions).forEach(([token, sess]) => {
            this.sessions.set(token, sess);
          });
        }
        console.log(`[AuthManager] Loaded ${this.users.size} user account(s) from ${this.dbFile}`);
      } else {
        this.save();
      }
    } catch (err) {
      console.warn('[AuthManager] Warning initializing user database:', err.message);
    }
  }

  save() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const data = {
        users: Array.from(this.users.values()),
        sessions: Object.fromEntries(this.sessions.entries())
      };
      fs.writeFileSync(this.dbFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('[AuthManager] Failed to persist user database:', err.message);
    }
  }

  hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  verifyPassword(password, storedHash) {
    try {
      const [salt, key] = storedHash.split(':');
      if (!salt || !key) return false;
      const keyBuffer = Buffer.from(key, 'hex');
      const derivedBuffer = crypto.scryptSync(password, salt, 64);
      return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
    } catch (e) {
      return false;
    }
  }

  // Duplicate Username Validation & Registration
  register({ username, password, avatarColor }) {
    if (!username || typeof username !== 'string') {
      return { success: false, error: 'Username is required.' };
    }
    const cleanName = username.trim();
    if (cleanName.length < 2) {
      return { success: false, error: 'Username must be at least 2 characters.' };
    }
    if (cleanName.length > 24) {
      return { success: false, error: 'Username cannot exceed 24 characters.' };
    }
    if (!/^[a-zA-Z0-9_\- ]+$/.test(cleanName)) {
      return { success: false, error: 'Username can only contain letters, numbers, spaces, underscores, and dashes.' };
    }
    if (!password || typeof password !== 'string' || password.length < 4) {
      return { success: false, error: 'Password must be at least 4 characters.' };
    }

    const normalized = cleanName.toLowerCase();

    // CRITICAL: Duplicate Username Validation (Case-Insensitive)
    if (this.users.has(normalized)) {
      return {
        success: false,
        error: `Username "${cleanName}" is already taken. Please choose another username or log in.`
      };
    }

    const id = 'usr_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
    const newUser = {
      id,
      username: cleanName,
      normalizedUsername: normalized,
      passwordHash: this.hashPassword(password),
      avatarColor: avatarColor || '#7C3AED',
      avatarInitial: cleanName[0].toUpperCase(),
      createdAt: new Date().toISOString()
    };

    this.users.set(normalized, newUser);
    this.usersById.set(id, newUser);

    const token = 'tok_' + crypto.randomBytes(24).toString('hex');
    this.sessions.set(token, {
      userId: id,
      username: cleanName,
      createdAt: Date.now()
    });

    this.save();
    console.log(`[AuthManager] Registered new user account: ${cleanName} (${id})`);

    return {
      success: true,
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        avatarColor: newUser.avatarColor,
        avatarInitial: newUser.avatarInitial,
        createdAt: newUser.createdAt
      }
    };
  }

  login({ username, password }) {
    if (!username || !password) {
      return { success: false, error: 'Username and password are required.' };
    }
    const cleanName = username.trim();
    const normalized = cleanName.toLowerCase();
    const user = this.users.get(normalized);

    if (!user) {
      return { success: false, error: `Account "${cleanName}" does not exist. Please check your username or register.` };
    }

    if (!this.verifyPassword(password, user.passwordHash)) {
      return { success: false, error: 'Incorrect password. Please try again.' };
    }

    const token = 'tok_' + crypto.randomBytes(24).toString('hex');
    this.sessions.set(token, {
      userId: user.id,
      username: user.username,
      createdAt: Date.now()
    });
    this.save();
    console.log(`[AuthManager] User logged in: ${user.username} (${user.id})`);

    return {
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        avatarColor: user.avatarColor,
        avatarInitial: user.avatarInitial,
        createdAt: user.createdAt
      }
    };
  }

  verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const session = this.sessions.get(token);
    if (!session) return null;
    const user = this.usersById.get(session.userId);
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      avatarColor: user.avatarColor,
      avatarInitial: user.avatarInitial,
      createdAt: user.createdAt
    };
  }

  updateProfile(userId, { avatarColor, username }) {
    const user = this.usersById.get(userId);
    if (!user) return { success: false, error: 'User not found' };

    if (avatarColor) user.avatarColor = avatarColor;

    if (username && username.trim() !== user.username) {
      const cleanName = username.trim();
      const normalized = cleanName.toLowerCase();
      if (normalized !== user.normalizedUsername && this.users.has(normalized)) {
        return { success: false, error: `Username "${cleanName}" is already taken.` };
      }
      this.users.delete(user.normalizedUsername);
      user.username = cleanName;
      user.normalizedUsername = normalized;
      user.avatarInitial = cleanName[0].toUpperCase();
      this.users.set(normalized, user);
    }

    this.save();
    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        avatarColor: user.avatarColor,
        avatarInitial: user.avatarInitial
      }
    };
  }

  logout(token) {
    if (token && this.sessions.has(token)) {
      this.sessions.delete(token);
      this.save();
    }
  }
}

module.exports = AuthManager;

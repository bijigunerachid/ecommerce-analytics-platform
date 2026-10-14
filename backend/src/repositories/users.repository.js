// Data access for the users table. All queries are parameterized.
// password_hash and session_version are only selected by the methods used for authentication;
// they never appear in API responses.

const PUBLIC_COLUMNS =
  'id, email, full_name, role, is_active, last_login_at, password_changed_at, created_at, updated_at';

function toUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    passwordChangedAt: row.password_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createUsersRepository(db) {
  return {
    async findById(id) {
      const { rows } = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
      return toUser(rows[0]);
    },

    async findByEmailWithHash(email) {
      const { rows } = await db.query(
        `SELECT ${PUBLIC_COLUMNS}, password_hash, session_version FROM users WHERE email = $1`,
        [email],
      );
      if (!rows[0]) return null;
      return {
        ...toUser(rows[0]),
        passwordHash: rows[0].password_hash,
        sessionVersion: rows[0].session_version,
      };
    },

    async findByIdWithHash(id) {
      const { rows } = await db.query(
        `SELECT ${PUBLIC_COLUMNS}, password_hash, session_version FROM users WHERE id = $1`,
        [id],
      );
      if (!rows[0]) return null;
      return {
        ...toUser(rows[0]),
        passwordHash: rows[0].password_hash,
        sessionVersion: rows[0].session_version,
      };
    },

    /** The user and their current session version (sessions with another version are void). */
    async findAuthState(id) {
      const { rows } = await db.query(
        `SELECT ${PUBLIC_COLUMNS}, session_version FROM users WHERE id = $1`,
        [id],
      );
      if (!rows[0]) return null;
      return { user: toUser(rows[0]), sessionVersion: rows[0].session_version };
    },

    /** Sets a new password and signs out every session. Returns the new session version. */
    async setPassword(id, passwordHash, executor = db) {
      const { rows } = await executor.query(
        `UPDATE users
         SET password_hash = $2, password_changed_at = now(), session_version = session_version + 1
         WHERE id = $1 RETURNING session_version`,
        [id, passwordHash],
      );
      return rows[0]?.session_version ?? null;
    },

    /** Signs out every session of the user. Returns the new session version. */
    async bumpSessionVersion(id, executor = db) {
      const { rows } = await executor.query(
        'UPDATE users SET session_version = session_version + 1 WHERE id = $1 RETURNING session_version',
        [id],
      );
      return rows[0]?.session_version ?? null;
    },

    async update(id, { fullName, role, isActive }, executor = db) {
      const { rows } = await executor.query(
        `UPDATE users
         SET full_name = coalesce($2, full_name),
             role = coalesce($3, role),
             is_active = coalesce($4, is_active)
         WHERE id = $1
         RETURNING ${PUBLIC_COLUMNS}`,
        [id, fullName ?? null, role ?? null, isActive ?? null],
      );
      return toUser(rows[0]);
    },

    /** Locks the target user and every active admin, for the last-admin check. */
    async lockForAdminChange(client, id) {
      const { rows } = await client.query(
        `SELECT id, role, is_active FROM users
         WHERE id = $1 OR (role = 'admin' AND is_active)
         ORDER BY id FOR UPDATE`,
        [id],
      );
      return rows.map((r) => ({ id: Number(r.id), role: r.role, isActive: r.is_active }));
    },

    async create({ email, passwordHash, fullName, role }) {
      const { rows } = await db.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING ${PUBLIC_COLUMNS}`,
        [email, passwordHash, fullName, role],
      );
      return toUser(rows[0]);
    },

    async list() {
      const { rows } = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY id`);
      return rows.map(toUser);
    },

    async recordLogin(id) {
      await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
    },
  };
}

// Data access for the users table. All queries are parameterized.
// password_hash is only ever selected by findByEmailWithHash, which is used for login.

const PUBLIC_COLUMNS =
  'id, email, full_name, role, is_active, last_login_at, created_at, updated_at';

function toUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
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
        `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE email = $1`,
        [email],
      );
      if (!rows[0]) return null;
      return { ...toUser(rows[0]), passwordHash: rows[0].password_hash };
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

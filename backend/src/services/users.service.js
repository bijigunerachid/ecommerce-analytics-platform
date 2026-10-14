import bcrypt from 'bcryptjs';
import { PG_UNIQUE_VIOLATION } from '../db/pg-errors.js';
import { withTransaction } from '../db/transaction.js';
import { HttpError, conflict, notFound } from '../utils/http-error.js';

const selfChange = (message) => new HttpError(409, 'SELF_CHANGE_NOT_ALLOWED', message);

export function createUsersService({ db, usersRepository, bcryptRounds }) {
  return {
    /**
     * Creates a staff account. Input must already be validated (see validation/users.schemas.js).
     */
    async createUser({ email, password, fullName, role }) {
      const passwordHash = await bcrypt.hash(password, bcryptRounds);
      try {
        return await usersRepository.create({ email, passwordHash, fullName, role });
      } catch (err) {
        if (err.code === PG_UNIQUE_VIOLATION && err.constraint === 'users_email_unique') {
          throw conflict('A user with this email already exists');
        }
        throw err;
      }
    },

    listUsers() {
      return usersRepository.list();
    },

    /**
     * Changes another user's name, role, or active state. Admins cannot change their own role or
     * deactivate themselves, and the last active admin cannot be demoted or deactivated, so the
     * system always keeps an administrator. Deactivating ends the user's sessions.
     * @returns {{ before: object, after: object }}
     */
    async updateUser(actor, id, changes) {
      if (id === actor.id && (changes.role !== undefined || changes.isActive !== undefined)) {
        throw selfChange('You cannot change your own role or deactivate yourself');
      }
      return withTransaction(db, async (client) => {
        const locked = await usersRepository.lockForAdminChange(client, id);
        const target = locked.find((u) => u.id === id);
        if (!target) throw notFound('User not found');

        const before = await usersRepository.findById(id);
        const losesAdmin =
          target.role === 'admin' &&
          target.isActive &&
          (changes.role === 'analyst' || changes.isActive === false);
        const activeAdmins = locked.filter((u) => u.role === 'admin' && u.isActive).length;
        if (losesAdmin && activeAdmins <= 1) {
          throw new HttpError(409, 'LAST_ADMIN', 'At least one active administrator is required');
        }

        const after = await usersRepository.update(id, changes, client);
        if (changes.isActive === false && before.isActive) {
          await usersRepository.bumpSessionVersion(id, client);
        }
        return { before, after };
      });
    },

    /** Sets a new password for another user and ends all of their sessions. */
    async resetPassword(actor, id, password) {
      if (id === actor.id) {
        throw selfChange('Change your own password from your account page');
      }
      const passwordHash = await bcrypt.hash(password, bcryptRounds);
      const sessionVersion = await usersRepository.setPassword(id, passwordHash);
      if (sessionVersion === null) throw notFound('User not found');
      return usersRepository.findById(id);
    },
  };
}

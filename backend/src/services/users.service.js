import bcrypt from 'bcryptjs';
import { PG_UNIQUE_VIOLATION } from '../db/pg-errors.js';
import { conflict } from '../utils/http-error.js';

export function createUsersService({ usersRepository, bcryptRounds }) {
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
  };
}

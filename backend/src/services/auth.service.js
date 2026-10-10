import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { unauthorized } from '../utils/http-error.js';

const JWT_ALGORITHM = 'HS256';
const INVALID_CREDENTIALS = 'Invalid email or password';

export function createAuthService({ usersRepository, jwtSecret, tokenTtlSeconds, bcryptRounds }) {
  // Compared against when the email does not exist, so a login attempt takes the same time
  // whether or not the account exists (prevents user enumeration by timing).
  const dummyHash = bcrypt.hashSync('timing-equalization-placeholder', bcryptRounds);

  function issueToken(user) {
    return jwt.sign({ role: user.role }, jwtSecret, {
      algorithm: JWT_ALGORITHM,
      subject: String(user.id),
      expiresIn: tokenTtlSeconds,
    });
  }

  return {
    async login(email, password) {
      const user = await usersRepository.findByEmailWithHash(email);
      const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);

      if (!user || !passwordMatches || !user.isActive) {
        throw unauthorized(INVALID_CREDENTIALS);
      }

      await usersRepository.recordLogin(user.id);
      const { passwordHash: _omit, ...publicUser } = user;
      return { user: publicUser, token: issueToken(publicUser) };
    },

    /**
     * Verifies the token and reloads the user, so deactivating a user or changing their role
     * takes effect immediately rather than when the token expires.
     * @returns the current user, or null if the token is invalid or the user is inactive.
     */
    async authenticate(token) {
      let payload;
      try {
        payload = jwt.verify(token, jwtSecret, { algorithms: [JWT_ALGORITHM] });
      } catch {
        return null;
      }
      const user = await usersRepository.findById(Number(payload.sub));
      return user?.isActive ? user : null;
    },
  };
}

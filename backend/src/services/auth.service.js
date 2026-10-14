import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { HttpError, badRequest, unauthorized } from '../utils/http-error.js';

const JWT_ALGORITHM = 'HS256';
const INVALID_CREDENTIALS = 'Invalid email or password';

export function createAuthService({ usersRepository, jwtSecret, tokenTtlSeconds, bcryptRounds }) {
  // Compared against when the email does not exist, so a login attempt takes the same time
  // whether or not the account exists (prevents user enumeration by timing).
  const dummyHash = bcrypt.hashSync('timing-equalization-placeholder', bcryptRounds);

  // sv = session version: raising the user's version voids every token issued before.
  function issueToken(user, sessionVersion) {
    return jwt.sign({ role: user.role, sv: sessionVersion }, jwtSecret, {
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
      const { passwordHash: _hash, sessionVersion, ...publicUser } = user;
      return { user: publicUser, token: issueToken(publicUser, sessionVersion) };
    },

    /**
     * Verifies the token and reloads the user, so deactivating a user or changing their role
     * takes effect immediately rather than when the token expires. Tokens from before the
     * user's last password change or "sign out other sessions" are rejected.
     * @returns the current user, or null if the token is invalid, revoked, or the user is inactive.
     */
    async authenticate(token) {
      let payload;
      try {
        payload = jwt.verify(token, jwtSecret, { algorithms: [JWT_ALGORITHM] });
      } catch {
        return null;
      }
      const state = await usersRepository.findAuthState(Number(payload.sub));
      if (!state?.user.isActive) return null;
      // Tokens issued before session versions existed carry no sv: they count as version 0.
      if ((payload.sv ?? 0) !== state.sessionVersion) return null;
      return state.user;
    },

    /**
     * Changes the signed-in user's password after checking the current one. Every other session
     * ends; the returned token keeps this one signed in.
     */
    async changePassword(userId, { currentPassword, newPassword }) {
      const user = await usersRepository.findByIdWithHash(userId);
      if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
        throw badRequest('Current password is incorrect', [
          { location: 'body', path: 'currentPassword', message: 'Current password is incorrect' },
        ]);
      }
      if (await bcrypt.compare(newPassword, user.passwordHash)) {
        throw badRequest('Choose a password you have not used for this account', [
          {
            location: 'body',
            path: 'newPassword',
            message: 'Must differ from the current password',
          },
        ]);
      }
      const hash = await bcrypt.hash(newPassword, bcryptRounds);
      const sessionVersion = await usersRepository.setPassword(userId, hash);
      return { token: issueToken(user, sessionVersion) };
    },

    /** Ends every other session of the user; the returned token keeps this one signed in. */
    async revokeOtherSessions(user) {
      const sessionVersion = await usersRepository.bumpSessionVersion(user.id);
      if (sessionVersion === null) throw new HttpError(404, 'NOT_FOUND', 'User not found');
      return { token: issueToken(user, sessionVersion) };
    },

    async updateProfile(userId, { fullName }) {
      return usersRepository.update(userId, { fullName });
    },
  };
}

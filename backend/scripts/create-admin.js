// Creates an administrator account. This is the only way to create the first user;
// there is no public registration. Later users can be created by an admin via POST /api/users.
//
// Usage (from backend/):
//   npm run create-admin -- --email admin@example.com --name "Store Admin"
// The password is read from the ADMIN_PASSWORD environment variable if set, otherwise
// you are prompted for it (input hidden). Add --role analyst to create an analyst instead.
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { getDatabaseConfig } from '../src/config/database.js';
import { createPool } from '../src/db/pool.js';
import { createUsersRepository } from '../src/repositories/users.repository.js';
import { createUsersService } from '../src/services/users.service.js';
import { createUserSchema } from '../src/validation/users.schemas.js';

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let muted = false;
    // Echo the prompt itself, but not the characters typed afterwards.
    rl._writeToOutput = (s) => {
      if (!muted) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function readPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (!process.stdin.isTTY) {
    throw new Error('Set ADMIN_PASSWORD or run in an interactive terminal to be prompted');
  }
  const password = await promptHidden('Password (min 12 characters): ');
  const confirm = await promptHidden('Confirm password: ');
  if (password !== confirm) throw new Error('Passwords do not match');
  return password;
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string', default: 'admin' },
      test: { type: 'boolean', default: false },
    },
  });
  if (!values.email || !values.name) {
    throw new Error('Usage: npm run create-admin -- --email <email> --name "<full name>"');
  }

  const parsed = createUserSchema.safeParse({
    email: values.email,
    fullName: values.name,
    role: values.role,
    password: await readPassword(),
  });
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid input:\n${messages.join('\n')}`);
  }

  const pool = createPool(getDatabaseConfig({ test: values.test }));
  try {
    const usersService = createUsersService({
      usersRepository: createUsersRepository(pool),
      bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,
    });
    const user = await usersService.createUser(parsed.data);
    console.log(`Created ${user.role} account ${user.email} (id ${user.id}).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});

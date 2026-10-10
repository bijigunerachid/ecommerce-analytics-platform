// Creates an administrator account. This is the only way to create the first user;
// there is no public registration. Later users can be created by an admin via POST /api/users.
//
// Usage (from backend/):
//   npm run create-admin             prompts for email, name, and password (works in any shell)
//   node --env-file=../.env scripts/create-admin.js --email admin@example.com --name "Store Admin"
// Windows PowerShell drops the "--" in `npm run create-admin -- --email ...`, so flags cannot be
// passed through npm there; use the prompts or call node directly as above.
// The password is read from ADMIN_PASSWORD if set, otherwise prompted for (input hidden).
// Add --role analyst to create an analyst instead.
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { getDatabaseConfig } from '../src/config/database.js';
import { createPool } from '../src/db/pool.js';
import { createUsersRepository } from '../src/repositories/users.repository.js';
import { createUsersService } from '../src/services/users.service.js';
import { createUserSchema } from '../src/validation/users.schemas.js';

function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

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
  let { email, name } = values;
  if (!email || !name) {
    if (!process.stdin.isTTY) {
      throw new Error(
        'Usage: node scripts/create-admin.js --email <email> --name "<full name>" ' +
          '(or run in an interactive terminal to be prompted)',
      );
    }
    email ||= await prompt('Email: ');
    name ||= await prompt('Full name: ');
  }

  const parsed = createUserSchema.safeParse({
    email,
    fullName: name,
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

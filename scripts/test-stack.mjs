#!/usr/bin/env node
// Runs the smoke and browser end-to-end tests against a separate, throwaway copy of the Docker
// stack, so test records never end up in your development database.
//
//   node scripts/test-stack.mjs                  # up, smoke, e2e, then remove the test stack
//   node scripts/test-stack.mjs --keep           # same, but keep the stack (to rerun or debug)
//   node scripts/test-stack.mjs up               # start the test stack and create its admin
//   node scripts/test-stack.mjs smoke            # run the smoke test against it
//   node scripts/test-stack.mjs e2e [args]       # run Playwright (args go to playwright test)
//   node scripts/test-stack.mjs logs             # recent logs of the test stack
//   node scripts/test-stack.mjs down             # remove the test stack and its volumes
//
// The test stack is Compose project "ecommerce-e2e": its own containers, volumes, network, and
// image tags, with the web app on http://localhost:8081 (E2E_WEB_PORT). It runs next to the
// development stack and reads the same .env. Spark is not started: the tests do not need it,
// as in CI. Add --spark to start it too.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PROJECT = "ecommerce-e2e";
const WEB_PORT = process.env.E2E_WEB_PORT || "8081";
const BASE_URL = `http://localhost:${WEB_PORT}`;
// Throwaway account that exists only in the test stack (the e2e defaults use it too).
const ADMIN = {
  email: "ci.admin@example.com",
  password: "ci-smoke-admin-password",
};

const STACK_ENV = {
  CONTAINER_PREFIX: PROJECT,
  IMAGE_TAG: "e2e",
  WEB_PORT,
  WEB_ORIGIN: BASE_URL,
  POSTGRES_PORT: process.env.E2E_POSTGRES_PORT || "55432",
  KAFKA_PORT: process.env.E2E_KAFKA_PORT || "59092",
  SPARK_UI_PORT: process.env.E2E_SPARK_UI_PORT || "54040",
  // Every run signs in several times from the same IP.
  LOGIN_RATE_LIMIT_MAX: "1000",
};

const args = process.argv.slice(2);
const flags = new Set(
  args.filter((a) => a.startsWith("--") && !a.includes("=")),
);
const positional = args.filter((a) => !flags.has(a));
const command = positional[0] ?? "all";
const rest = positional.slice(1);

function run(
  cmd,
  cmdArgs,
  { cwd = ROOT, env = {}, allowFail = false, capture = false } = {},
) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd,
    env: { ...process.env, ...env },
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    // npx is a .cmd script on Windows, which Node only starts through a shell.
    shell: process.platform === "win32" && cmd === "npx",
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFail) {
    if (capture) process.stderr.write(result.stdout + result.stderr);
    throw new Error(`${cmd} ${cmdArgs.join(" ")} exited with ${result.status}`);
  }
  return result;
}

const compose = (composeArgs, options = {}) =>
  run("docker", ["compose", "-p", PROJECT, ...composeArgs], {
    ...options,
    env: { ...STACK_ENV, ...options.env },
  });

function up() {
  const services = flags.has("--spark")
    ? ["web", "relay", "spark-streaming"]
    : ["web", "relay"];
  console.log(`Starting the test stack (${PROJECT}) on ${BASE_URL}...`);
  compose(["up", "-d", "--build", "--wait", ...services]);
  const created = compose(
    [
      "exec",
      "-T",
      "-e",
      `ADMIN_PASSWORD=${ADMIN.password}`,
      "api",
      "node",
      "scripts/create-admin.js",
      "--email",
      ADMIN.email,
      "--name",
      "Test Admin",
    ],
    { allowFail: true, capture: true },
  );
  const output = `${created.stdout}${created.stderr}`;
  if (created.status === 0) console.log(output.trim());
  else if (/already|exists|in use/i.test(output))
    console.log(`Admin ${ADMIN.email} already exists.`);
  else {
    process.stderr.write(output);
    throw new Error("Could not create the test admin account");
  }
}

function smoke() {
  run("node", ["scripts/smoke-test.mjs", BASE_URL], {
    env: {
      SMOKE_ADMIN_EMAIL: ADMIN.email,
      SMOKE_ADMIN_PASSWORD: ADMIN.password,
    },
  });
}

function e2e(playwrightArgs = []) {
  run("npx", ["playwright", "test", ...playwrightArgs], {
    cwd: new URL("../e2e/", import.meta.url),
    env: {
      E2E_BASE_URL: BASE_URL,
      E2E_ADMIN_EMAIL: ADMIN.email,
      E2E_ADMIN_PASSWORD: ADMIN.password,
    },
  });
}

const logs = () =>
  compose(
    ["logs", "--no-color", "--tail=100", "migrate", "api", "relay", "web"],
    {
      allowFail: true,
    },
  );

function down() {
  console.log(`Removing the test stack (${PROJECT}) and its volumes...`);
  compose(["down", "-v", "--remove-orphans"]);
}

const commands = {
  up,
  smoke,
  e2e: () => e2e(rest),
  logs,
  down,
  ps: () => compose(["ps", "-a"]),
  all() {
    let failed = false;
    try {
      up();
      smoke();
      e2e(rest);
    } catch (error) {
      failed = true;
      console.error(`\n${error.message}`);
      logs();
    }
    if (flags.has("--keep") || failed) {
      console.log(
        `\nThe test stack is still running on ${BASE_URL}. ` +
          "Remove it with: node scripts/test-stack.mjs down",
      );
    } else {
      down();
    }
    if (failed) process.exitCode = 1;
  },
};

if (!commands[command]) {
  console.error(
    `Unknown command "${command}". Use: up, smoke, e2e, logs, ps, down (or none).`,
  );
  process.exit(2);
}
try {
  await commands[command]();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

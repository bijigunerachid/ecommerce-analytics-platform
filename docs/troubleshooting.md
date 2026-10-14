# Troubleshooting

Start with `docker compose ps -a`: every service should be `healthy` (or `Exited (0)` for
`migrate`). Then look at the logs of the one that isn't: `docker compose logs --tail=100 <service>`.

## Startup

**`set POSTGRES_DB in .env` / `set JWT_SECRET in .env` when running Compose**
`.env` is missing or incomplete. Copy it from the example and fill in the secrets (see the
README quick start): `Copy-Item .env.example .env`.

**API exits with `JWT_SECRET must be set and at least 32 characters long` or `…placeholder value`**
Replace `JWT_SECRET` in `.env` with a long random value; the placeholder from `.env.example` is
rejected on purpose.

**Variables in `.env` are ignored, or the first line seems to be missing**
The file was saved with a byte-order mark (BOM). Windows PowerShell 5.1's
`Set-Content -Encoding utf8` adds one. Re-save the file as "UTF-8" (not "UTF-8 with BOM") in VS Code
or Notepad.

**`migrate` exits with an error**
Read `docker compose logs migrate`. If PostgreSQL refused the connection, check that
`POSTGRES_USER`/`POSTGRES_PASSWORD` in `.env` match the ones the database volume was created with:
changing them later does not change an existing database. To start over with the new values,
`docker compose down -v` (deletes all data).

**`port is already allocated` (5432, 9092, 8080, or 4040)**
Another program uses the port. Stop it, or change the published port in `.env`: `POSTGRES_PORT`,
`KAFKA_PORT`, or `WEB_PORT` (for example `WEB_PORT=8081`).

**`Conflict. The container name "/ecommerce-…" is already in use`**
A container from an earlier run still exists. `docker compose down` removes the containers (data
volumes are kept), then start again.

**Docker Desktop runs out of memory, or Spark restarts repeatedly**
The full stack needs about 4 GB of RAM for Docker (Spark alone uses ~1.5 GB). Increase the memory
limit in Docker Desktop → Settings → Resources, or run without Spark:
`docker compose up -d --wait web relay`.

## Signing in

**"Incorrect email or password" for the account you created**
Accounts live in the database the API uses. An account created with `npm run create-admin` on your
machine and one created inside Docker both go to the database named in `.env`, but an account
created with `--test` goes to the test database. List accounts with
`docker compose exec postgres psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "select email, role from users"`.

**Forgot the admin password**
Create another admin (`docker compose exec api node scripts/create-admin.js`) and sign in with it.

**Signed in, but immediately sent back to the sign-in page**
The session cookie was not stored. Use the address the app is served from
(<http://localhost:8080> for Docker, <http://localhost:5173> for development), not the API port.
If you serve the app over HTTPS, set `COOKIE_SECURE=true`; over plain HTTP it must be `false`
(the Docker default).

**"Too many sign-in attempts"**
The login rate limit (`LOGIN_RATE_LIMIT_MAX` per `LOGIN_RATE_LIMIT_WINDOW_MINUTES`) was reached.
Wait, or restart the API to reset it.

## Dashboard and pipeline

**Dashboard shows "No orders in this period" although orders exist**
Analytics come from the Spark job, not directly from the orders table. Check the pipeline health
panel (or `GET /api/pipeline/health`):

- *Outbox relay down or "Waiting to publish" growing*: `docker compose logs relay`. Usually Kafka is
  not healthy yet; the relay retries on its own.
- *Spark streaming down or "not started"*: `docker compose up -d spark-streaming`, then
  `docker compose logs spark-streaming`. The first start takes a minute.
- *Both up*: new events appear within about 10 seconds. Older generated data appears as soon as
  Spark has processed the backlog.

**Spark logs `failOnDataLoss` warnings after topics were deleted or recreated**
Expected in development: the job continues from the offsets that still exist. To reprocess
everything from scratch: `docker compose stop spark-streaming`, remove the checkpoint
(`docker compose run --rm --no-deps --entrypoint bash spark-streaming -c "rm -rf /data/checkpoints"`),
then `docker compose run --rm spark-rebuild` and start the stream again.

**Aggregates look wrong after changing analytics code**
Recompute them from the Parquet history:
`docker compose stop spark-streaming; docker compose run --rm spark-rebuild; docker compose start spark-streaming`.

**`npm run generate-data` says the database already has products**
The generator only fills an empty database, so it never mixes synthetic data with yours. Reset
with `docker compose down -v` (deletes everything) or use a fresh database.

**Live activity says "Reconnecting…" or notifications don't arrive**
The browser retries on its own every few seconds. Check `docker compose logs api` for
`Event hub` errors (the API could not `LISTEN` on PostgreSQL). Behind another reverse proxy,
make sure `/api/stream` is not buffered and its read timeout is longer than 25 seconds.

## Development

**Backend tests fail with `ECONNREFUSED 127.0.0.1:5432` or Kafka timeouts**
Start the infrastructure first: `docker compose up -d postgres kafka`, then
`npm run migrate:test` in `backend/`.

**Kafka clients hang on Windows when using `localhost`**
`localhost` resolves to IPv6 (`::1`) first while Docker publishes on IPv4. The backend's Kafka
client already forces IPv4; if you write your own client, use `127.0.0.1:9092`.

**`npm install` asks to approve install scripts**
npm 11 requires approving packages with install scripts. The approved ones are listed in each
`package.json` under `allowScripts` (`@confluentinc/kafka-javascript`, `esbuild`); run
`npm install-scripts ls` to review.

**PowerShell drops command-line flags passed through `npm run`**
Windows PowerShell removes the `--` in `npm run <script> -- --flag`. Call the script with Node
directly, for example `node --env-file=../.env scripts/create-admin.js --email … --name "…"`.

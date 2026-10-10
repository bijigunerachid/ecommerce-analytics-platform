#!/bin/sh
# Runs once, on first container start with an empty data volume.
# Creates a separate database for automated tests so tests never touch development data.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "CREATE DATABASE \"${POSTGRES_TEST_DB}\" OWNER \"${POSTGRES_USER}\";"

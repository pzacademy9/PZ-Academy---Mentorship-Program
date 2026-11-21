#!/usr/bin/env bash
# Proves a backup can really be restored. Runs against a throwaway Postgres
# (never your live database) and checks that real rows come back.
# Needs: RESTORE_DB_URL (the throwaway database) and BACKUP_PASSPHRASE.
set -euo pipefail

dir="${1:-backup-out}"
: "${RESTORE_DB_URL:?RESTORE_DB_URL is not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"

public_gpg="$(ls "$dir"/pz-public-*.dump.gpg | head -n 1)"
auth_gpg="$(ls "$dir"/pz-auth-users-*.dump.gpg | head -n 1)"

decrypt() {
  printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback \
    --passphrase-fd 0 --decrypt --output "$2" "$1"
}
decrypt "$public_gpg" "$dir/public.dump"
decrypt "$auth_gpg" "$dir/auth.dump"

# The scratch database needs the roles and the login table that Supabase provides.
psql "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role authenticator nologin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
SQL

# Some warnings are normal here (the scratch database is not Supabase). Count them, do not stop.
set +e
pg_restore --dbname "$RESTORE_DB_URL" --no-owner --no-privileges "$dir/public.dump" 2> "$dir/restore-errors.txt"
set -e
echo "Restore messages: $(wc -l < "$dir/restore-errors.txt") lines (first 15 below)"
head -n 15 "$dir/restore-errors.txt" || true

people="$(psql "$RESTORE_DB_URL" -Atc "select count(*) from public.pz_people")"
profiles="$(psql "$RESTORE_DB_URL" -Atc "select count(*) from public.profiles")"
echo "Restored rows: pz_people=$people profiles=$profiles"
if [ "$people" -lt 1 ]; then
  echo "Restore check FAILED: no people came back." >&2
  exit 1
fi

# The login-accounts file must at least be readable.
pg_restore --list "$dir/auth.dump" > /dev/null
echo "Restore check passed."

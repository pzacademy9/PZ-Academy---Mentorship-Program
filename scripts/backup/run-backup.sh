#!/usr/bin/env bash
# Takes an encrypted copy of the PZ Academy data.
#   nightly: everything except the bulky tables that can be rebuilt (small, few MB)
#   weekly : everything, including the bulky tables
# Needs: SUPABASE_DB_URL (session pooler address) and BACKUP_PASSPHRASE.
# pg_dump reads the raw data over the wire, so every byte counts as Supabase egress.
# That is why the nightly run skips the bulky tables.
set -euo pipefail

mode="${1:-}"
if [ "$mode" != "nightly" ] && [ "$mode" != "weekly" ]; then
  echo "Usage: run-backup.sh nightly|weekly" >&2
  exit 2
fi
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"

out="backup-out"
stamp="$(date -u +%Y-%m-%d)"
mkdir -p "$out"

# Bulky tables: email queue and metrics, recipient lists, funnel events, lookups.
# Their rows are logs and can be rebuilt. They are saved in the weekly copy only.
bulky=(
  public.email_queue
  public.email_metrics
  public.campaign_recipients
  public.landing_funnel_events
  public.whatsapp_batch_recipients
  public.participant_send_recipients
  public.progress_report_recipients
  public.public_lookup_hits
)

excludes=()
if [ "$mode" = "nightly" ]; then
  for t in "${bulky[@]}"; do
    excludes+=(--exclude-table-data="$t")
  done
fi

public_file="$out/pz-public-$mode-$stamp.dump"
auth_file="$out/pz-auth-users-$mode-$stamp.dump"

# 1. The app data and table structure (public schema). Structure costs almost nothing.
pg_dump "$SUPABASE_DB_URL" \
  --format=custom --compress=9 --no-owner --no-privileges \
  --schema=public "${excludes[@]}" \
  --file "$public_file"

# 2. Login accounts only (not the login history).
pg_dump "$SUPABASE_DB_URL" \
  --format=custom --compress=9 --no-owner --no-privileges --data-only \
  --table=auth.users --table=auth.identities \
  --file "$auth_file"

# 3. Sanity checks: a broken or empty copy must fail the run, so you get an email.
for f in "$public_file" "$auth_file"; do
  size="$(wc -c < "$f")"
  if [ "$size" -lt 2000 ]; then
    echo "Backup file $f is only $size bytes. Something is wrong." >&2
    exit 1
  fi
done
pg_restore --list "$public_file" | grep -q "TABLE DATA public pz_people" \
  || { echo "pz_people data missing from the copy." >&2; exit 1; }
pg_restore --list "$auth_file" | grep -q "TABLE DATA auth users" \
  || { echo "auth.users data missing from the copy." >&2; exit 1; }

# 4. Encrypt, then delete the plain files.
for f in "$public_file" "$auth_file"; do
  printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback \
    --passphrase-fd 0 --symmetric --cipher-algo AES256 --output "$f.gpg" "$f"
  rm -f "$f"
done

echo "Backup ($mode) done:"
ls -l "$out"

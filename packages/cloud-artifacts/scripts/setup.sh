#!/usr/bin/env bash
set -euo pipefail

BUCKET="${BUCKET:-cloud-artifacts}"

echo "==> Creating R2 bucket: $BUCKET"
npx wrangler r2 bucket create "$BUCKET" || echo "(already exists or creation deferred)"

echo "==> Adding lifecycle rule: prefix '7d/' -> expire after 7 days"
npx wrangler r2 bucket lifecycle add "$BUCKET" delete-7d "7d/" --expire-days 7 --force

echo "==> Adding lifecycle rule: prefix '30d/' -> expire after 30 days"
npx wrangler r2 bucket lifecycle add "$BUCKET" delete-30d "30d/" --expire-days 30 --force

# Accept the token on stdin so this can run unattended; fall back to the
# interactive prompt when there is a terminal and nothing was piped in.
echo "==> Setting secret TOKEN"
npx wrangler secret put TOKEN

cat <<'NEXT'

==> Done. Next:

  bun run deploy

That publishes to https://cloud-artifacts.<your-subdomain>.workers.dev and the
Worker returns links on whatever origin it is reached at, so there is nothing
else to configure. Point the CLI at it:

  CLAUDE_ARTIFACTS_URL=https://cloud-artifacts.<your-subdomain>.workers.dev
  CLAUDE_ARTIFACTS_TOKEN=<the token you just set>

A custom domain is optional. If you add one (Dashboard > Workers & Pages >
cloud-artifacts > Settings > Domains & Routes > Add > Custom Domain), links
follow it automatically — no redeploy, no PUBLIC_URL to update.
NEXT

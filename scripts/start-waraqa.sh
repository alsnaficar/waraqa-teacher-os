#!/bin/bash
# Launch Nitro with a clean environment so Cursor agent/landlock env
# vars inherited by PM2 cannot prevent binding to PORT.
set -euo pipefail
cd /root/waraqa-teacher-os
exec env -i \
  HOME=/root \
  USER=root \
  PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  LANG=C.UTF-8 \
  PORT=3000 \
  HOST=0.0.0.0 \
  NODE_ENV=production \
  /usr/bin/node -r dotenv/config .output/server/index.mjs

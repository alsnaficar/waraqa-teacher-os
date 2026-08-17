#!/bin/bash
set -euo pipefail
export HOME=/root
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
cd /root/waraqa-teacher-os
# Ensure pm2 daemon is running in this clean environment
pm2 ping >/dev/null
pm2 delete waraqa >/dev/null 2>&1 || true
pm2 start /root/waraqa-teacher-os/ecosystem.config.cjs
pm2 save --force
sleep 2
ss -tlnp | grep 3000 || true
curl -sI http://127.0.0.1:3000 | head -5 || true
pm2 status

#!/bin/sh
# Copyright (c) 2026 linlisWorkTeam
# SPDX-License-Identifier: MIT
# 文件功能：启动、停止、检查及卸载安装版应用；默认保留配置与运行数据。
set -eu
umask 077
app=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
prefix=${WP_INSTALL_PREFIX:-"$(dirname "$(dirname "$app")")"}
data=${WP_FLYWHEEL_HOME:-"$prefix/data"}
mkdir -p "$data"
export WP_FLYWHEEL_HOME="$data"
export PATH="$app/tools/bin:$app/app/node_modules/.bin:$PATH"
export WP_DSH_BWRAP_BIN="$app/tools/bin/bwrap"
export GIT_EXEC_PATH="$app/tools/git-core"
export LD_LIBRARY_PATH="$app/tools/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export WP_KNOWLEDGE_HOST=${WP_KNOWLEDGE_HOST:-127.0.0.1}
export WP_KNOWLEDGE_PORT=${WP_KNOWLEDGE_PORT:-4310}
export NODE_OPTIONS=${NODE_OPTIONS:---max-old-space-size=384}
config="$data/Configuration.env"
pidfile="$data/server.pid"
case "${1:-status}" in
  start)
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then printf '%s\n' 'Already running'; exit 0; fi
    if [ ! -f "$config" ]; then
      token=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')
      printf 'WP_KNOWLEDGE_WRITE_TOKEN=%s\n' "$token" > "$config"
      chmod 600 "$config"
    fi
    # 隔离能力不可用时明确失败，禁止静默退回无限制进程。
    if ! bwrap --unshare-user --unshare-pid --unshare-net --die-with-parent --ro-bind / / --proc /proc --dev /dev /bin/true 2>"$data/isolation-check.log"; then
      printf '%s\n' "Kernel isolation unavailable. See $data/isolation-check.log. Tasks cannot start." >&2; exit 1
    fi
    cd "$app/app"
    nohup node --env-file="$config" src/interfaces/uiApi/UiApi.ts >> "$data/server.log" 2>&1 &
    printf '%s\n' "$!" > "$pidfile"
    sleep 1
    if ! kill -0 "$(cat "$pidfile")" 2>/dev/null; then printf '%s\n' "Startup failed. See $data/server.log" >&2; exit 1; fi
    printf '%s\n' "Browser: http://$WP_KNOWLEDGE_HOST:$WP_KNOWLEDGE_PORT" "Access token: $config (permission 600; enter its value in the browser)"
    ;;
  stop)
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile")
      # 避免陈旧 PID 误伤其他进程。
      if [ -r "/proc/$pid/cmdline" ] && tr '\0' ' ' < "/proc/$pid/cmdline" | grep -q 'src/interfaces/uiApi/UiApi.ts'; then
        kill "$pid" 2>/dev/null || true
        count=0
        while kill -0 "$pid" 2>/dev/null && [ "$count" -lt 20 ]; do sleep 1; count=$((count + 1)); done
        if kill -0 "$pid" 2>/dev/null; then printf '%s\n' 'Server is still stopping; retry later.' >&2; exit 1; fi
      fi
      rm -f "$pidfile"
    fi
    printf '%s\n' 'Stopped'
    ;;
  status)
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then printf '%s\n' 'RUNNING'; else printf '%s\n' 'STOPPED'; fi
    ;;
  check)
    cd "$app"
    sha256sum --quiet -c Files.sha256
    node --version
    git --version
    bwrap --version
    ;;
  uninstall)
    "$prefix/knowledge" stop
    case "$prefix" in ''|/|/usr|/usr/local|/root|/home) printf '%s\n' 'Unsafe uninstall prefix' >&2; exit 1 ;; esac
    rm -rf "$prefix/versions"
    rm -f "$prefix/current" "$prefix/knowledge"
    printf '%s\n' "Application removed. User data retained: $data"
    ;;
  *) printf '%s\n' 'Usage: knowledge start|stop|status|check|uninstall'; exit 2 ;;
esac

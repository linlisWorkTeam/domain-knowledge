#!/bin/sh
# Copyright (c) 2026 linlisWorkTeam
# SPDX-License-Identifier: MIT
# 文件功能：启动、停止、检查及卸载安装版应用；默认保留配置与运行数据。
set -eu
umask 077
app=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
prefix=${WP_INSTALL_PREFIX:-"$(dirname "$(dirname "$app")")"}
data=${WP_FLYWHEEL_HOME:-"$prefix/data"}
case "$data" in /*) ;; *) printf '%s\n' 'Data directory must be absolute' >&2; exit 2 ;; esac
case "$data" in /|/root|/home|/usr|/usr/local|/opt|/tmp) printf '%s\n' 'Choose a dedicated data directory' >&2; exit 2 ;; esac
if [ -L "$data" ]; then printf '%s\n' 'Data directory cannot be a symbolic link' >&2; exit 2; fi
mkdir -p "$data"
chmod 700 "$data"
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
if [ -L "$config" ] || [ -L "$pidfile" ]; then printf '%s\n' 'Runtime configuration cannot be a symbolic link' >&2; exit 2; fi
# 只操作本数据目录启动的进程，避免陈旧 PID 命中另一个安装实例。
server_running() {
  [ -f "$pidfile" ] || return 1
  pid=$(cat "$pidfile")
  case "$pid" in ''|*[!0-9]*) return 1 ;; esac
  [ -r "/proc/$pid/cmdline" ] || return 1
  [ "$(awk '$1 == "State:" { print $2 }' "/proc/$pid/status")" != Z ] || return 1
  tr '\0' '\n' < "/proc/$pid/cmdline" | grep -Fxq -- "--env-file=$config" || return 1
  kill -0 "$pid" 2>/dev/null
}
case "${1:-status}" in
  start)
    if server_running; then printf '%s\n' 'Already running'; exit 0; fi
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
    if ! server_running; then printf '%s\n' "Startup failed. See $data/server.log" >&2; exit 1; fi
    printf '%s\n' "Browser: http://$WP_KNOWLEDGE_HOST:$WP_KNOWLEDGE_PORT" "Access token: $config (permission 600; enter its value in the browser)"
    ;;
  stop)
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile")
      # 避免陈旧 PID 误伤其他进程。
      if server_running; then
        kill "$pid" 2>/dev/null || true
        count=0
        while server_running && [ "$count" -lt 20 ]; do sleep 1; count=$((count + 1)); done
        if server_running; then printf '%s\n' 'Server is still stopping; retry later.' >&2; exit 1; fi
      fi
      rm -f "$pidfile"
    fi
    printf '%s\n' 'Stopped'
    ;;
  status)
    if server_running; then printf '%s\n' 'RUNNING'; else printf '%s\n' 'STOPPED'; fi
    ;;
  check)
    cd "$app"
    sha256sum --quiet -c Files.sha256
    node app/scripts/release/VerifyBundle.mjs "$app"
    node --version
    git --version
    bwrap --version
    prlimit --version
    node app/node_modules/typescript/bin/tsc --version
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

#!/bin/sh
# Copyright (c) 2026 linlisWorkTeam
# SPDX-License-Identifier: MIT
# 文件功能：离线安装已校验的应用版本；升级保留独立用户数据。
set -eu
umask 077
version='__BUNDLE_VERSION__'
expected='__PAYLOAD_SHA256__'
prefix=${WP_INSTALL_PREFIX:-}
if [ "${1:-}" = '--help' ]; then
  printf '%s\n' 'Usage: sh domain-knowledge-VERSION-linux-x86_64.run [--prefix ABSOLUTE_PATH]'
  exit 0
fi
if [ "${1:-}" = '--prefix' ]; then prefix=${2:?Missing installation prefix}; shift 2; fi
if [ "$#" -ne 0 ]; then printf '%s\n' 'Unexpected installer argument' >&2; exit 2; fi
# 显式目录安装与 --help 不依赖登录环境，适用于清空环境变量的离线验收。
if [ -z "$prefix" ]; then prefix="${HOME:?Set HOME or pass --prefix}/.local/share/domain-knowledge"; fi
case "$prefix" in /*) ;; *) printf '%s\n' 'Installation prefix must be absolute' >&2; exit 2 ;; esac
if [ "$(uname -s)" != Linux ] || [ "$(uname -m)" != x86_64 ]; then printf '%s\n' 'Linux x86_64 is required' >&2; exit 1; fi
if [ ! -r /etc/os-release ] || ! grep -q '^ID="*opencloudos"*' /etc/os-release || ! grep -q '^VERSION_ID="*9.4"*' /etc/os-release; then
  printf '%s\n' 'This bundle supports OpenCloudOS 9.4 only.' >&2; exit 1
fi
case "$prefix" in /|/usr|/usr/local|/root|/home|/opt|/tmp) printf '%s\n' 'Choose a dedicated installation directory' >&2; exit 2 ;; esac
if [ -L "$prefix" ] || [ -L "$prefix/versions" ]; then printf '%s\n' 'Installation directory cannot be a symbolic link' >&2; exit 2; fi
if [ -d "$prefix" ] && [ ! -f "$prefix/.knowledge-install" ] && [ -n "$(ls -A "$prefix")" ]; then
  printf '%s\n' 'Choose an empty dedicated installation directory' >&2; exit 2
fi
mkdir -p "$prefix/versions"
chmod 700 "$prefix"
printf '%s\n' 'domain-knowledge installation v1' > "$prefix/.knowledge-install"
if [ -e "$prefix/versions/$version" ]; then printf '%s\n' 'This version already exists; choose another version or installation prefix.' >&2; exit 1; fi
stage=$(mktemp -d "$prefix/.install-XXXXXX")
cleanup() {
  rm -rf "$stage"
  rm -f "$prefix/.current-new-$$" "$prefix/.knowledge-new-$$"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM
line=$(awk '/^__PAYLOAD_BELOW__$/ {print NR + 1; exit}' "$0")
tail -n +"$line" "$0" > "$stage/payload.tar.gz"
actual=$(sha256sum "$stage/payload.tar.gz")
actual=${actual%% *}
if [ "$actual" != "$expected" ]; then printf '%s\n' 'Payload checksum mismatch; installation aborted.' >&2; exit 1; fi
mkdir "$stage/payload"
tar -xzf "$stage/payload.tar.gz" -C "$stage/payload"
(cd "$stage/payload" && sha256sum --quiet -c Files.sha256)
chmod +x "$stage/payload/Knowledge.sh"
LD_LIBRARY_PATH="$stage/payload/tools/lib" "$stage/payload/tools/bin/node" "$stage/payload/app/scripts/release/VerifyBundle.mjs" "$stage/payload" "$version"
if [ -x "$prefix/knowledge" ]; then "$prefix/knowledge" stop; fi
mv "$stage/payload" "$prefix/versions/$version"
ln -s "versions/$version" "$prefix/.current-new-$$"
mv -Tf "$prefix/.current-new-$$" "$prefix/current"
cat > "$prefix/.knowledge-new-$$" <<'LAUNCHER'
#!/bin/sh
set -eu
prefix=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export WP_INSTALL_PREFIX="$prefix"
exec "$prefix/current/Knowledge.sh" "$@"
LAUNCHER
chmod 700 "$prefix/.knowledge-new-$$"
mv -Tf "$prefix/.knowledge-new-$$" "$prefix/knowledge"
printf '%s\n' "Installed $version. Start with: $prefix/knowledge start" 'User data is preserved in data/ unless WP_FLYWHEEL_HOME selects another directory.'
exit 0
__PAYLOAD_BELOW__

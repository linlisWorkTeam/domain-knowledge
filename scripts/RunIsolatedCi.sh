#!/usr/bin/env bash
# Copyright (c) 2026 linlisWorkTeam
# SPDX-License-Identifier: MIT
# 文件功能：仅在临时GitHub runner中，以原用户在委派资源组内运行现有检查。
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != true || "${CI:-}" != true ]]; then
  echo 'CI_RESOURCE_DELEGATION_REQUIRES_GITHUB_RUNNER' >&2
  exit 1
fi

if [[ "${1:-}" == --delegated ]]; then
  shift
  if [[ $# == 0 ]]; then echo 'CI_COMMAND_REQUIRED' >&2; exit 1; fi
  evaluation_group=$(awk -F: '$1 == "0" { print $3 }' /proc/self/cgroup)
  case "$evaluation_group" in
    /system.slice/knowledge-workbench-ci-*.service) ;;
    *) echo 'CI_RESOURCE_DELEGATION_INVALID_UNIT' >&2; exit 1 ;;
  esac
  export WP_EVALUATION_CGROUP_ROOT="/sys/fs/cgroup$evaluation_group"
  # 先将当前命令移到委派组的叶节点，父节点空置后才可启用控制器。
  mkdir "$WP_EVALUATION_CGROUP_ROOT/runner"
  printf '%s\n' "$$" > "$WP_EVALUATION_CGROUP_ROOT/runner/cgroup.procs"
  printf '+memory +pids\n' > "$WP_EVALUATION_CGROUP_ROOT/cgroup.subtree_control"
  exec "$@"
fi

if [[ $# == 0 ]]; then echo 'CI_COMMAND_REQUIRED' >&2; exit 1; fi
script_path=$(realpath "$0")
evaluation_unit="knowledge-workbench-ci-${GITHUB_RUN_ID}-${GITHUB_JOB}-$$"
# systemd只委派本次检查的独立组；检查仍以runner用户运行，不改变宿主祖先的权限。
# --wait传播退出码，--collect和KillMode在任务结束时清理整个临时服务。
exec sudo systemd-run --quiet --wait --pipe --collect --service-type=exec \
  --unit="$evaluation_unit" --property='Delegate=memory pids' --property=KillMode=control-group \
  --uid="$(id -u)" --gid="$(id -g)" --working-directory="$PWD" \
  --setenv="PATH=$PATH" --setenv=CI=true --setenv=GITHUB_ACTIONS=true \
  --setenv="NODE_OPTIONS=${NODE_OPTIONS:-}" \
  /bin/bash "$script_path" --delegated "$@"

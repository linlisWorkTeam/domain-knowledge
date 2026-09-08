<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：说明DSH 方向文档同步复核交接。
-->
# DSH 方向文档同步复核交接

## 目标与约束

用户要求将已经确认的架构方向在文档中全部同步。LangGraph 编排、DSH 直接运行角色；业务契约、工件、独立评测与发布由项目持有。外部先完成底座和 CPU 真实角色范例，再开发七角色闭环，CodeAgent CLI 适配后置。具体实现尚未进入本轮范围。

## 已核实状态

代码基线仍为 `1e826bb`，分支 `docs/contributor-worktree-quickstart`。本轮补齐上一轮遗漏的 README、贡献/开发/运维入口、部署、系统图、源码 README、站点素材说明及前台/API/用例/验收规范。DEV-019 spec-delta 补充 UI 与 API 联动范围；旧正式条款及追踪状态保留现状，目标均标明尚未实施。公司 CLI 的启动说明改为待核对的协议假设。旧报告与 epitaph 未改写，其他 worktree 未操作。

Node 24.13.0 下 Spec 校验通过（17 schemas、7 commands、8 results、51 P0）；component-layout 与 site 契约共 17/17 通过。含本记录的 94 份 Markdown、230 个本地链接及锚点检查通过，git diff --check 通过。外部链接、全量测试、真实模型及公司 CLI 未验证；未提交或推送。详细证据在 DEV-019/evidence.md。

## 待实施与下一步

文档方向已统一；代码仍包含 Pi、固定项目执行器和旧 Provider 接线。下一步是 DEV-019 实施设计：选 CPU 模块与示范角色，核对 DSH 能力，明确配置入口、旧 Run 和固定场景的处置，再实施底座。无需重新讨论已确认的整体方向。首个角色样例不能替代七角色真实闭环或既有语言/权限门槛；公司 CLI 不作为本轮前置条件。DEV-014 与其后续草稿仍只作旧上下文，不据其自动继续旧方案。

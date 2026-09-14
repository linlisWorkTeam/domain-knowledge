<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接 cJSON 真实模型验收失败证据、临时前台与剩余决策。
-->
# cJSON Utils 真实模型验收交接

用户要求先写测试文档，再实际调用真实模型执行端到端。已完成本次有界执行，整体 FAIL，不能称知识飞轮闭环验收通过。计划在 Evaluation.md，结果在 [AgentSpecRepairAndE2E](../reports/AgentSpecRepairAndE2E.md) 首节，含四个批次的完整归因。

更改位于 `/tmp/domain-knowledge-cjson-real`，本地分支 `test/cjson-utils-real-e2e`，基线 `7a9b3bb`，主工作区未修改。修复提供方会话头、TestGen 输出 Schema、Console 失败状态展示；适配回归 4/4、配置 7/7、TestGen 与受控 SDK 9/9，typecheck/Spec/差异检查通过，未重跑全量测试。没有 PR、推送或合并操作。

最终真实运行 `a0a2694c-ada1-491d-a10a-2b75b303f48b` 使用执行代码 `80ac495`、deepseek-v4-flash、七个模型会话。目标为 cJSON v1.7.19 完整 1481 行 Utils。模型生成 24830 字符知识和 1523 行代码，候选 `kv_81dc24535d8a834fee9a6ccf` 未发布。参考生成测试修复前后均 48/49；Check 引用无效导致 FAILED，未执行 Review/Gate。独立复核原实现 18/18，模型代码因缺 stdbool.h 编译失败。不得手改模型产物冒充通过。

证据在 `/root/projects/domain-knowledge/.workpanel/acceptance/2026-09-11-cjson-real/`，含 runtime、全部会话、生成源码、测试、真实监督结果和截图；密钥相关运行配置不得公开。最终四个批次均已结束，计划约定第四个为最后批次，不自动循环到通过。

只读前台 https://ties-charitable-min-elementary.trycloudflare.com/ 转发 127.0.0.1:4311，tmux 为 `cjson-real-console`、`cjson-real-tunnel`。浏览器已核对四批次、实际失败、候选正文及不可发布提示，无脚本错误；原前台和数据未动。隧道/主机结束即失效，停止分别用 `tmux kill-session -t cjson-real-tunnel`、`tmux kill-session -t cjson-real-console`。原始工件公开下载仍受鉴权限制，本地证据完整。

后续决策：固定版本在转义 Patch 路径上的实际行为与标准预期冲突，先明确测试依据；再处理 Check 可验证引用及有限修复、编译诊断进入修订。名称覆盖 14/14 和质量分 91 不能证明知识语义充分。Code/Check 与参考校验在 evaluation 汇合，oracle 节点 COMPLETED 不是参考测试通过。新会话先核对运行状态和源码，避免将本地失败分支或旧受控验收当作当前已发布能力。

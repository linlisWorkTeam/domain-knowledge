<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：记录取消 DocGen 专用入口并合并角色样例的交接。
-->
# DocGen 样例统一入口交接

用户确认移除旧 DocGen prepare/run/check 入口，将固定源码材料和检查能力归到 DocGen 角色目录。工作继续在 domain-knowledge-agent-pr，更新 PR #36，commit 与 GitHub 操作使用 icedblkamericano，不自动合并。

删除 runner 和 application 的 DocgenExample.ts、LangGraph 兼容导出、example:docgen npm 命令和根部 examples/docGen 目录。Composition 仅装配通用 AgentExampleService。固定源码、公开接口与追加指令保存为 docGenAgent/examples/DocGenFixedSourceSample.json；默认 fixture，可用 agent:run --provider dsh 走真实模型。

DocGenReference.ts 的源码摘要、七项参考测试和数据例子检查仅供角色样例测试使用，普通 agent:run 不隐式运行检查。旧四项集成测试迁到 DocGenExample.test.ts，改用通用服务并保留错误、覆盖、引用、Prompt 冻结、DSH 调用审计、CAS、失败和取消断言。移除旧专用返回格式后，以结果信封及源材料摘要验证同样的证据。

本轮按用户约定不运行测试，仅类型、导入/链接、样例源码摘要和文件清单静态检查。没有真实模型调用。最近三篇交接保留，更早的 PR 准备记录归纳到 HistoryEpitaph。

<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：Domain 按领域功能平级组织的交接记录。
-->
# Domain 功能目录调整

用户明确要求去掉 services 目录。agents、workflow、sourceScan、workspace、migration 平级；已有评测、事实关联、正文差异分别放入 evaluation、association、knowledge，同属 Domain。删除 DomainServices 总导出，应用及测试改为直接引用所属模块，领域服务类名称与行为不变。共享实体保留 Domain.ts。

设计同步到 docs/specs/domainFunction 的对应目录，更新开发指南、4+1 视图和目录契约。固定 DocGen 源码提交路径保留，参考测试的路径归一化同步调整。

按用户要求不运行测试或模型；验证限于 TypeScript、文档链接、Schema 字节、固定范例摘要、文件清单和 diff 静态检查。核实 PR #36 已合并，本次从最新 main 创建后续分支与 PR，不自动合并。账号只限本会话，不写入仓库规则。后续按审查意见决定回归范围。

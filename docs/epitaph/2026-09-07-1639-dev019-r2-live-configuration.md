# DEV-019 R2 入口已实现，live 配置待补

- 用户授权进入 T103/T104；#24/#25 已合入 main `9861434`。当前分支 `codex/dev019-docgen-example`、工作区 `/tmp/domain-knowledge-r2`，按 SOP commit/push 并提 PR，不自动合并。
- 已实现 prepare/run/check 和既有教程：固定 structuredMarkdownDiff 源码、7 项参考测试、LangGraph 单 DocGen 开发节点复用生产业务阶段、DSH/快照/信封/CAS、独立 JSON 数据例子检查。只生成示范工件，不运行七角色发布图；示范业务 Run 保持 CREATED，使用专属 runtime。
- 验证：172/172 测试，框架 7/7，类型/Spec 通过；第二工作区 `/tmp/domain-knowledge-r2-repro` 独立 bootstrap，应用功能差异后 prepare 7/7、受控范例回归 4/4。详细证据在 DEV-019/evidence.md。
- live 尝试返回 DOCGEN_LIVE_CONFIGURATION_REQUIRED：当前进程无 DEEPSEEK_API_KEY，项目无 .env.local，示范目录无已验证设置。已询问用户可用的运行目录/凭据文件路径，尚待回复。不要要求用户粘贴 API Key，不读取无关应用凭据充当授权。
- T103/T104 未勾选、R2 live BLOCKED，R3/R4 未开始。受控 SSE/Token 数不是真实模型证据。配置补齐后，在两个独立工作区真实运行并修改指令再运行，独立检查例子且人工核对正文，再记录 Run/session/CAS 摘要。
- 原 `/root/projects/domain-knowledge` 的旧迁移 WIP 和无关 DFX 草稿保持未动；不要重复应用或提交。当前功能不改变 DSH 唯一角色框架、CodeAgent 后置及业务 Gate 边界。

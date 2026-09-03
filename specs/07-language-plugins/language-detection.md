# 语言检测

检测只影响插件选择，不改变领域实体。

1. 对源码快照中的路径和媒体类型收集证据；忽略 vendored、generated、build 目录（策略可配置并固化）。
2. 插件分别返回 `languageId, matchedFiles, evidence, confidenceBasis`；核心不解释扩展名。
3. 明确用户配置优先，但必须有可用插件；多语言仓库按模块拆分并允许多个 languageId。
4. 冲突或无匹配时状态为 `AMBIGUOUS`/`UNSUPPORTED`，要求显式选择或停止，不以 C++ 兜底。

禁止仅用第一文件扩展名猜测；检测结果作为 Artifact 固化，恢复和重跑使用同一结果。验收使用伪语言插件和 C++ 插件，证明核心契约不含 C/C++ 字段。

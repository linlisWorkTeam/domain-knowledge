# C++ 语言插件

状态：Accepted；这是 Adapter 规范，不改变通用契约。

- `languageId=cpp`；识别策略支持 `.c/.cc/.cpp/.cxx` 与头文件，但模块归属由构建证据和用户配置共同确定。
- P0 工具链 Adapter 支持配置化编译器；默认严格编译策略启用 warnings-as-errors，实际命令、版本、环境摘要进入 toolchain fingerprint。
- 构建和测试必须在无网络、只读输入、独立可写工作区的沙箱中执行；限制 wall time、CPU、内存、进程数和输出量，并终止整个进程树。
- 测试结果标准化为 caseId、status、duration、stdout/stderr ArtifactRef；不得向核心返回 AST、宏对象、编译数据库对象或 C++ SDK 类型。
- 符号链接逃逸、`..`、绝对路径、动态加载越界、读取参考源码/门禁测试的尝试均拒绝并审计。
- P0-B 必须以攻击用例验证隔离；未通过时插件保持不可用于生产门禁。

# 教程：新增 HTTP API

## 目标

为一个已有业务能力增加资源化 HTTP 查询接口。

## 开发顺序

1. 在 `specs/10-interfaces/http-api.md` 定义路径、输入、输出、错误和权限边界。
2. 在 `specs/schemas/` 增加或调整 JSON Schema。
3. 在 `src/application/ports/` 定义所需 Port，并在 Application App/Service 中编排用例。
4. 在 `src/infrastructure/` 实现持久化或外部系统 Adapter。
5. 在 `src/interfaces/ui-api/` 和正式 Server 入口接入路由。
6. 增加正常、空结果、非法参数、未授权和 Adapter 失败测试。
7. 更新 `specs/13-verification/traceability-matrix.md`，必要时更新使用、开发或运维文档。

## 验证

```bash
npm run typecheck
npm run validate:specs
npm test
```

入口层只负责解析、鉴权和结果映射，不在 HTTP 层复制领域规则或发布逻辑。

<!--
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：交接前台文案精简与用户确认的免登录部署。
-->
# 界面文案与免登录

用户要求安装 ai-flavor-remover 并从视觉审阅文字，随后指出 Agent 设置写入关闭提示属于过度设计，明确回复“免登陆即可”。已安装 WorkWise 包装版技能；在 /tmp/domain-knowledge-taste 的 feat/taste-console 基于 f1d2d7f 修改界面说明、按钮和重复动态。没有改写知识正文及原始证据。

Server 支持 WP_KNOWLEDGE_NO_LOGIN=1 和 directEditing，前台自动可编辑、新建批次不弹治理令牌。无令牌的直接本机也可编辑；旧 Bearer 方式保留。用户已授权当前公网免登录，不要再次把预览切回只读或要求用户配置治理令牌。跨站浏览器写入、目录范围与密钥脱敏仍有校验。

当前 tmux mvp-console-review 已重启运行源码，启动脚本 /tmp/mvp-frontend-review/start.sh 启用免登录；mvp-console-tunnel 保持原 https://contract-strict-warren-theories.trycloudflare.com。公网能力、目录、发布设置200，authentication=none、directEditing=true。数据仍位于 /root/.local/share/domain-knowledge-mvp/data。没有发起模型请求或重打 v0.2.0。

最终 Console25/25、Server与Site19/19、类型检查通过。前后截图和日志在 /root/projects/domain-knowledge-releases/2026-09-10-console-copy；各页390px无横向溢出，真实截图经过审阅。新测试 SSE 清理挂起已修复，旧文案断言已更新，原截图和1%阈值未放宽。截图中的工作流等待中是旧显示问题，本任务未把它改判为完成。后续集成须使用这个独立工作树；原wxc在途代码不覆盖。沿用ECS低资源限制，重任务串行。

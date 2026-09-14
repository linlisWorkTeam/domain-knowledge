# 模块批次前台部署与真实关联

目标仍 active；PR50保持Draft，未合入或关闭38/50。用户明确所有新增前台需求在50。原 /root/projects/domain-knowledge-wxc 脏树不动；工作树 /tmp/domain-knowledge-workbench，feat/five-stage-workbench。70c6402实现模块批次调度，14a3c8d合并实时图与批次页，5c72fa5关联v3。当前网站/app已切5c72fa5，Console PID22186，tmux mvp-console-review，原tunnel不动，https://contract-strict-warren-theories.trycloudflare.com/ 返回200。发行 /root/projects/domain-knowledge-releases/2026-09-14-workbench-5c72fa5/app；备份pre-deploy-backup。首次备份展开运行目录深层node_modules符号链接，已中断复制、恢复旧服务，只删除本次未完成备份，再以symlinks=True备份并成功切换。原8Run/1卡保留，未导入真实验收DB，work/ljy保留，无其他会话删除。

CI34834932825在5c72全部成功：代码612、Console41、acceptance25。日志/tmp/WorkbenchCi5cPassed.log。本地相关集成15/15、类型和Spec通过；浏览器全量38/41，三个入口/截图修正后3/3，保留断言和截图阈值。必须 npm run test:ui 或 --config Playwright.config.ts（大写），直接npx默认不加载。错误路径生成的3张临时baseline已删除。部署后桌面/390px项目入口、旧知识及无横向溢出只读检查通过，/tmp/WorkbenchDeployed5cBrowser.log，实际截图docs/reports/workbenchScreenshots/ModuleWorkbench*.png；旧截图保留。/tmp/VerifyDeployedWorkbench5c.mjs，/tmp/DeployWorkbench5c.py仅适用本次旧PID，不能直接复用。健康接口是/api/v1/system/capabilities。

前台：Agent提示词/模型服务默认折叠，发布改名知识发布设置，统计左右；评测最新/历史折叠和带用途键值规则；侧栏项目保存恢复、C/C++目录自定义模块；批次模块-日期-序号、手动/频率、同模块租约串行/异模块并行调度、轮次与日志/默认折叠图、5秒刷新保留展开状态；图导航并入批次。新API /workbench-batches，幂等创建/rounds/resume/cancel，原轮次/用量恢复。模型/编译仍全局串行。已验证计数需要末轮成功和发布ID，不把单阶段成功当通过。当前项目仍Git根及已跟踪可识别源码；任意非Git目录/全部文件、自定义TS模块未完成。新批次子页缺固定测试、外部材料、范围配置，仍需项目任务面板完成发布；其他知识页并未全局项目过滤。不要宣称用户所有功能已完成。

真实C++关联v3 stage-40201f75a9cae4744b7007be1e31a3b52c44729647c8763ba31025156790cf79成功：9卡11库内关系0外部，引用片段及CAS摘要大小审计通过。证据原验收发行/associations-v3/stage-86fde3...，旧associations/零关系保留。驱动/tmp/RunCurrentCardAssociationsV3.ts，日志/tmp/CppAssociationsV3.log。v3仅同完整父作用域允许Owner::member，禁止裸名/跨命名空间/前后缀。v1/v2只读不可恢复。旧来源86fde3仍24匹配39未知，真实完整发布未过。部分未知将无直接行为用例、其他平台、publicationVerified=false当作源码无法确认，甚至要求默认Review比较历史；检查WorkbenchReviewPrompt与冻结effectivePrompt/来源材料交接，不能手动删未知或降低门禁。

C reconstruction stage-a113f9cdfda10cad8e4a402a420ba142833a8ff8b20c77891f08020f144c541c已成功1call45852tokens，7卡、接口兼容、行为待测。c-v11-reconstruction/ArtifactAudit.json新增9工件SHA/大小检查通过；重建不等于评测。C可信/固定/来源后续尚未执行。C++旧e6d45可信37/37和固定40/40属于容量修复前冻结引擎；旧e6ec超64候选暂停不可跨指纹resume。NativeFingerprint engine清单只包含列出的执行/领域文件，不是所有src；项目/前台变化未必改指纹，必须实际核对，别猜测或重复重建。原生指纹含绝对路径，部署位置变化需核实。所有真实模型/编译驱动当前终态，无本地模型任务。

剩余：补齐项目和新批次配置语义；真实C/C++当前引擎完整闭环、来源修订、固定可信和最终发布，线上一键/分步；完成后再比较PR38并按用户要求处理38/50。依赖与浏览器已READY，Node24，堆384，模型/构建串行。没有主动搜索或新账户，不泄露配置。

/*
Copyright (c) 2026 linlisWorkTeam
SPDX-License-Identifier: MIT
文件功能：提供小飞轮知识工作台的离线交互原型，仅使用示例数据。
*/
/* 小飞轮 UI/UX 原型。所有内容与操作均为浏览器本地示例，不访问原项目 API。 */
'use strict';

const icons = {
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon:'<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>',
  folder:'<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/>',
  doc:'<path d="M13 3H5v18h14V9Z"/><path d="M13 3v6h6M8 13h8m-8 4h6"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5M5.5 7a7.5 7.5 0 0 1 12-2L20 8M4 16l2.5 3a7.5 7.5 0 0 0 12-2"/>',
  branch:'<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10M18 7a8 8 0 0 1-8 8H6"/>',
  history:'<path d="M3 5v5h5M3.5 10a8.5 8.5 0 1 1 1 7"/><path d="M12 7v5l3 2"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  focus:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  back:'<path d="m10 5-7 7 7 7M3 12h18"/>',
  collapse:'<path d="m8 7 4-4 4 4m-8 10 4 4 4-4M4 12h16"/>',
  expand:'<path d="m8 4 4 4 4-4m-8 16 4-4 4 4M4 12h16"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  link:'<path d="m10 13 4-4m-6 6-2 2a3 3 0 0 1-4-4l5-5a3 3 0 0 1 4 0m2 3a3 3 0 0 1 4 0l5-5a3 3 0 0 0-4-4l-2 2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  diff:'<path d="M5 3h14v18H5ZM8 8h8m-8 8h8m-4-4v8"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
};
function icon(name, cls='') { return `<svg viewBox="0 0 24 24" aria-hidden="true" class="${cls}">${icons[name] || icons.doc}</svg>`; }
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readLocal(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } }
function writeLocal(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Restricted storage does not prevent reading. */ } }

const seededVersions = [
  { id:'a8f72c1', date:'2026-11-02 10:42', type:'incremental', title:'补充版本快照与恢复边界', change:'更新 3 篇文档', level:3 },
  { id:'d39b4e6', date:'2026-11-01 16:28', type:'incremental', title:'完善知识检索与索引说明', change:'新增 2 篇，更新 2 篇', level:2 },
  { id:'7c1e9a2', date:'2026-10-31 14:15', type:'full', title:'生成完整模块知识', change:'新增 5 篇文档', level:1 },
  { id:'2b6d803', date:'2026-10-30 09:36', type:'initial', title:'登记初始知识库', change:'登记 4 篇文档', level:0 },
];

const docs = [
 {id:'overview',group:'项目概览',title:'系统概览',path:'overview.md',overview:true,since:0,description:'从源码到可追溯的领域知识。小飞轮将知识生成、索引、相似度分析与关联编排为一条可观察的流水线。',summary:'项目概览、架构分层与知识流水线的整体职责。',sections:[
  ['系统定位','<p>小飞轮围绕代码仓库构建可持续维护的领域知识库。它把分散的模块说明整理为文档，并通过知识版本快照保留每次生成后的完整阅读上下文。</p><p>核心工作流由四个阶段组成：<strong>生成知识、建立索引、一致性分析与知识关联</strong>。每个阶段记录独立状态、产物与日志。</p>'],
  ['知识生成流程','<div class="flow-diagram" aria-label="生成、索引、相似度分析、关联四阶段流水线"><span class="flow-node">GENERATE</span><span class="flow-arrow">→</span><span class="flow-node">INDEX</span><span class="flow-arrow">→</span><span class="flow-node">SIMILARITY</span><span class="flow-arrow">→</span><span class="flow-node">ASSOCIATE</span></div><table><thead><tr><th>阶段</th><th>主要职责</th><th>产物</th></tr></thead><tbody><tr><td>GENERATE</td><td>分析源码并生成模块知识</td><td>Markdown 领域文档</td></tr><tr><td>INDEX</td><td>扫描文档并登记内容版本</td><td>文档索引与版本记录</td></tr><tr><td>SIMILARITY</td><td>检测内容重复与语义相似</td><td>待确认的一致性结果</td></tr><tr><td>ASSOCIATE</td><td>建立知识间的关联</td><td>可追溯的知识关系</td></tr></tbody></table>'],
  ['架构边界','<p>前端负责浏览、阅读、评审与操作确认；后端负责流水线编排、版本管理与数据持久化。知识文档以 Markdown 保存，目录和正文都应绑定到同一个浏览快照。</p><div class="doc-note"><strong>阅读上下文</strong><br>浏览历史快照只改变当前视图。设为主版本和剪枝是独立的写操作，需要明确确认。</div>'],
  ['继续阅读','<p>了解各模块的职责与行为边界，或查看知识版本如何组织。</p><div class="related-links"><a class="related-link" href="#doc=pipeline" data-doc="pipeline">流水线编排 <span aria-hidden="true">↗</span></a><a class="related-link" href="#doc=versions" data-doc="versions">知识版本快照 <span aria-hidden="true">↗</span></a></div>']
 ]},
 {id:'boundaries',group:'项目概览',title:'模块职责与边界',path:'architecture/boundaries.md',since:0,description:'厘清前端、编排服务与知识存储的责任边界，保持状态与产物的来源明确。',summary:'前端 Vue、FastAPI 编排、SQLite 索引及 Markdown 产物的职责边界。',sections:[['职责分层','<table><thead><tr><th>层</th><th>负责</th><th>交付</th></tr></thead><tbody><tr><td>交互层</td><td>浏览、搜索、确认与阅读</td><td>用户意图</td></tr><tr><td>编排层</td><td>阶段执行与错误处理</td><td>运行状态和任务日志</td></tr><tr><td>知识层</td><td>登记、索引与版本快照</td><td>可追溯的知识产物</td></tr></tbody></table>'],['状态归属','<p>浏览版本是当前界面的阅读状态；主版本由后端维护。前端不应根据选中状态推断后端主版本已经变更。</p>'],['异常边界','<p>搜索失败不阻断已经打开的正文。文档加载失败保留目录；版本切换期间不把旧正文标记成新版本内容。</p>']]},
 {id:'pipeline',group:'流水线编排',title:'编排模块概览',path:'pipeline/pipeline_module.md',overview:true,since:0,description:'以明确的阶段边界组织知识生成任务，追踪每一步的状态、产物与评审结果。',summary:'GENERATE、INDEX、SIMILARITY、ASSOCIATE 四阶段执行编排。',sections:[['阶段模型','<p>流水线按 GENERATE → INDEX → SIMILARITY → ASSOCIATE 顺序运行。每个阶段可以包含自己的子任务、执行日志和产物列表。</p>'],['执行状态','<table><thead><tr><th>状态</th><th>含义</th></tr></thead><tbody><tr><td>PENDING</td><td>等待执行</td></tr><tr><td>RUNNING</td><td>正在执行</td></tr><tr><td>PAUSED</td><td>等待人工评审或继续操作</td></tr><tr><td>SUCCEEDED / FAILED</td><td>执行完成 / 执行失败</td></tr></tbody></table>'],['人工评审','<p>相似度分析结果需要人工确认时，界面应优先展示待处理内容与影响范围。内部流水线 ID 作为次要信息保留。</p>']]},
 {id:'generate',group:'流水线编排',title:'知识生成与产物',path:'pipeline/generate.md',since:1,description:'从模块源码提取事实，生成结构化、可阅读的 Markdown 文档。',summary:'Agent 子进程、模块入口文档、目录索引与生成产物登记。',sections:[['生成输入','<p>输入包括模块范围、源码和已有修订意见。Agent 子进程在指定目录中写入模块知识文档。</p>'],['文档组织','<pre><code>module/\n  module_module.md\n  module/\n    overview.md\n    processes.md\n    index.md</code></pre><p>目录索引与模块入口文档帮助读者建立整体认识，关键过程文档解释具体行为。</p>'],['完成边界','<p>Agent 退出不等于知识库已完成登记。后续索引阶段仍需扫描文档，并记录内容哈希与来源修订。</p>']]},
 {id:'recovery',group:'流水线编排',title:'错误处理与恢复',path:'pipeline/recovery.md',since:1,description:'把失败保留在明确的任务边界中，为重试与人工恢复提供足够上下文。',summary:'错误分类、阶段重试、部分成功与运行日志恢复。',sections:[['可观察的失败','<p>失败信息应关联流水线、阶段和子任务。保留简洁原因、发生时间与相关日志，避免只显示一个通用错误。</p>'],['重试原则','<p>重试前确认输入版本与已产生的副作用。存在产物写入时，不能简单把“重新执行”视为无副作用操作。</p>'],['部分成功','<p>目录加载成功但单篇文档失败时，保留目录并允许重试正文。搜索中一类来源失败时，展示可用结果并说明缺失来源。</p>']]},
 {id:'stages',group:'流水线编排',title:'阶段状态与日志',path:'pipeline/stage-tasks.md',since:1,description:'以阶段为单位追踪任务输出，让执行进度和失败位置能够被快速定位。',summary:'stage-task 输出轮询、日志追加、阶段进度和终态处理。',sections:[['阶段任务','<p>阶段包含执行状态、时间和产物。任务日志按输出顺序追加，终态停止重复请求。</p>'],['界面反馈','<p>运行状态用文字与徽标同时表达。流水线列表中优先显示模块、当前阶段与待评审状态。</p>']]},
 {id:'versions',group:'知识管理',title:'知识版本快照',path:'knowledge/versions.md',overview:true,since:0,description:'在同一个版本上下文中浏览目录与正文，区分历史阅读、主版本设置和恢复操作。',summary:'知识版本快照、mainVersionId、历史只读浏览、恢复与剪枝。',sections:[['快照的职责','<p>知识版本快照固定一次知识库的文件集合与文件内容。用户切换浏览快照后，目录和正文必须来自同一次快照。</p>'],['浏览与主版本','<table><thead><tr><th>动作</th><th>影响</th></tr></thead><tbody><tr><td>浏览版本</td><td>只改变当前阅读上下文</td></tr><tr><td>设为主版本</td><td>改变项目的主版本指向</td></tr><tr><td>恢复到临时目录</td><td>输出指定快照的文件</td></tr><tr><td>剪枝</td><td>删除目标与后继版本记录</td></tr></tbody></table>'],['操作确认','<p>写操作需要明确展示目标版本及其影响。剪枝还需确认删除目标及其后继记录。操作失败时保留对话框与错误信息。</p>']]},
 {id:'indexing',group:'知识管理',title:'文档索引与登记',path:'knowledge/indexing.md',since:1,description:'把文档文件与可检索的知识记录关联起来，保留内容哈希与来源。',summary:'knowledge_versions、card_index、contentHash 和 sourceRevision 登记。',sections:[['登记过程','<p>扫描知识文档目录后，为每篇 Markdown 建立对应的知识版本记录。内容哈希用于识别内容变化，来源修订用于追踪生成依据。</p>'],['数据关联','<pre><code>knowledge_versions\n  cardId / versionId\n  contentHash / sourceRevision / status\n\ncard_index\n  document → searchable record</code></pre>'],['幂等扫描','<p>重复扫描同一状态不应产生无意义的重复登记。工作区未登记或存在变化时，界面应显示明确提醒。</p>']]},
 {id:'restore',group:'知识管理',title:'恢复与剪枝边界',path:'knowledge/restore-prune.md',since:3,description:'区分恢复文件与删除版本记录，为有副作用的操作展示清晰的范围。',summary:'临时目录恢复、版本后继关系、主版本保护与剪枝确认。',sections:[['恢复到临时目录','<p>恢复操作将目标快照输出到临时目录。确认框应展示快照标识，完成后提供实际返回的目录信息。</p>'],['剪枝影响范围','<p>剪枝包含目标与其后继记录。操作前展示完整受影响集合；如果集合包含主版本，应阻止操作并先处理主版本指向。</p>'],['失败处理','<p>确认令牌过期或后端拒绝操作时，对话框保持打开。在原位置展示错误，不把失败呈现为成功通知。</p>']]},
 {id:'search',group:'检索与关联',title:'检索模块概览',path:'search/search_module.md',overview:true,since:1,description:'统一呈现正文与知识卡片的命中，让检索结果始终归属于当前浏览快照。',summary:'知识搜索、正文与卡片合并结果、摘要片段、来源标签。',sections:[['检索范围','<p>查询需要携带当前知识快照标识。同一关键词在不同版本中可能命中不同内容，因此切换版本后应重新计算结果。</p>'],['结果表达','<p>每条结果展示标题、两行摘要与命中来源。正文与卡片命中合并时保留来源信息，避免重复展示同一文档。</p>'],['阅读衔接','<p>点击结果在右侧打开正文，左侧保留搜索词与结果位置。清除搜索后恢复目录展开状态。</p>']]},
 {id:'similarity',group:'检索与关联',title:'一致性与相似度分析',path:'search/similarity.md',since:2,description:'发现重复与相近的知识候选，通过人工确认补足自动判断的边界。',summary:'相似度候选、知识一致性、人工确认与评审状态。',sections:[['候选识别','<p>相似度阶段给出可能重复或表达相近的知识候选。相似并不意味着事实相同，需要结合内容和来源判断。</p>'],['人工确认','<p>评审界面应呈现双方内容、来源与建议关系，并记录确认结果。</p>']]},
 {id:'associations',group:'检索与关联',title:'知识关联与追溯',path:'search/associations.md',since:2,description:'把文档之间的引用与知识关系保留下来，支持从结论回到来源。',summary:'ASSOCIATE 阶段、知识关系、引用和来源追溯。',sections:[['关联目标','<p>知识关联连接不同模块的相关说明，帮助读者从当前文档继续探索。</p>'],['可追溯性','<p>关联应保留来源文档和版本上下文。历史文档中的跳转优先在同一快照中解析。</p>']]},
];
const agentDocs = [
 {id:'runtime-overview',group:'Runtime',title:'运行时概览',path:'runtime/overview.md',overview:true,since:0,description:'管理 Agent 的 observation / action 循环，并为工具执行提供受控的生命周期。',summary:'Agent runtime、工具执行循环、状态管理与观测。',sections:[['执行循环','<p>运行时接收模型动作，校验工具参数，执行工具后将 observation 返回给模型。每一步保留关联的任务标识。</p>'],['边界与职责','<p>模型负责提出动作；运行时负责校验、执行、取消与记录。工具错误作为结构化结果返回。</p>']]},
 {id:'tools',group:'Runtime',title:'工具执行契约',path:'runtime/tools.md',since:0,description:'定义工具参数、返回值与超时约束。',summary:'Tool runtime、参数校验、超时、重试与业务幂等。',sections:[['参数校验','<p>执行前校验参数类型和必填项。错误反馈指出可修正的字段，避免盲目重试。</p>'],['重试与取消','<p>为超时与限流设置有上限的重试。写操作依靠业务幂等标识避免重复副作用。</p>']]},
 {id:'memory',group:'上下文管理',title:'状态与记忆',path:'context/memory.md',since:1,description:'把单次运行状态、会话上下文与长期记忆分别管理。',summary:'State、context、memory 的归属、有效期与检索边界。',sections:[['状态生命周期','<p>运行状态表示当前任务进展；上下文是本次模型调用可见的信息；长期记忆需要独立的写入、更新与检索策略。</p>'],['检索策略','<p>检索只引入与当前任务相关的信息，并保留来源。记忆命中需要与当前状态重新核对。</p>']]},
];

const revisions = {
  overview:['知识文档按工作区目录组织，阅读使用当前文件内容。','知识文档在索引阶段登记，目录与正文保留来源记录。','知识检索支持正文与卡片来源，并绑定当前浏览版本。','目录与正文绑定同一快照；浏览历史不改主版本，恢复输出到临时目录。'],
  versions:['历史知识以登记记录保留。','浏览版本与项目主版本分开维护。','目录与正文统一按所选知识快照读取。','恢复到临时目录与剪枝采用独立确认；剪枝展示目标及后继范围。'],
};
const state = {page:'knowledge',project:'flywheel',version:'a8f72c1',doc:'overview',query:'',focus:false,searching:false};
const scrollPositions = new Map();
const folderState = new Map();
let catalogScroll = 0, searchTimer, toastTimer, pendingAction = null;
const scrollKey = () => `${state.project}:${state.version}:${state.doc}`;
const projectName = () => state.project === 'agent' ? 'agent-runtime' : 'domain-knowledge';
const currentDocs = () => state.project === 'agent' ? agentDocs : docs;
const localKey = () => `flywheel-prototype-v1:${state.project}`;
function projectData() { const saved=readLocal(localKey(),{}); return {main:typeof saved.main==='string'?saved.main:'a8f72c1',pruned:Array.isArray(saved.pruned)?saved.pruned:[]}; }
function versions() { const removed=projectData().pruned; return seededVersions.filter(v=>!removed.includes(v.id)); }
function currentVersion() { return versions().find(v=>v.id===state.version) || versions()[0]; }
function visibleDocs() { return currentDocs().filter(d=>d.since<=currentVersion().level); }
function currentDoc() { return visibleDocs().find(d=>d.id===state.doc); }
function isMain() { return state.version===projectData().main; }
function showToast(message) { clearTimeout(toastTimer); $('toast').textContent=message; $('toast').hidden=false; toastTimer=setTimeout(()=>$('toast').hidden=true,4200); }
function normalizeRoute() {
  if(!['knowledge','pipelines'].includes(state.page)) state.page='knowledge';
  if(!['flywheel','agent'].includes(state.project)) state.project='flywheel';
  if(!versions().some(v=>v.id===state.version)) state.version=projectData().main;
  if(!versions().some(v=>v.id===state.version)) state.version=versions()[0].id;
  if(!visibleDocs().some(d=>d.id===state.doc)) state.doc=visibleDocs()[0]?.id || '';
}
function readRoute() {
  const p=new URLSearchParams(location.search);
  state.page=p.get('page')||'knowledge';state.project=p.get('project')||'flywheel';
  state.version=p.get('version')||projectData().main;
  state.doc=p.get('doc')||readLocal(`flywheel-last-doc:${state.project}`,state.project==='agent'?'runtime-overview':'overview');
  state.query=p.get('q')||'';
  normalizeRoute();
}
function rememberScroll() { scrollPositions.set(scrollKey(),$('reader-scroll').scrollTop); }
function updateUrl(replace=false) {
  const u=new URL(location.href);u.search='';u.hash='';
  u.searchParams.set('page',state.page);u.searchParams.set('project',state.project);
  if(state.page==='knowledge') {u.searchParams.set('version',state.version);u.searchParams.set('doc',state.doc);if(state.query)u.searchParams.set('q',state.query);}
  history[replace?'replaceState':'pushState']({flywheel:true},'',u);
}
function navigate(patch,{replace=false,mobile=false}={}) {
  rememberScroll();Object.assign(state,patch);normalizeRoute();updateUrl(replace);render();
  if(mobile) $('workbench').classList.add('mobile-reading');
}
function render() {
  document.title=`${state.page==='knowledge'?'知识库':'流水线'} · 小飞轮`;
  document.querySelectorAll('[data-page]').forEach(a=>{ if(a.closest('.topnav')) {if(a.dataset.page===state.page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');} });
  $('project-select').value=state.project;
  $('page-title').textContent=state.page==='knowledge'?'知识库':'流水线';
  $('page-eyebrow').textContent=state.page==='knowledge'?'KNOWLEDGE WORKSPACE':'PIPELINE WORKSPACE';
  $('page-description').textContent=state.page==='knowledge'?'让代码里的知识，持续生长。':'从源码出发，看见每一步。';
  $('knowledge-view').hidden=state.page!=='knowledge';$('pipelines-view').hidden=state.page!=='pipelines';
  if(state.page==='pipelines'){renderPipelines();return;}
  $('current-version').textContent=state.version;
  $('version-status').textContent=isMain()?'主版本':'历史 · 只读';
  $('version-status').className=`pill ${isMain()?'success':'warning'}`;
  $('return-main').hidden=isMain();
  $('catalog-count').textContent=`${visibleDocs().length} 篇文档`;
  $('search-input').value=state.query;
  $('workbench').classList.toggle('focus-mode',state.focus);
  $('focus-button').innerHTML=icon(state.focus?'collapse':'focus');
  $('focus-button').setAttribute('aria-label',state.focus?'退出专注阅读':'专注阅读');
  $('focus-button').title=state.focus?'退出专注阅读':'专注阅读';
  $('focus-button').setAttribute('aria-pressed',String(state.focus));
  $('catalog-footer-text').textContent=isMain()?'当前版本已登记':'历史快照 · 只读浏览';
  renderCatalog();renderDocument();
}
function renderCatalog() {
  const list=visibleDocs(),container=$('catalog-content');
  $('catalog-title').textContent=state.query?'搜索结果':'文档目录';
  $('clear-search').hidden=!state.query;$('collapse-folders').hidden=!!state.query;
  if(state.searching) {
    $('catalog-counter').textContent='检索中';container.innerHTML='<div class="loading-state" role="status" aria-label="正在搜索"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';return;
  }
  if(state.query) {
    const query=state.query.toLocaleLowerCase();
    const results=list.map(doc=>{
      const bodyText=doc.sections.map(s=>s[0]+' '+s[1].replace(/<[^>]*>/g,' ')).join(' ');
      const bodyMatch=(doc.title+' '+doc.description+' '+bodyText).toLocaleLowerCase().includes(query);
      const cardMatch=doc.summary.toLocaleLowerCase().includes(query);
      return {doc,bodyText,bodyMatch,cardMatch};
    }).filter(r=>r.bodyMatch||r.cardMatch);
    $('catalog-counter').textContent=`${results.length} 条`;
    const bodyCount=results.filter(r=>r.bodyMatch).length,cardCount=results.filter(r=>r.cardMatch).length;
    container.innerHTML=`<div class="search-scope">当前版本 <code>${state.version}</code><br>正文 ${bodyCount} · 卡片 ${cardCount}</div>`+(results.length?results.map(({doc,bodyText,bodyMatch,cardMatch})=>{
      const text=bodyMatch?doc.description+' '+bodyText:doc.summary;
      const idx=text.toLocaleLowerCase().indexOf(query),start=Math.max(0,idx-24);
      const snippet=(start?'…':'')+text.slice(start,start+130);
      return `<button class="search-result" data-open-doc="${doc.id}" ${state.doc===doc.id?'aria-current="page"':''}><span class="result-title">${icon('doc')}${highlight(doc.title,state.query)}</span><span class="result-snippet">${highlight(snippet,state.query)}</span><span class="result-meta"><span>${escapeHtml(doc.group)}</span><span class="pill neutral">${[bodyMatch?'正文':'',cardMatch?'卡片':''].filter(Boolean).join(' · ')}</span></span></button>`;
    }).join(''):`<div class="empty-state">${icon('search')}<strong>没有找到匹配内容</strong><p>试试模块名或关键概念，<br>也可以清除搜索返回目录。</p><button class="button" data-action="clear-search">返回目录</button></div>`);
  } else {
    $('catalog-counter').textContent=String(list.length);
    const groups=[...new Set(list.map(d=>d.group))];
    container.innerHTML=groups.map(group=>{
      const groupDocs=list.filter(d=>d.group===group), key=`${state.project}:${group}`;
      return `<details class="folder" data-group="${escapeHtml(key)}" ${folderState.get(key)!==false?'open':''}><summary>${icon('chevron','chevron')}${icon('folder','folder-icon')}<span>${escapeHtml(group)}</span><span class="folder-count">${groupDocs.length}</span></summary>${groupDocs.map(d=>`<button class="doc-row" data-open-doc="${d.id}" title="${escapeHtml(d.title)}" ${state.doc===d.id?'aria-current="page"':''}>${icon('doc')}<span class="doc-title">${escapeHtml(d.title)}</span>${d.overview?'<span class="overview-tag">概览</span>':''}</button>`).join('')}</details>`;
    }).join('');
    container.querySelectorAll('details').forEach(el=>el.addEventListener('toggle',()=>folderState.set(el.dataset.group,el.open)));
  }
  container.scrollTop=catalogScroll;
}
function highlight(text,query) {
  if(!query)return escapeHtml(text);
  const lower=text.toLocaleLowerCase(),needle=query.toLocaleLowerCase();let result='',start=0,index;
  while((index=lower.indexOf(needle,start))!==-1) {result+=escapeHtml(text.slice(start,index))+'<mark>'+escapeHtml(text.slice(index,index+query.length))+'</mark>';start=index+query.length;}
  return result+escapeHtml(text.slice(start));
}
function revisionText(doc,version=currentVersion()) {
  return revisions[doc.id]?.[version.level] || doc.summary;
}
function priorVersion(doc) {return versions().filter(v=>v.level<currentVersion().level&&v.level>=doc.since)[0];}
function renderDocument() {
  const doc=currentDoc();if(!doc)return;
  const version=currentVersion();
  $('reader-breadcrumb').textContent=`${doc.group} / ${doc.title}`;
  $('document').innerHTML=`<div class="doc-kicker"><span>${escapeHtml(projectName())}</span><span>${escapeHtml(doc.group)}</span></div><h2 class="doc-heading">${escapeHtml(doc.title)}</h2><p class="doc-lead">${escapeHtml(doc.description)}</p><div class="doc-metadata"><span>${icon('clock')}${version.date.slice(0,10)} 更新</span><span>${icon('doc')}${escapeHtml(doc.path)}</span><span>${icon('branch')}<code>${state.version}</code></span></div>${doc.sections.map(([title,content],i)=>`<section aria-labelledby="section-${i}"><h3 id="section-${i}">${escapeHtml(title)}</h3>${content}</section>`).join('')}<section><h3>本版记录</h3><p>${escapeHtml(revisionText(doc))}</p></section>`;
  // Links to unavailable documents stay in the selected snapshot and explain the absence.
  $('document-source').textContent=`${doc.path} · ${state.version}`;
  requestAnimationFrame(()=>$('reader-scroll').scrollTop=scrollPositions.get(scrollKey())||0);
  writeLocal(`flywheel-last-doc:${state.project}`,state.doc);
}
function selectDoc(id) {
  catalogScroll=$('catalog-content').scrollTop;
  if(!visibleDocs().some(d=>d.id===id)){showToast('这篇文档尚未出现在当前快照中，可前往版本历史浏览较新版本。');return;}
  navigate({doc:id},{mobile:true});
}
function openDialog(id) { const dialog=$(id);if(!dialog.open)dialog.showModal(); }
function closeDialog(id) { if($(id).open)$(id).close(); }
function renderVersionPanel() {
  const main=projectData().main;
  $('version-timeline').innerHTML=versions().map(v=>`<button class="snapshot-row ${v.id===state.version?'active':''}" data-snapshot="${v.id}" aria-pressed="${v.id===state.version}"><span class="timeline-axis"><span class="snapshot-dot"></span></span><span class="snapshot-copy"><span class="snapshot-top"><code>${v.id}</code>${v.id===main?'<span class="pill success">主版本</span>':v.id===state.version?'<span class="pill neutral">正在浏览</span>':''}</span><span class="snapshot-message">${escapeHtml(v.title)}</span><span class="snapshot-meta">${v.date} · ${v.type}<br>${v.change}</span></span></button>`).join('');
  const scope=pruneScope(state.version),hasMain=scope.some(v=>v.id===main);
  $('version-detail').innerHTML=`<div class="detail-label">当前浏览 <code>${state.version}</code> · ${isMain()?'主版本':'历史版本，仅浏览'}</div><div class="version-action-grid"><button class="button primary" data-version-action="switch" ${isMain()?'disabled':''}>${icon('check')}设为主版本</button><button class="button" data-version-action="restore">恢复到临时目录</button><button class="button danger" data-version-action="prune" ${hasMain?'disabled':''} ${hasMain?'title="删除范围包含主版本，请先将主版本设置到保留的快照"':''}>剪枝</button></div>${hasMain?'<p class="action-help">删除范围包含主版本，暂不可剪枝。</p>':''}`;
}
function pruneScope(id) {const target=versions().find(v=>v.id===id);return target?versions().filter(v=>v.level>=target.level):[];}
function confirmAction(action) {
  pendingAction={action,project:state.project,version:state.version};
  const scope=pruneScope(state.version);
  if(action==='prune'&&scope.some(v=>v.id===projectData().main))return;
  const titles={switch:'设为主版本',restore:'恢复到临时目录',prune:'剪枝知识版本'};
  $('confirm-title').textContent=titles[action];
  $('confirm-description').textContent={switch:'将项目主版本指向当前快照。浏览其他历史版本不会自动改变主版本。',restore:'演示指定快照恢复到临时目录的确认流程；本原型不会创建服务器目录。',prune:'此操作会删除目标版本及其后继记录。请确认下面的完整影响范围。'}[action];
  $('confirm-scope').innerHTML=`项目：${escapeHtml(projectName())}<br>目标快照：<code>${state.version}</code>${action==='prune'?`<br>受影响的 ${scope.length} 个版本：<br>${scope.map(v=>`<code>${v.id}</code>`).join(' · ')}`:''}`;
  $('prune-check-row').hidden=action!=='prune';$('prune-check').checked=false;
  $('confirm-submit').disabled=action==='prune';
  $('confirm-submit').className=`button ${action==='prune'?'danger':'primary'}`;
  $('confirm-submit').textContent=action==='prune'?'确认剪枝':action==='restore'?'演示恢复':titles[action];
  openDialog('confirm-dialog');
}
function executeAction(event) {
  event.preventDefault();if(!pendingAction)return;
  const {action,version,project}=pendingAction;
  if(project!==state.project||version!==state.version){closeDialog('confirm-dialog');showToast('浏览上下文已变化，请重新选择操作。');return;}
  const data=projectData();
  if(action==='switch'){data.main=version;writeLocal(localKey(),data);showToast(`演示：已将 ${version} 设为主版本。`);}
  else if(action==='prune'){
    const scope=pruneScope(version);
    if(!$('prune-check').checked||scope.some(v=>v.id===data.main))return;
    data.pruned=[...new Set([...data.pruned,...scope.map(v=>v.id)])];writeLocal(localKey(),data);
    navigate({version:data.main},{replace:true});showToast(`演示：已删除 ${scope.length} 个本地示例版本，返回主版本。`);
  } else {showToast(`已完成 ${version} 的恢复流程演示；未写入任何目录。`);}
  closeDialog('confirm-dialog');pendingAction=null;render();renderVersionPanel();
}
function showDocHistory() {
  const doc=currentDoc();if(!doc)return;
  $('history-document-name').textContent=doc.path;
  const available=versions().filter(v=>v.level>=doc.since);
  $('document-history-list').innerHTML=available.map(v=>`<div class="history-item"><div><code>${v.id}</code> ${v.id===state.version?'<span class="pill neutral">正在浏览</span>':''}<p>${v.date} · ${escapeHtml(v.title)}</p></div><button class="button" data-history-version="${v.id}" ${v.id===state.version?'disabled':''}>浏览</button></div>`).join('')+`<div class="modal-actions"><button class="button" data-action="compare" ${priorVersion(doc)?'':'disabled'}>${icon('diff')}与上一版对比</button></div>`;
  openDialog('history-dialog');
}
function showDiff() {
  const doc=currentDoc(),previous=doc&&priorVersion(doc);if(!previous)return;
  closeDialog('history-dialog');
  const before=revisionText(doc,previous),after=revisionText(doc);
  $('diff-content').innerHTML=`<div class="diff-meta"><span>${escapeHtml(doc.path)}</span><code>${previous.id}</code>${icon('arrow')}<code>${state.version}</code></div><p class="diff-context">本版记录 · ${before===after?'该段内容未变化':'1 段更新'}</p>${before===after?`<div class="diff-line">${escapeHtml(after)}</div>`:`<div class="diff-line removed">− ${escapeHtml(before)}</div><div class="diff-line added">+ ${escapeHtml(after)}</div>`}<p class="diff-context">对比示例文档的“本版记录”段落。两个快照中其余正文保持一致。</p>`;
  openDialog('diff-dialog');
}
function clearSearch() {clearTimeout(searchTimer);catalogScroll=0;state.searching=false;navigate({query:''});$('search-input').focus();}
function submitSearch(event) {
  event.preventDefault();const query=$('search-input').value.trim();if(!query){clearSearch();return;}
  clearTimeout(searchTimer);catalogScroll=0;state.query=query;state.searching=true;updateUrl();renderCatalog();
  searchTimer=setTimeout(()=>{state.searching=false;renderCatalog();},180);
}
function renderPipelines() {
  const rows=state.project==='agent'?[
    {name:'Runtime 核心模块',id:'PL-20261102-004',status:'SUCCEEDED',statusName:'已完成',stages:4,review:'已通过',tokens:'18.6k',duration:'2m 48s',updated:'10:32'},
    {name:'上下文与记忆模块',id:'PL-20261101-003',status:'PAUSED',statusName:'待评审',stages:2,review:'2 项待确认',tokens:'12.1k',duration:'1m 56s',updated:'昨天 16:18'}
  ]:[
    {name:'知识版本快照',id:'PL-20261102-008',status:'SUCCEEDED',statusName:'已完成',stages:4,review:'已通过',tokens:'24.8k',duration:'3m 12s',updated:'10:42'},
    {name:'检索与关联',id:'PL-20261102-007',status:'RUNNING',statusName:'运行中',stages:2,review:'—',tokens:'16.2k',duration:'2m 08s',updated:'10:38'},
    {name:'流水线编排',id:'PL-20261101-006',status:'PAUSED',statusName:'待评审',stages:2,review:'3 项待确认',tokens:'21.5k',duration:'2m 54s',updated:'昨天 16:28'},
    {name:'完整模块知识',id:'PL-20261031-005',status:'SUCCEEDED',statusName:'已完成',stages:4,review:'已通过',tokens:'42.3k',duration:'5m 36s',updated:'10-31 14:15'},
  ];
  window.pipelineRows=rows;
  $('pipelines-view').innerHTML=`<div class="pipeline-intro"><span>${rows.length} 条流水线 · ${escapeHtml(projectName())}</span><span>示例执行记录</span></div><table class="pipeline-table"><thead><tr><th>模块 / 流水线</th><th>状态</th><th>阶段进度</th><th>评审</th><th>Token · 耗时</th><th>更新时间</th><th>操作</th></tr></thead><tbody>${rows.map((row,i)=>`<tr><td><div class="pipeline-name">${row.name}</div><div class="pipeline-id mono">${row.id}</div></td><td><span class="pill ${row.status==='SUCCEEDED'?'success':row.status==='PAUSED'?'warning':'neutral'}">${row.statusName}</span></td><td><div class="stage-progress" aria-label="已完成 ${row.stages} 个阶段，共 4 个">${[0,1,2,3].map(n=>`<i class="${n<row.stages?'done':n===row.stages&&row.status==='RUNNING'?'running':''}"></i>`).join('')}</div><span class="stage-caption">${['GENERATE','INDEX','SIMILARITY','ASSOCIATE'][Math.min(row.stages,3)]} ${row.stages===4?'· 完成':''}</span></td><td>${row.review}</td><td>${row.tokens}<br><span class="stage-caption">${row.duration}</span></td><td class="muted">${row.updated}</td><td><button class="button subtle" data-pipeline="${i}">查看摘要 ${icon('chevron')}</button></td></tr>`).join('')}</tbody></table><div class="pipeline-footnote">本版聚焦知识库工作台。此处为流水线导航与列表样式示例，原项目详情页需接入后保留。</div>`;
}
function showPipeline(index) {
  const row=window.pipelineRows?.[index];if(!row)return;
  $('pipeline-summary').innerHTML=`<dl class="pipeline-summary-grid"><dt>模块</dt><dd>${row.name}</dd><dt>流水线</dt><dd><code>${row.id}</code></dd><dt>状态</dt><dd>${row.statusName}</dd><dt>阶段</dt><dd>${row.stages} / 4 已完成</dd><dt>评审</dt><dd>${row.review}</dd><dt>Token / 耗时</dt><dd>${row.tokens} / ${row.duration}</dd></dl><p class="demo-notice">示例执行记录。本原型未连接后端，也不执行流水线任务。</p>`;
  openDialog('pipeline-dialog');
}
function applyTheme(theme) {
  document.documentElement.dataset.theme=theme;writeLocal('flywheel-ui-theme',theme);
  $('theme-button').innerHTML=icon(theme==='dark'?'sun':'moon');
  $('theme-button').setAttribute('aria-label',theme==='dark'?'切换浅色主题':'切换深色主题');
}

// Delegated navigation keeps document links, result rows and version actions consistent.
document.addEventListener('click',event=>{
  const target=event.target.closest('button,a');if(!target)return;
  if(target.dataset.page){event.preventDefault();navigate({page:target.dataset.page});}
  else if(target.dataset.openDoc)selectDoc(target.dataset.openDoc);
  else if(target.dataset.doc){event.preventDefault();selectDoc(target.dataset.doc);}
  else if(target.dataset.snapshot){navigate({version:target.dataset.snapshot});renderVersionPanel();$('version-timeline').querySelector(`[data-snapshot="${state.version}"]`)?.focus({preventScroll:true});}
  else if(target.dataset.versionAction)confirmAction(target.dataset.versionAction);
  else if(target.dataset.close)closeDialog(target.dataset.close);
  else if(target.dataset.historyVersion){closeDialog('history-dialog');navigate({version:target.dataset.historyVersion},{mobile:true});}
  else if(target.dataset.action==='clear-search')clearSearch();
  else if(target.dataset.action==='compare')showDiff();
  else if(target.dataset.pipeline!==undefined)showPipeline(Number(target.dataset.pipeline));
});
$('theme-button').addEventListener('click',()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
$('project-select').addEventListener('change',()=>{
  rememberScroll();clearTimeout(searchTimer);state.searching=false;state.project=$('project-select').value;
  state.version=projectData().main;state.doc=readLocal(`flywheel-last-doc:${state.project}`,'');state.query='';catalogScroll=0;
  normalizeRoute();updateUrl();render();$('workbench').classList.remove('mobile-reading');
});
$('refresh-button').addEventListener('click',()=>{
  $('refresh-button').disabled=true;$('refresh-button').innerHTML=icon('refresh')+'刷新中';
  setTimeout(()=>{render();$('refresh-button').disabled=false;$('refresh-button').innerHTML=icon('refresh')+'刷新';showToast('示例数据已刷新，阅读位置已保留。');},250);
  rememberScroll();
});
$('versions-button').addEventListener('click',()=>{renderVersionPanel();openDialog('version-dialog');});
$('return-main').addEventListener('click',()=>navigate({version:projectData().main}));
$('search-form').addEventListener('submit',submitSearch);
$('search-input').addEventListener('search',()=>{if(!$('search-input').value)clearSearch();});
$('clear-search').addEventListener('click',clearSearch);
$('catalog-content').addEventListener('scroll',()=>catalogScroll=$('catalog-content').scrollTop,{passive:true});
$('reader-scroll').addEventListener('scroll',rememberScroll,{passive:true});
let foldersCollapsed=false;
$('collapse-folders').addEventListener('click',()=>{
  foldersCollapsed=!foldersCollapsed;
  $('catalog-content').querySelectorAll('details').forEach(el=>{el.open=!foldersCollapsed;folderState.set(el.dataset.group,el.open);});
  $('collapse-folders').innerHTML=icon(foldersCollapsed?'expand':'collapse');
  $('collapse-folders').title=foldersCollapsed?'展开所有目录':'折叠所有目录';
  $('collapse-folders').setAttribute('aria-label',$('collapse-folders').title);
});
$('focus-button').addEventListener('click',()=>{rememberScroll();state.focus=!state.focus;render();$('workbench').classList.add('mobile-reading');});
$('mobile-back').addEventListener('click',()=>{state.focus=false;$('workbench').classList.remove('mobile-reading','focus-mode');$('search-input').focus();});
$('doc-history-button').addEventListener('click',showDocHistory);
$('prune-check').addEventListener('change',()=>$('confirm-submit').disabled=!$('prune-check').checked);
$('confirm-form').addEventListener('submit',executeAction);
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
document.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]'))return;
  if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)&&state.page==='knowledge'){
    event.preventDefault();state.focus=false;$('workbench').classList.remove('mobile-reading','focus-mode');$('search-input').focus();
  }
  if(event.key==='Escape'&&state.page==='knowledge'){
    if(state.query||$('search-input').value){event.preventDefault();clearSearch();}
    else if(state.focus){state.focus=false;render();}
    else if(matchMedia('(max-width:1023px)').matches){$('workbench').classList.remove('mobile-reading');$('search-input').focus();}
  }
});
window.addEventListener('popstate',()=>{rememberScroll();clearTimeout(searchTimer);state.searching=false;readRoute();render();if(matchMedia('(max-width:1023px)').matches)$('workbench').classList.add('mobile-reading');});

$('project-icon').innerHTML=icon('folder');$('branch-icon').innerHTML=icon('branch');$('search-icon').innerHTML=icon('search');
$('breadcrumb-icon').innerHTML=icon('doc');$('refresh-button').innerHTML=icon('refresh')+'刷新';
$('versions-button').innerHTML=icon('history')+'版本历史'+icon('down');
$('doc-history-button').innerHTML=icon('history')+'文档历史';
$('collapse-folders').innerHTML=icon('collapse');$('mobile-back').innerHTML=icon('back');
document.querySelectorAll('button[data-close]').forEach(button=>{if(button.classList.contains('icon-button'))button.innerHTML=icon('close');});
applyTheme(readLocal('flywheel-ui-theme',matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));
const initialDeepLink=new URLSearchParams(location.search).has('doc');
readRoute();updateUrl(true);render();
if(initialDeepLink&&matchMedia('(max-width:1023px)').matches)$('workbench').classList.add('mobile-reading');

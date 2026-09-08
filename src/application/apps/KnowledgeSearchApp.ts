/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调知识检索应用用例及其依赖的领域规则与端口。
 */
import { KnowledgeQueryService } from '../services/QueryService.ts';

/** Public application boundary for knowledge retrieval use cases. */
/** 封装知识检索应用的对外操作与协作依赖。 */
export class KnowledgeSearchApp extends KnowledgeQueryService {}

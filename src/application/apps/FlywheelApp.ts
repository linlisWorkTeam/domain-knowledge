/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：协调Flywheel应用用例及其依赖的领域规则与端口。
 */
import { KnowledgeFlywheelService } from '../services/ApplicationServices.ts';

/**
 * Public application use-case boundary for knowledge lifecycle operations.
 * The inherited service name remains available only as a compatibility surface.
 */
/** 封装Flywheel应用的对外操作与协作依赖。 */
export class FlywheelApp extends KnowledgeFlywheelService {}

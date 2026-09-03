import { KnowledgeFlywheelService } from '../services/index.ts';

/**
 * Public application use-case boundary for knowledge lifecycle operations.
 * The inherited service name remains available only as a compatibility surface.
 */
export class FlywheelApp extends KnowledgeFlywheelService {}

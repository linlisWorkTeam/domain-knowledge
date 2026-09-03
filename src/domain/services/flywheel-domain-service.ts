import {
  createRun, transitionRun, type FlywheelRun, type RunState,
} from '../index.ts';

export const FLYWHEEL_GENERATION_CAPABILITIES = [
  'doc-gen', 'test-gen', 'code',
] as const;

export type FlywheelGenerationCapability = typeof FLYWHEEL_GENERATION_CAPABILITIES[number];

/**
 * Owns the pure lifecycle rules used by the Flywheel application use case.
 * Agent runtimes implement capabilities outside the domain and never enter here.
 */
export class FlywheelDomainService {
  createRun(moduleId: string, policyId: string, now: string): FlywheelRun {
    return createRun(moduleId, policyId, now);
  }

  transition(run: FlywheelRun, next: RunState, now: string): FlywheelRun {
    return transitionRun(run, next, now);
  }

  generationCapabilities(): readonly FlywheelGenerationCapability[] {
    return FLYWHEEL_GENERATION_CAPABILITIES;
  }
}

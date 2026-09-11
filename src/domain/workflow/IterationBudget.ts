/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：统一零基轮次与包含首轮的总轮次预算。
 */
export function canStartIteration(iteration: number, maxIterations: number): boolean {
  return Number.isSafeInteger(iteration) && Number.isSafeInteger(maxIterations)
    && iteration >= 0 && maxIterations >= 1 && iteration < maxIterations;
}

export function canContinueIteration(iteration: number, maxIterations: number): boolean {
  return canStartIteration(iteration, maxIterations) && canStartIteration(iteration + 1, maxIterations);
}

/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：分页读取指定快照及阶段的任务历史。
 */
export async function readStageHistory(request, stage, snapshotId) {
  const items = []; let cursor = null
  do {
    const query = new URLSearchParams({ stage })
    if (snapshotId) query.set('snapshotId', snapshotId)
    if (cursor) query.set('cursor', cursor)
    const page = await request('/api/v1/stage-tasks?' + query)
    items.push(...page.items); cursor = page.nextCursor
  } while (cursor)
  return { items }
}

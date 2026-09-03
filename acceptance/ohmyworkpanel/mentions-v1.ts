import type { Member } from "../types";

export function findMentionedMemberIds(content: string, members: Member[]): string[] {
  const ordered = [...members]
    .filter((member) => member.isActive)
    .sort((left, right) => left.displayName.length - right.displayName.length);
  const ids: string[] = [];
  for (const member of ordered) {
    const escaped = member.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(`(^|\\s)@${escaped}(?=$|\\s|[，。,.!?！？])`);
    if (expression.test(content)) ids.push(member.id);
  }
  return ids;
}

export function currentMentionQuery(content: string): string | null {
  const match = content.match(/@([^\s@]*)$/u);
  return match ? match[1] : null;
}

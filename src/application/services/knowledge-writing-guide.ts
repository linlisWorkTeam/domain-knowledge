const FORMULAIC_PHRASES = [
  /综上所述/g,
  /总而言之/g,
  /值得注意的是/g,
  /需要注意的是/g,
  /毋庸置疑/g,
  /显而易见/g,
  /不难发现/g,
  /随着.{0,24}的发展/g,
  /在当今.{0,24}(?:时代|格局)/g,
  /不断演变的格局/g,
  /(?:赋能|全方位|深度解析)/g,
  /这不仅仅是.{0,80}而是/g,
] as const;

export const KNOWLEDGE_WRITING_GUIDE = {
  locale: 'zh-CN',
  audience: '需要复用这条知识的工程师',
  principles: [
    '开头直接说明结论和适用条件，不写泛泛的背景铺垫。',
    '正文至少使用四个“## ”二级标题，把接口、边界、原因和验证方式拆开写清楚。',
    '用具体接口、命令、数值、失败现象和来源支撑判断。',
    '必须有“## 验证”章节，并给出至少一条可复现的命令、测试路径或证据链接。',
    '解释为什么这样做；不要只罗列步骤或把来源换一种说法。',
    '句子长短自然变化。能用“是”“有”“会”说清楚时，不绕成宣传文案。',
    '保留必要术语、限定条件和不确定性；自然表达不能改写事实。',
  ],
  avoid: [
    '“综上所述”“值得注意的是”“随着……发展”等填充连接词',
    '“至关重要”“赋能”“全方位”“不断演变的格局”等无证据宣传词',
    '机械三段式、连续同构句、过多破折号、表情符号和粗体',
    '“专家认为”“行业报告显示”等没有具体来源的模糊归因',
    '为了显得有观点而编造经历、感受、数字或引用',
  ],
  priority: '事实、来源、验收条件和安全边界高于文风；两者冲突时保留精确表达。',
} as const;

export interface KnowledgeReadabilityAssessment {
  score: number;
  formulaicPhraseCount: number;
  oversizedParagraphCount: number;
}

export function assessKnowledgeReadability(body: string): KnowledgeReadabilityAssessment {
  const formulaicPhraseCount = FORMULAIC_PHRASES.reduce(
    (total, pattern) => total + (body.match(pattern)?.length ?? 0),
    0,
  );
  const oversizedParagraphCount = body
    .split(/\n\s*\n/)
    .filter((paragraph) => {
      const start = paragraph.trimStart().slice(0, 3);
      return start !== '~~~' && start !== String.fromCharCode(96, 96, 96);
    })
    .filter((paragraph) => paragraph.replace(/\s/g, '').length > 420)
    .length;
  const score = Math.max(
    0,
    Math.min(1, 1 - Math.min(0.72, formulaicPhraseCount * 0.12) - Math.min(0.36, oversizedParagraphCount * 0.18)),
  );
  return { score, formulaicPhraseCount, oversizedParagraphCount };
}

const stages = {
  ingest: {
    kicker: '输入 · 来源记录',
    title: '先保存来源，再讨论答案',
    description: '文档、固定提交或项目经验进入内容寻址存储，系统创建候选版本，并保留来源、版本与完整性信息。',
    actor: '工程师 · 知识登记簿 · 内容寻址存储',
    guard: '来源记录与内容摘要',
    output: '候选知识版本',
  },
  generate: {
    kicker: '智能体 · 检查点',
    title: '生成可以重试，副作用不能失控',
    description: '文档生成智能体与代码生成智能体按结构约束交接不可变工件。生成键保证同一节点重放时返回已经提交的结果，不会重复执行。',
    actor: '编排服务 · 文档生成智能体 · 代码生成智能体',
    guard: '结构约束与生成键',
    output: '文档工件与代码工件',
  },
  evaluate: {
    kicker: '证据 · 独立性',
    title: '让独立执行结果说话',
    description: '评测器在受控的临时工作区执行允许的工具，记录测试总数、关键失败、工具链指纹和不可变证据，不采用智能体自评分。',
    actor: '评测器 · 知识登记簿 · 内容寻址存储',
    guard: '独立证据绑定',
    output: '评测报告',
  },
  correct: {
    kicker: '失败 · 学习',
    title: '把失败定位为可执行修订',
    description: '门禁要求继续迭代后，复核智能体把失败转成结构化纠正意见，定位知识路径、判据与风险；编排服务只修订相关知识，再重新生成实现。',
    actor: '门禁 · 复核智能体 · 编排服务',
    guard: '纠正意见结构与迭代预算',
    output: '修订后的知识版本',
  },
  publish: {
    kicker: '门禁 · 原子提交',
    title: '只有完整证据才能成为正式知识',
    description: '确定性门禁校验来源、证据归属、测试、稳定性和工件完整性。通过后，运行、事件、版本状态与发布回执在同一个事务中提交。',
    actor: '发布门禁 · 知识登记簿',
    guard: '门禁通过且工件完整',
    output: '已验证知识与发布回执',
  },
};

const root = document.documentElement;
const header = document.querySelector('[data-header]');
const menuButton = document.querySelector('[data-menu-toggle]');
const mobileMenu = document.querySelector('[data-mobile-menu]');
const themeButton = document.querySelector('[data-theme-toggle]');
const toast = document.querySelector('[data-toast]');

function setTheme(theme, persist = false) {
  root.dataset.theme = theme;
  themeButton?.setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
  if (persist) {
    try {
      localStorage.setItem('wpknowledge-site-theme', theme);
    } catch {
      // Storage can be unavailable in hardened browsers; the visual toggle still works.
    }
  }
}

try {
  const savedTheme = localStorage.getItem('wpknowledge-site-theme');
  const preferredTheme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  setTheme(savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : preferredTheme);
} catch {
  setTheme('dark');
}

themeButton?.addEventListener('click', () => {
  setTheme(root.dataset.theme === 'light' ? 'dark' : 'light', true);
});

function closeMenu() {
  if (!menuButton || !mobileMenu) return;
  menuButton.setAttribute('aria-expanded', 'false');
  mobileMenu.hidden = true;
}

menuButton?.addEventListener('click', () => {
  if (!mobileMenu) return;
  const expanded = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!expanded));
  mobileMenu.hidden = expanded;
});

mobileMenu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

function updateHeader() {
  header?.classList.toggle('scrolled', window.scrollY > 12);
}

updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

const stageButtons = [...document.querySelectorAll('[data-stage]')];
const stageFields = {
  kicker: document.querySelector('[data-stage-kicker]'),
  title: document.querySelector('[data-stage-title]'),
  description: document.querySelector('[data-stage-description]'),
  actor: document.querySelector('[data-stage-actor]'),
  guard: document.querySelector('[data-stage-guard]'),
  output: document.querySelector('[data-stage-output]'),
};

function selectStage(button) {
  const stage = stages[button.dataset.stage];
  if (!stage) return;
  stageButtons.forEach((item) => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
  });
  Object.entries(stageFields).forEach(([key, element]) => {
    if (element) element.textContent = stage[key];
  });
}

stageButtons.forEach((button, index) => {
  button.addEventListener('click', () => selectStage(button));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = stageButtons.length - 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + stageButtons.length) % stageButtons.length;
    else nextIndex = (index + 1) % stageButtons.length;
    stageButtons[nextIndex].focus();
    selectStage(stageButtons[nextIndex]);
  });
});

const onboardingButtons = [...document.querySelectorAll('[data-onboarding-tab]')];
const onboardingPanels = [...document.querySelectorAll('[data-onboarding-panel]')];

function selectOnboarding(button) {
  const target = button.dataset.onboardingTab;
  onboardingButtons.forEach((item) => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
  });
  onboardingPanels.forEach((panel) => {
    const active = panel.dataset.onboardingPanel === target;
    panel.hidden = !active;
  });
}

onboardingButtons.forEach((button, index) => {
  button.addEventListener('click', () => selectOnboarding(button));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = onboardingButtons.length - 1;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + onboardingButtons.length) % onboardingButtons.length;
    else nextIndex = (index + 1) % onboardingButtons.length;
    onboardingButtons[nextIndex].focus();
    selectOnboarding(onboardingButtons[nextIndex]);
  });
});

let toastTimer;
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 1800);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

document.querySelectorAll('[data-copy-target]').forEach((button) => {
  button.addEventListener('click', async () => {
    try {
      const selector = button.dataset.copyTarget;
      const source = selector ? document.querySelector(selector) : null;
      if (!source) return;
      await copyText(source.textContent.trim());
      showToast(button.dataset.copyLabel || '内容已复制');
    } catch {
      showToast('复制失败，请手动选择');
    }
  });
});

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealItems = document.querySelectorAll('.reveal');
if (reducedMotion || !('IntersectionObserver' in window)) {
  revealItems.forEach((item) => item.classList.add('visible'));
} else {
  try {
    root.classList.add('reveal-enabled');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: .12 });
    revealItems.forEach((item) => observer.observe(item));
  } catch {
    root.classList.remove('reveal-enabled');
    revealItems.forEach((item) => item.classList.add('visible'));
  }
}

document.querySelectorAll('[data-year]').forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});

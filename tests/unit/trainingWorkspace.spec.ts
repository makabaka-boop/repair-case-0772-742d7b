// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import TrainingWorkspace from '../../src/components/TrainingWorkspace.vue';

/**
 * 识读训练工作区生命周期回归：离开工作区（组件卸载）必须立即结束未完成局次。
 *
 * 历史故障：App.vue 曾用 KeepAlive 缓存训练工作区，切换模式只触发
 * onDeactivated 而不会 onUnmounted，abort 永不执行；学员在 answering 或
 * reviewing 阶段切到单稿预检再返回时，旧题号、已选答案、点号反馈仍在，
 * 开始按钮保持禁用。本测试直接以“卸载→重新挂载”模拟真实切换，
 * 若重新引入 KeepAlive 式缓存会立即失败。
 */

// 与固定编码表一致：题卡点号方 -> 正确字符
const CORRECT_BY_DOTS: Record<string, string> = {
  '1': '一',
  '12': '二',
  '14': '三',
  '145': '四',
  '15': '五',
  '124': '六',
  '1245': '七',
  '125': '八',
  '24': '九',
  '245': '零',
  '2': '，',
  '256': '。',
  '36': '-'
};

function mountWorkspace(): { app: ReturnType<typeof createApp>; el: HTMLElement } {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp({ render: () => h(TrainingWorkspace) });
  app.mount(el);
  return { app, el };
}

/** 开局、选正确选项并提交，停留在 reviewing 反馈阶段。 */
async function startAndSubmitFirst(el: HTMLElement): Promise<void> {
  (el.querySelector('[data-testid="training-start"]') as HTMLButtonElement).click();
  await nextTick();
  expect(el.querySelector('[data-testid="training-question"]')).not.toBeNull();

  const dots = el.querySelector('[data-testid="training-cell"] .cell')!.getAttribute('data-dots')!;
  const correctChar = CORRECT_BY_DOTS[dots];
  (
    el.querySelector(`[data-testid="training-option"][data-char="${correctChar}"]`) as HTMLButtonElement
  ).click();
  await nextTick();
  (el.querySelector('[data-testid="training-submit"]') as HTMLButtonElement).click();
  await nextTick();
}

describe('TrainingWorkspace 卸载即结束未完成局次', () => {
  it('answering 阶段卸载：重新挂载后无题卡、无已选标记，开始按钮可用', async () => {
    const first = mountWorkspace();
    await nextTick();
    (first.el.querySelector('[data-testid="training-start"]') as HTMLButtonElement).click();
    await nextTick();

    const dots = first.el.querySelector('[data-testid="training-cell"] .cell')!.getAttribute('data-dots')!;
    (
      first.el.querySelector(
        `[data-testid="training-option"][data-char="${CORRECT_BY_DOTS[dots]}"]`
      ) as HTMLButtonElement
    ).click();
    await nextTick();
    expect(first.el.querySelectorAll('.training-option.picked')).toHaveLength(1);

    // 未提交即离开
    first.app.unmount();

    const second = mountWorkspace();
    await nextTick();
    expect(second.el.querySelector('[data-testid="training-question"]')).toBeNull();
    expect(second.el.querySelector('[data-testid="training-feedback"]')).toBeNull();
    expect(second.el.querySelector('[data-testid="training-score"]')).toBeNull();
    expect(second.el.querySelector('[data-testid="training-hint"]')).toBeNull();
    expect(second.el.querySelectorAll('.training-option.picked')).toHaveLength(0);
    const start = second.el.querySelector('[data-testid="training-start"]') as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    expect(start.textContent?.trim()).toBe('开始训练');

    // 新局可正常开始
    start.click();
    await nextTick();
    expect(second.el.querySelector('[data-testid="training-question"]')).not.toBeNull();
    expect(second.el.querySelector('[data-testid="training-progress"]')?.textContent).toContain('第 1 / 10 题');
    second.app.unmount();
  });

  it('reviewing 阶段卸载：重新挂载后点号反馈不残留，可直接再开局', async () => {
    const first = mountWorkspace();
    await nextTick();
    await startAndSubmitFirst(first.el);
    expect(first.el.querySelector('[data-testid="training-feedback"]')).not.toBeNull();
    expect(
      (first.el.querySelector('[data-testid="training-start"]') as HTMLButtonElement).disabled
    ).toBe(true);

    // 提交后停留在正确字符与点号反馈阶段离开
    first.app.unmount();

    const second = mountWorkspace();
    await nextTick();
    expect(second.el.querySelector('[data-testid="training-question"]')).toBeNull();
    expect(second.el.querySelector('[data-testid="training-feedback"]')).toBeNull();
    expect(second.el.querySelector('[data-testid="training-score"]')).toBeNull();
    const start = second.el.querySelector('[data-testid="training-start"]') as HTMLButtonElement;
    expect(start.disabled).toBe(false);

    start.click();
    await nextTick();
    expect(second.el.querySelector('[data-testid="training-question"]')).not.toBeNull();
    expect(second.el.querySelector('[data-testid="training-feedback"]')).toBeNull();
    second.app.unmount();
  });
});

import { expect, test, type Page } from '@playwright/test';
import { scenarioLength, simulate, startApi, stopApi } from './harness.js';

/**
 * TS-06 (HQ-111): simulator → ingestion → dashboard, in a real browser. The page is opened
 * before the events are sent, so what it shows arrives over the live stream.
 */
test.afterEach(async () => {
  await stopApi();
});

const agentRows = (page: Page) =>
  page
    .locator('section', { has: page.getByRole('heading', { name: 'Agent', exact: true }) })
    .locator('tbody tr');

const agentRow = (page: Page, name: string) =>
  agentRows(page).filter({ has: page.locator('.name').getByText(name, { exact: true }) });

const connectionSection = (page: Page) =>
  page.locator('section', { has: page.getByRole('heading', { name: 'Connection', exact: true }) });

const timelineItems = (page: Page) => page.locator('ol.timeline > li');

async function openDashboard(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('실시간 수신 중')).toBeVisible();
  await expect(page.getByText('아직 관찰된 Agent가 없습니다.')).toBeVisible();
}

test('delegation: a main agent and its two subagents appear with their final states', async ({
  page,
}) => {
  const api = await startApi();
  const connection = await api.register();
  await openDashboard(page);

  const sent = await simulate(['--scenario', 'delegation', '--seed', '1'], connection);

  await expect(agentRows(page)).toHaveCount(3);
  for (const name of ['main', 'worker', 'reviewer']) {
    const row = agentRow(page, name);
    await expect(row).toHaveCount(1);
    // Every agent completed its work: idle, with the completion as the raw status.
    await expect(row).toContainText('유휴');
    await expect(row).toContainText('원본: completed');
    await expect(row).not.toContainText('알 수 없음');
  }
  // Every event sent shows up in the timeline exactly once.
  await expect(timelineItems(page)).toHaveCount(sent);
  await expect(timelineItems(page).filter({ hasText: 'agent.completed' })).toHaveCount(3);
  // The connection never sent a heartbeat: shown as registered, not as connected.
  await expect(connectionSection(page)).toContainText('등록됨(heartbeat 전)');
});

test('disconnect: lost events become a gap and the silent agent becomes unknown', async ({
  page,
}) => {
  const api = await startApi({
    HEARTBEAT_DEGRADED_MS: '1000',
    HEARTBEAT_DISCONNECTED_MS: '2000',
    HEALTH_CHECK_INTERVAL_MS: '500',
    GAP_GRACE_MS: '1000',
    GAP_CHECK_INTERVAL_MS: '500',
  });
  const connection = await api.register();
  await openDashboard(page);

  // The bridge dies mid-run: the scenario's closing agent.disconnected is never sent. The
  // scenario also loses a few events in transit (a sequence hole).
  const scenario = ['--scenario', 'failure-gap', '--seed', '4'];
  const total = await scenarioLength(scenario);
  await simulate([...scenario, '--cut-after', String(total - 1)], connection);
  // Its last heartbeat comes after the events, then silence: the connection loss is always
  // recorded after everything was received (a heartbeat before them could expire first).
  await api.heartbeat(connection);

  const row = agentRow(page, 'main');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('알 수 없음', { timeout: 15_000 });
  await expect(row).toContainText('연결이 끊긴 뒤 소식이 없음');
  await expect(connectionSection(page)).toContainText('⏏ 끊김');

  const gap = timelineItems(page).filter({ hasText: 'event.gap.detected' });
  await expect(gap).toHaveCount(1, { timeout: 15_000 });
  await expect(gap).toHaveClass(/gap/);
  await expect(gap).toContainText('⚠');
});

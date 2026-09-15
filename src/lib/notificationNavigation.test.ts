import { describe, expect, it } from 'vitest';

import {
  isNotificationReturnBridge,
  notificationReturnHistoryDelta,
  stripNotificationReturnBridge,
  withNotificationReturnBridge,
} from './notificationNavigation';

describe('notification post return navigation', () => {
  it('marks a notification return URL without losing its filter query', () => {
    const bridged = withNotificationReturnBridge('/notifications?filter=comments');
    expect(bridged).toContain('/notifications?');
    expect(bridged).toContain('filter=comments');
    expect(bridged).toContain('__alsamosNotificationReturn=post-preview');
    expect(isNotificationReturnBridge('/notifications', bridged.split('?')[1] ?? '')).toBe(true);
  });

  it('strips only the internal bridge marker when restoring Notifications', () => {
    expect(
      stripNotificationReturnBridge(
        '/notifications',
        '?filter=mentions&__alsamosNotificationReturn=post-preview',
      ),
    ).toBe('/notifications?filter=mentions');
  });

  it('collapses preview and bridged return entries back to the original Notifications entry', () => {
    expect(notificationReturnHistoryDelta(2)).toBe(-2);
    expect(notificationReturnHistoryDelta(8)).toBe(-2);
    expect(notificationReturnHistoryDelta(1)).toBeNull();
    expect(notificationReturnHistoryDelta(undefined)).toBeNull();
  });

  it('does not mark unsafe protocol-relative return targets', () => {
    expect(withNotificationReturnBridge('//example.com/notifications')).toBe(
      '//example.com/notifications',
    );
  });
});

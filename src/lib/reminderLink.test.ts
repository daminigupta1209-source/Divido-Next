import { describe, expect, it } from 'vitest';
import { buildReminderLink } from './reminderLink';

const origin = 'https://www.fussky.com';

describe('buildReminderLink', () => {
  it('links one group to its join/open URL', () => {
    expect(buildReminderLink(origin, [{ gId: 'g1', nonGroup: false }, { gId: 'g1', nonGroup: false }]))
      .toBe(`${origin}/?joinGroupId=g1`);
  });

  it('links local Non-Group balances to the Non-Group screen', () => {
    expect(buildReminderLink(origin, [{ gId: 'STANDALONE', nonGroup: true }]))
      .toBe(`${origin}/?open=nongroup`);
  });

  it('links a single shared 1:1 thread by its id', () => {
    expect(buildReminderLink(origin, [{ gId: 'd1', nonGroup: true }]))
      .toBe(`${origin}/?joinGroupId=d1`);
  });

  it('uses the Non-Group screen when Non-Group items span threads', () => {
    expect(buildReminderLink(origin, [{ gId: 'd1', nonGroup: true }, { gId: 'STANDALONE', nonGroup: true }]))
      .toBe(`${origin}/?open=nongroup`);
  });

  it('falls back to home for mixed groups', () => {
    expect(buildReminderLink(origin, [{ gId: 'g1', nonGroup: false }, { gId: 'g2', nonGroup: false }]))
      .toBe(`${origin}/`);
    expect(buildReminderLink(origin, [])).toBe(`${origin}/`);
  });
});

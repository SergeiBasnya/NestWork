import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  formatMessageDateTime,
  formatMessageDay,
  formatMessageTime,
  messageDayKey,
} from '../lib/messageDates';

describe('message dates', () => {
  const today = new Date(2026, 8, 4, 12, 0);

  test('groups messages by local calendar day', () => {
    assert.equal(messageDayKey(new Date(2026, 8, 4, 23, 59)), '2026-09-04');
    assert.equal(messageDayKey(new Date(2026, 8, 5, 0, 1)), '2026-09-05');
  });

  test('uses short labels for today and yesterday', () => {
    assert.equal(formatMessageDay(new Date(2026, 8, 4, 8, 30), today), 'Aujourd’hui');
    assert.equal(formatMessageDay(new Date(2026, 8, 3, 23, 30), today), 'Hier');
  });

  test('shows the full French date for older messages', () => {
    assert.equal(formatMessageDay(new Date(2026, 8, 2, 8, 30), today), 'mercredi 2 septembre 2026');
  });

  test('formats the visible time and complete tooltip', () => {
    const date = new Date(2026, 8, 2, 8, 7);
    assert.equal(formatMessageTime(date), '08:07');
    assert.match(formatMessageDateTime(date), /mercredi 2 septembre 2026.*08:07/);
  });
});

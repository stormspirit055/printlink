import { describe, expect, test } from 'vitest';
import { avatarUrl, frogAvatarKeys, randomAvatarKey } from './avatar-service.js';

describe('frog avatar assignment', () => {
  test('random assignment always selects a registered frog avatar', () => {
    for (let index = 0; index < 100; index += 1) expect(frogAvatarKeys).toContain(randomAvatarKey());
  });

  test('stored avatar keys map to public static asset URLs', () => {
    expect(avatarUrl('frog-05-violet-headphones', 'user-1')).toBe('/avatars/frog-05-violet-headphones.png');
  });

  test('legacy users receive a stable fallback avatar', () => {
    expect(avatarUrl(null, 'legacy-user')).toBe(avatarUrl(null, 'legacy-user'));
    expect(frogAvatarKeys.some((key) => avatarUrl(null, 'legacy-user') === `/avatars/${key}.png`)).toBe(true);
  });
});

const AVATAR_KEYS = [
  'frog-01-emerald-leaf',
  'frog-02-coral-bowtie',
  'frog-03-cobalt-goggles',
  'frog-04-sunshine-crown',
  'frog-05-violet-headphones',
  'frog-06-mint-mushroom',
  'frog-07-orange-scarf',
  'frog-08-black-detective',
  'frog-09-white-flower',
  'frog-10-rainbow-beanie',
];

/** Stable frog avatar URL for a user: custom avatar if set, else a deterministic pick by id. */
export function avatarUrlFor(user: { id?: string; avatarUrl?: string } | null | undefined): string {
  if (user?.avatarUrl) return user.avatarUrl;
  const id = user?.id || 'printlink-user';
  const index = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % AVATAR_KEYS.length;
  return `/avatars/${AVATAR_KEYS[index]}.png`;
}

export const FALLBACK_AVATAR = `/avatars/${AVATAR_KEYS[0]}.png`;

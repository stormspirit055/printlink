import crypto from 'node:crypto';

export const frogAvatarKeys = [
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
] as const;

export function randomAvatarKey() {
  return frogAvatarKeys[crypto.randomInt(frogAvatarKeys.length)];
}

export function avatarUrl(avatarKey: string | null | undefined, userId: string) {
  const fallbackIndex =
    [...userId].reduce((total, character) => total + character.charCodeAt(0), 0) % frogAvatarKeys.length;
  const key =
    avatarKey && frogAvatarKeys.includes(avatarKey as (typeof frogAvatarKeys)[number])
      ? avatarKey
      : frogAvatarKeys[fallbackIndex];
  return `/avatars/${key}.png`;
}

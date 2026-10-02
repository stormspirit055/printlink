import { inject, provide, type InjectionKey } from 'vue';

type OpenPublishDemand = () => void;

const publishDemandKey: InjectionKey<OpenPublishDemand> = Symbol('publish-demand');

export function providePublishDemand(openPublishDemand: OpenPublishDemand) {
  provide(publishDemandKey, openPublishDemand);
}

export function usePublishDemand() {
  const openPublishDemand = inject(publishDemandKey);
  if (!openPublishDemand) throw new Error('Publish demand context is unavailable');
  return { openPublishDemand };
}

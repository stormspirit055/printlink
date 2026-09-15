import { toValue, watchEffect, type MaybeRefOrGetter } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';

export function useRealtime(enabled: MaybeRefOrGetter<boolean>) {
  const queryClient = useQueryClient();

  watchEffect((onCleanup) => {
    if (!toValue(enabled)) return;

    const stream = new EventSource('/api/events', { withCredentials: true });
    const refreshNotifications = () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['demands'] });
      void queryClient.invalidateQueries({ queryKey: ['my-demands'] });
      void queryClient.invalidateQueries({ queryKey: ['demand'] });
    };
    stream.addEventListener('notification', refreshNotifications);
    onCleanup(() => stream.close());
  });
}

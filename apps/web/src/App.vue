<script setup lang="ts">
import { useNaiveTheme } from './naive-theme';

const naive = useNaiveTheme();
</script>

<template>
  <n-config-provider
    :theme="naive.theme"
    :theme-overrides="naive.themeOverrides"
    :locale="naive.locale"
    :date-locale="naive.dateLocale"
  >
    <n-dialog-provider>
      <n-message-provider>
        <router-view />
      </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>

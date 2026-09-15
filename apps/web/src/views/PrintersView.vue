<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { Plus, Printer } from 'lucide-vue-next';
import { api, type Printer as PrinterT } from '../api';
import { useAuth } from '../composables/useAuth';
import QueryState from '../components/QueryState.vue';
import PrinterEntryModal from '../components/PrinterEntryModal.vue';

const { user } = useAuth();
const queryClient = useQueryClient();
const showPrinter = ref(false);

const printersQuery = useQuery({
  queryKey: ['printers'],
  queryFn: () => api<PrinterT[]>('/api/printers'),
  enabled: computed(() => !!user.value),
});

function onSubmitted() {
  void queryClient.invalidateQueries({ queryKey: ['printers'] });
}
</script>

<template>
  <section>
    <div class="section-bar">
      <div class="eyebrow">PRINT DEVICES</div>
      <n-button type="primary" @click="showPrinter = true">
        <template #icon><Plus :size="16" aria-hidden="true" /></template>录入设备
      </n-button>
    </div>
    <QueryState :query="printersQuery" empty-text="还没有录入打印设备" skeleton="cards">
      <div class="printer-grid">
        <article v-for="p in printersQuery.data.value || []" :key="p.id" class="panel printer-card">
          <div class="printer-art">
            <Printer :size="40" :stroke-width="1.4" aria-hidden="true" />
            <span class="printer-tech">{{ p.technology }}</span>
          </div>
          <div class="printer-body">
            <div class="printer-head">
              <h3>{{ p.name }}</h3>
              <span class="printer-enclosed">{{ p.enclosed ? '封闭仓' : '开放式' }}</span>
            </div>
            <p>{{ p.model }} · {{ p.maxX }}×{{ p.maxY }}×{{ p.maxZ }} mm</p>
            <div v-if="p.materials?.length" class="specs">
              <span v-for="m in p.materials" :key="m">{{ m }}</span>
            </div>
          </div>
        </article>
      </div>
    </QueryState>
    <PrinterEntryModal v-model:show="showPrinter" @submitted="onSubmitted" />
  </section>
</template>

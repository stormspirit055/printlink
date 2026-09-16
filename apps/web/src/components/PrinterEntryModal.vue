<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '../api';
type Catalog = {
  id: string;
  brand: string;
  model: string;
  technology: 'FDM' | 'RESIN';
  maxX: number;
  maxY: number;
  maxZ: number;
  enclosed: boolean;
  colorMode: string;
  maxColors: number;
};
type Config = { materials: { code: string; name: string; category: string }[] };
const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ 'update:show': [boolean]; submitted: [] }>();
const qc = useQueryClient();
const catalogQuery = useQuery({
  queryKey: ['printer-catalog'],
  queryFn: () => api<Catalog[]>('/api/printer-catalog'),
  enabled: computed(() => props.show),
});
const configQuery = useQuery({ queryKey: ['config'], queryFn: () => api<Config>('/api/config') });
const brand = ref(''),
  catalogId = ref(''),
  materials = ref<string[]>([]),
  saving = ref(false),
  submitted = ref(false),
  serverError = ref('');
const form = reactive({ name: '', nozzle: '0.4mm', location: '', description: '' });
const brands = computed(() =>
  [...new Set((catalogQuery.data.value || []).map((i) => i.brand))].map((value) => ({ label: value, value })),
);
const models = computed(() =>
  (catalogQuery.data.value || []).filter((i) => i.brand === brand.value).map((i) => ({ label: i.model, value: i.id })),
);
const selected = computed(() => (catalogQuery.data.value || []).find((i) => i.id === catalogId.value));
const materialOptions = computed(() => {
  const kind = selected.value?.technology;
  return (configQuery.data.value?.materials || [])
    .filter((i) => i.category === (kind === 'RESIN' ? 'RESIN' : 'FDM'))
    .map((i) => ({ label: i.name, value: i.code }));
});
const errors = computed(() => ({
  brand: submitted.value && !brand.value ? '请选择品牌' : '',
  model: submitted.value && !catalogId.value ? '请选择具体型号' : '',
  name: submitted.value && form.name.trim().length < 2 ? '设备名称至少填写 2 个字符' : '',
  materials: submitted.value && !materials.value.length ? '至少选择一种支持材料' : '',
}));
async function save() {
  submitted.value = true;
  if (Object.values(errors.value).some(Boolean)) return;
  saving.value = true;
  serverError.value = '';
  try {
    await api('/api/printers', {
      method: 'POST',
      body: JSON.stringify({
        catalogId: catalogId.value,
        name: form.name.trim(),
        materials: materials.value,
        nozzle: form.nozzle,
        location: form.location.trim(),
        description: form.description.trim(),
      }),
    });
    await qc.invalidateQueries({ queryKey: ['printers'] });
    emit('submitted');
    emit('update:show', false);
  } catch (e) {
    serverError.value = e instanceof Error ? e.message : '设备保存失败';
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <n-modal
    :show="show"
    preset="card"
    title="录入打印设备"
    class="printer-modal"
    @update:show="emit('update:show', $event)"
  >
    <p class="muted intro">选择型号后自动填写设备规格。</p>
    <n-form label-placement="top"
      ><div class="two-cols">
        <n-form-item label="品牌" :feedback="errors.brand" :validation-status="errors.brand ? 'error' : undefined"
          ><n-select
            v-model:value="brand"
            :options="brands"
            placeholder="请选择品牌"
            @update:value="
              catalogId = '';
              materials = [];
            " /></n-form-item
        ><n-form-item label="具体型号" :feedback="errors.model" :validation-status="errors.model ? 'error' : undefined"
          ><n-select v-model:value="catalogId" :options="models" :disabled="!brand" placeholder="请选择型号"
        /></n-form-item>
      </div>
      <n-form-item label="设备名称" :feedback="errors.name" :validation-status="errors.name ? 'error' : undefined"
        ><n-input v-model:value="form.name" placeholder="例如：工作室 A-01"
      /></n-form-item>
      <div v-if="selected" class="spec-panel">
        <strong>{{ selected.brand }} {{ selected.model }}</strong>
        <div>
          <span>{{ selected.technology }}</span
          ><span>{{ selected.maxX }} × {{ selected.maxY }} × {{ selected.maxZ }} mm</span
          ><span>{{ selected.enclosed ? '封闭仓' : '开放式' }}</span
          ><span>{{ selected.colorMode === 'multi' ? `最多 ${selected.maxColors} 色` : '单色' }}</span>
        </div>
      </div>
      <div class="two-cols">
        <n-form-item label="喷嘴规格"><n-input v-model:value="form.nozzle" /></n-form-item
        ><n-form-item label="设备所在地"
          ><n-input v-model:value="form.location" placeholder="例如：上海市"
        /></n-form-item>
      </div>
      <n-form-item
        label="支持材料"
        :feedback="errors.materials"
        :validation-status="errors.materials ? 'error' : undefined"
        ><n-checkbox-group v-model:value="materials"
          ><n-space
            ><n-checkbox v-for="m in materialOptions" :key="m.value" :value="m.value">{{
              m.label
            }}</n-checkbox></n-space
          ></n-checkbox-group
        ></n-form-item
      ><n-form-item label="设备说明（选填）"
        ><n-input
          v-model:value="form.description"
          type="textarea"
          :rows="3"
          placeholder="设备状态、常用层高和后处理能力" /></n-form-item
      ><n-alert v-if="serverError" type="error">{{ serverError }}</n-alert></n-form
    ><template #footer
      ><div class="actions">
        <n-button @click="emit('update:show', false)">取消</n-button
        ><n-button type="primary" :loading="saving" @click="save">确认录入</n-button>
      </div></template
    ></n-modal
  >
</template>
<style scoped>
.intro {
  margin: -6px 0 18px;
}
.two-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.spec-panel {
  margin-bottom: 16px;
  padding: 18px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-raised);
}
.spec-panel div {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}
.spec-panel span {
  padding: 4px 7px;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: var(--text-3xs);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
@media (max-width: 640px) {
  .two-cols {
    grid-template-columns: 1fr;
  }
}
</style>
<style>
.printer-modal {
  width: min(700px, 94vw) !important;
  max-height: 92vh;
  overflow: auto;
}
</style>

<script setup lang="ts">
import { computed, markRaw, reactive, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { NProgress } from 'naive-ui';
import { Plus } from 'lucide-vue-next';
import { api, ApiError, fetchUploadCredentials, post, type UploadCredentials } from '../api';
import { useAuth } from '../composables/useAuth';
import { nearestColor, type ModelAnalysis } from '../analyze-3mf';
import { analyzeModel } from '../analyze-model';
import { cityOptions, districtOptions, provinceOptions } from '../lib/china-divisions';
import {
  MODEL_ACCEPT,
  MODEL_FORMAT_LABEL,
  PREVIEWABLE_MODEL_EXTENSIONS,
  modelExtension,
  modelMime,
} from '../model-formats';
import ModelPreview from './ModelPreview.vue';

type Config = {
  materials: { code: string; name: string; pricePerGram: number }[];
  colors: { name: string; hex: string; multiplier: number }[];
  rules: Record<string, { value: number }>;
};
type Address = {
  id: string;
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault: boolean;
};
type Analysis = ModelAnalysis & {
  materialCode: string;
  colorName: string;
  estimatedWeight: number;
  estimatedHours: number;
  budget: number;
};

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ 'update:show': [value: boolean]; submitted: [] }>();
const queryClient = useQueryClient();
const { user } = useAuth();
const configQuery = useQuery({ queryKey: ['config'], queryFn: () => api<Config>('/api/config') });
const addressesQuery = useQuery({
  queryKey: ['addresses'],
  queryFn: () => api<Address[]>('/api/addresses'),
  enabled: computed(() => props.show),
});
const file = ref<File | null>(null);
const analysis = ref<Analysis | null>(null);
const previewUnavailable = ref(false);
const analyzing = ref(false);
const submitting = ref(false);
const uploadPercent = ref<number | null>(null);
const addressEditor = ref(false);
const title = ref('');
const description = ref('');
const budget = ref<number | null>(null);
const addressId = ref('');
const authorizedPublic = ref(false);
const serverError = ref('');
const touched = reactive({ model: false, title: false, address: false });
const address = reactive({
  recipientName: '',
  phone: '',
  province: '',
  city: '',
  district: '',
  detail: '',
  isDefault: false,
});
function resetDraft() {
  file.value = null;
  analysis.value = null;
  previewUnavailable.value = false;
  analyzing.value = false;
  addressEditor.value = false;
  title.value = '';
  description.value = '';
  budget.value = null;
  authorizedPublic.value = false;
  serverError.value = '';
  Object.assign(touched, { model: false, title: false, address: false });
  Object.assign(address, {
    recipientName: '',
    phone: '',
    province: '',
    city: '',
    district: '',
    detail: '',
    isDefault: false,
  });
  const rows = addressesQuery.data.value || [];
  addressId.value = rows.length ? (rows.find((item) => item.isDefault) || rows[0]).id : '';
}
watch(
  () => props.show,
  (show, wasShown) => {
    if (show && wasShown === false) resetDraft();
  },
);
const addressErrors = computed(() => ({
  recipientName: address.recipientName.trim().length < 2 ? '收货人至少填写 2 个字符' : '',
  phone: !/^1\d{10}$/.test(address.phone) ? '请输入有效的 11 位手机号' : '',
  province: !address.province ? '请选择省/直辖市' : '',
  city: !address.city ? '请选择城市' : '',
  district: !address.district ? '请选择区/县' : '',
  detail: address.detail.trim().length < 5 ? '详细地址至少填写 5 个字符' : '',
}));
const errors = computed(() => ({
  model:
    touched.model && (!file.value || (!analysis.value && !previewUnavailable.value))
      ? `请上传有效的 ${MODEL_FORMAT_LABEL} 模型`
      : '',
  title: touched.title && title.value.trim().length < 4 ? '需求标题至少填写 4 个字符' : '',
  address: touched.address && !addressId.value ? '请选择或新增收货地址' : '',
}));
watch(
  () => addressesQuery.data.value,
  (rows) => {
    if (!addressId.value && rows?.length) addressId.value = (rows.find((item) => item.isDefault) || rows[0]).id;
  },
  { immediate: true },
);

async function choose(options: { file: { file?: File } }) {
  const next = options.file.file;
  touched.model = true;
  analysis.value = null;
  previewUnavailable.value = false;
  serverError.value = '';
  if (!next) return false;
  file.value = next;
  const extension = modelExtension(next.name);
  if (!extension) {
    serverError.value = `请选择 ${MODEL_FORMAT_LABEL} 格式的模型文件`;
    return false;
  }
  if (!PREVIEWABLE_MODEL_EXTENSIONS.includes(extension)) {
    previewUnavailable.value = true;
    return false;
  }
  analyzing.value = true;
  let parsed: ModelAnalysis;
  try {
    parsed = await analyzeModel(next);
  } catch (error) {
    previewUnavailable.value = true;
    serverError.value = modelExtension(next.name) ? '' : error instanceof Error ? error.message : '模型解析失败';
    analyzing.value = false;
    return false;
  }
  try {
    const config = configQuery.data.value;
    if (!config) throw new Error('计价配置尚未加载');
    const material = config.materials.find((item) => item.code === 'PLA') || config.materials[0];
    if (!material) throw new Error('平台尚未配置可用材料');
    const colorName = nearestColor(parsed.colorHex, config.colors);
    const color = config.colors.find((item) => item.name === colorName) || config.colors[0];
    const estimatedWeight = +(parsed.volumeCm3 * 1.24 * 0.28).toFixed(1);
    const estimatedHours = +Math.max(0.5, parsed.volumeCm3 * 0.1 + parsed.sizeZ * 0.018).toFixed(1);
    const rules = config.rules;
    const estimate = +Math.max(
      Number(rules.minimum_order?.value || 18),
      estimatedWeight *
        material.pricePerGram *
        Number(color?.multiplier || 1) *
        Number(rules.loss_single?.value || 1.1) +
        estimatedHours * Number(rules.machine_fdm?.value || 3) +
        Number(rules.setup_fee?.value || 8),
    ).toFixed(2);
    analysis.value = {
      ...parsed,
      scene: markRaw(parsed.scene),
      materialCode: material.code,
      colorName,
      estimatedWeight,
      estimatedHours,
      budget: estimate,
    };
    budget.value = estimate;
  } catch (error) {
    serverError.value = error instanceof Error ? error.message : '模型解析失败';
  } finally {
    analyzing.value = false;
  }
  return false;
}

async function saveAddress() {
  if (Object.values(addressErrors.value).some(Boolean)) return;
  try {
    const saved = await api<Address>('/api/addresses', { method: 'POST', body: JSON.stringify(address) });
    await addressesQuery.refetch();
    addressId.value = saved.id;
    addressEditor.value = false;
  } catch (error) {
    serverError.value = error instanceof Error ? error.message : '地址保存失败';
  }
}

async function removeAddress(id: string) {
  await api(`/api/addresses/${id}`, { method: 'DELETE' });
  if (addressId.value === id) addressId.value = '';
  await addressesQuery.refetch();
}

function createUploadId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

/** Uploads the model straight to OSS with STS credentials; returns the object key. */
async function uploadDirectly(credentials: UploadCredentials) {
  const model = file.value!;
  const extension = modelExtension(model.name);
  if (!extension || !credentials.upload.allowedExtensions.includes(extension))
    throw new Error(`请选择 ${MODEL_FORMAT_LABEL} 格式的模型文件`);
  if (model.size > credentials.upload.maxSizeMb * 1024 * 1024)
    throw new Error(`模型文件不能超过 ${credentials.upload.maxSizeMb}MB`);
  const key = `${credentials.upload.prefix}/${createUploadId()}${extension}`;
  const { default: OSS } = await import('ali-oss');
  const client = new OSS({
    region: credentials.upload.region,
    bucket: credentials.upload.bucket,
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
    stsToken: credentials.securityToken,
    ...(credentials.upload.endpoint ? { endpoint: credentials.upload.endpoint } : {}),
    secure: true,
    authorizationV4: true,
  });
  try {
    await client.put(key, model, {
      mime: modelMime(extension),
      progress: (percentage: number) => {
        uploadPercent.value = Math.min(99, Math.round(percentage * 100));
      },
    });
  } catch (error) {
    throw new Error(`模型直传失败：${error instanceof Error ? error.message : '网络异常，请重试'}`);
  }
  uploadPercent.value = 100;
  return key;
}

async function submit() {
  Object.assign(touched, { model: true, title: true, address: true });
  if (Object.values(errors.value).some(Boolean) || (!analysis.value && !previewUnavailable.value) || !file.value)
    return;
  submitting.value = true;
  serverError.value = '';
  uploadPercent.value = null;
  try {
    const row = analysis.value;
    const config = configQuery.data.value;
    const fallbackMaterial = config?.materials.find((item) => item.code === 'PLA') || config?.materials[0];
    if (!row && !fallbackMaterial) throw new Error('平台配置尚未加载，请稍后重试');
    const fields = {
      title: title.value.trim(),
      description: description.value.trim(),
      materialCode: row?.materialCode || fallbackMaterial!.code,
      colorName: row?.colorName || '未识别',
      quantity: row?.quantity || 1,
      sizeX: row?.sizeX || 0.01,
      sizeY: row?.sizeY || 0.01,
      sizeZ: row?.sizeZ || 0.01,
      volumeCm3: row?.volumeCm3 || 0.01,
      estimatedWeight: row?.estimatedWeight || 0,
      estimatedHours: row?.estimatedHours || 0,
      budget: budget.value || Number(config?.rules.minimum_order?.value || 1),
      addressId: addressId.value,
      authorizedPublic: authorizedPublic.value,
    };
    let modelKey: string | null = null;
    try {
      modelKey = await uploadDirectly(await fetchUploadCredentials());
    } catch (error) {
      // 501 = storage provider without direct upload (local dev); 502 = STS
      // temporarily unavailable. Both degrade to the server-mediated upload.
      if (!(error instanceof ApiError && (error.status === 501 || error.status === 502))) throw error;
      uploadPercent.value = null;
    }
    if (modelKey) {
      await post('/api/demands', { ...fields, modelKey, modelName: file.value.name });
    } else {
      const data = new FormData();
      data.set('model', file.value);
      Object.entries(fields).forEach(([key, value]) => data.set(key, String(value)));
      await api('/api/demands', { method: 'POST', body: data });
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['demands'] }),
      queryClient.invalidateQueries({ queryKey: ['my-demands'] }),
    ]);
    emit('submitted');
    emit('update:show', false);
  } catch (error) {
    serverError.value = error instanceof Error ? error.message : '提交失败';
  } finally {
    submitting.value = false;
    uploadPercent.value = null;
  }
}
</script>

<template>
  <n-modal
    :show="show"
    :mask-closable="false"
    preset="card"
    title="发布打印需求"
    class="publish-modal"
    @update:show="emit('update:show', $event)"
  >
    <p class="muted section-intro">上传模型，确认尺寸并补充打印要求。</p>
    <n-alert type="info" class="contact-notice">
      接单方会先申请你的微信联系方式；只有你同意后，平台才会通过通知向对方发送微信号。
    </n-alert>
    <n-form label-placement="top">
      <n-form-item label="模型文件" :feedback="errors.model" :validation-status="errors.model ? 'error' : undefined">
        <n-upload :accept="MODEL_ACCEPT" :default-upload="false" :show-file-list="false" :on-before-upload="choose">
          <n-upload-dragger class="upload-zone">
            <strong>{{
              analyzing
                ? '正在解析模型…'
                : analysis
                  ? '模型解析完成'
                  : previewUnavailable
                    ? '模型文件已选择'
                    : '选择模型文件'
            }}</strong>
            <small>{{ analysis || previewUnavailable ? '点击更换文件' : `支持 ${MODEL_FORMAT_LABEL}` }}</small>
          </n-upload-dragger>
        </n-upload>
      </n-form-item>
      <section v-if="analysis" class="part-previews" aria-label="模型预览">
        <article v-for="part in analysis.parts" :key="part.id" class="part-preview">
          <ModelPreview :model="part.scene" :label="part.name" :compact="analysis.parts.length > 1" />
          <dl>
            <div>
              <dt>尺寸</dt>
              <dd>{{ part.sizeX }} × {{ part.sizeY }} × {{ part.sizeZ }} mm</dd>
            </div>
            <div>
              <dt>体积</dt>
              <dd>{{ part.volumeCm3 }} cm³</dd>
            </div>
          </dl>
        </article>
      </section>
      <div v-else-if="previewUnavailable" class="preview-unavailable" role="status">
        <strong>当前模型无法渲染</strong>
        <span>文件仍可正常上传并提交需求</span>
      </div>
      <div v-if="analysis" class="analysis-grid">
        <div
          v-for="item in [
            ['成品尺寸', `${analysis.sizeX} × ${analysis.sizeY} × ${analysis.sizeZ} mm`],
            ['模型数量', `${analysis.quantity} 件`],
            ['实体体积', `${analysis.volumeCm3} cm³`],
            ['识别颜色', analysis.colorName],
          ]"
          :key="item[0]"
        >
          <small>{{ item[0] }}</small
          ><strong>{{ item[1] }}</strong>
        </div>
      </div>
      <n-form-item label="需求标题" :feedback="errors.title" :validation-status="errors.title ? 'error' : undefined">
        <n-input v-model:value="title" placeholder="模型用途或零件名称" @blur="touched.title = true" />
      </n-form-item>
      <n-form-item label="补充要求（选填）"
        ><n-input
          v-model:value="description"
          type="textarea"
          :rows="4"
          placeholder="说明强度、表面效果、误差及后处理要求"
      /></n-form-item>
      <n-form-item
        label="收货地址"
        :feedback="errors.address"
        :validation-status="errors.address ? 'error' : undefined"
      >
        <div class="address-list">
          <button
            v-for="item in addressesQuery.data.value || []"
            :key="item.id"
            type="button"
            class="address-option"
            :class="{ selected: addressId === item.id }"
            @click="addressId = item.id"
          >
            <span
              ><b>{{ item.recipientName }}</b> {{ item.phone }} <i v-if="item.isDefault">默认</i></span
            ><small>{{ item.province }}{{ item.city }}{{ item.district }}{{ item.detail }}</small
            ><n-button text type="error" @click.stop="removeAddress(item.id)">删除</n-button>
          </button>
          <n-button dashed block @click="addressEditor = true"
            ><template #icon><Plus :size="16" /></template>新增地址
          </n-button>
        </div>
      </n-form-item>
      <n-checkbox v-model:checked="authorizedPublic">交易完成后允许公开展示此需求</n-checkbox>
      <n-progress
        v-if="uploadPercent !== null"
        class="upload-progress"
        type="line"
        :percentage="uploadPercent"
        :height="6"
        status="success"
      />
      <n-alert v-if="serverError" type="error" class="server-error">{{ serverError }}</n-alert>
    </n-form>
    <template #footer
      ><div class="modal-actions">
        <n-button @click="emit('update:show', false)">取消</n-button
        ><n-button type="primary" :loading="submitting" :disabled="!user?.wechatId" @click="submit">提交审核</n-button>
      </div></template
    >
  </n-modal>
  <n-modal v-model:show="addressEditor" :mask-closable="false" preset="card" title="新增收货地址" class="address-modal">
    <n-form label-placement="top">
      <div class="two-cols">
        <n-form-item
          label="收货人"
          :feedback="addressErrors.recipientName"
          :validation-status="addressErrors.recipientName ? 'error' : undefined"
          ><n-input v-model:value="address.recipientName" /></n-form-item
        ><n-form-item
          label="手机号码"
          :feedback="addressErrors.phone"
          :validation-status="addressErrors.phone ? 'error' : undefined"
          ><n-input v-model:value="address.phone" maxlength="11"
        /></n-form-item>
      </div>
      <div class="two-cols">
        <n-form-item label="省/直辖市" :feedback="addressErrors.province"
          ><n-select
            v-model:value="address.province"
            :options="provinceOptions"
            @update:value="
              address.city = '';
              address.district = '';
            " /></n-form-item
        ><n-form-item label="城市" :feedback="addressErrors.city"
          ><n-select
            v-model:value="address.city"
            :options="cityOptions(address.province)"
            :disabled="!address.province"
            @update:value="address.district = ''"
        /></n-form-item>
      </div>
      <n-form-item label="区/县" :feedback="addressErrors.district"
        ><n-select
          v-model:value="address.district"
          :options="districtOptions(address.province, address.city)"
          :disabled="!address.city"
      /></n-form-item>
      <n-form-item
        label="详细地址"
        :feedback="addressErrors.detail"
        :validation-status="addressErrors.detail ? 'error' : undefined"
        ><n-input v-model:value="address.detail" placeholder="街道、门牌号、楼层和房间号"
      /></n-form-item>
      <n-checkbox v-model:checked="address.isDefault">设为默认地址</n-checkbox>
    </n-form>
    <template #footer
      ><div class="modal-actions">
        <n-button @click="addressEditor = false">取消</n-button
        ><n-button type="primary" @click="saveAddress">保存地址</n-button>
      </div></template
    >
  </n-modal>
</template>

<style scoped>
.section-intro {
  margin: calc(var(--space-2) * -1) 0 var(--space-5);
}
.contact-notice {
  margin-bottom: var(--space-5);
}
.upload-zone {
  min-height: 110px;
  display: grid;
  place-items: center;
  gap: var(--space-2);
}
.upload-zone small {
  color: var(--color-text-muted);
}
.analysis-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
  margin: var(--space-4) 0;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  background: var(--color-surface-raised);
}
.preview-unavailable {
  min-height: 8rem;
  display: grid;
  place-items: center;
  align-content: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  border: 1px solid var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-text);
}
.preview-unavailable span {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.part-previews {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.part-preview {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}
.part-preview dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3);
  border-top: 1px solid var(--color-border);
}
.part-preview dl div {
  display: grid;
  min-width: 0;
  gap: var(--space-1);
}
.part-preview dt {
  color: var(--color-text-muted);
  font-size: var(--text-2xs);
}
.part-preview dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-family: var(--font-family-mono);
  font-size: var(--text-xs);
}
.analysis-grid div {
  display: grid;
  gap: var(--space-1);
}
.analysis-grid small {
  color: var(--color-text-muted);
  font-size: var(--text-2xs);
}
.analysis-grid strong {
  font-family: var(--font-family-mono);
  font-size: var(--text-sm);
  color: var(--color-text);
}
.address-list {
  width: 100%;
  display: grid;
  gap: var(--space-2);
}
.address-option {
  position: relative;
  display: grid;
  gap: 5px;
  width: 100%;
  padding: 12px 76px 12px 12px;
  border: 1px solid var(--color-border);
  background: var(--color-field);
  color: var(--color-text);
  text-align: left;
  border-radius: var(--radius-sm);
  transition:
    border-color var(--motion-fast) var(--ease-enter),
    background-color var(--motion-fast) var(--ease-enter);
}
.address-option:hover {
  border-color: color-mix(in srgb, var(--color-primary) 38%, var(--color-border));
  background: color-mix(in srgb, var(--color-surface-raised) 50%, var(--color-field));
}
.address-option.selected {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-field));
  box-shadow: var(--ring-focus);
}
.address-option:focus-visible {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--ring-focus);
}
.address-option small {
  color: var(--color-text-muted);
}
.address-option i {
  padding: 2px 5px;
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
  font-style: normal;
  font-size: var(--text-3xs);
}
.address-option .n-button {
  position: absolute;
  right: 12px;
  top: 12px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
.server-error {
  margin-top: var(--space-4);
}
.upload-progress {
  margin-top: var(--space-4);
}
.two-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}
@media (max-width: 640px) {
  .part-previews {
    grid-template-columns: 1fr;
  }
  .analysis-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .two-cols {
    grid-template-columns: 1fr;
  }
}
</style>

<style>
.publish-modal {
  width: min(920px, 94vw) !important;
  max-height: 92vh;
  overflow: auto;
}
.address-modal {
  width: min(680px, 94vw) !important;
}
</style>

/** API error carrying the HTTP status so callers can branch on it (e.g. 501 fallbacks). */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: { ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...init.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof data.code === 'string' ? `[${data.code}] ` : '';
    const rawIssues = Array.isArray(data.issues) ? data.issues : data.details?.issues;
    const issues = Array.isArray(rawIssues)
      ? rawIssues
          .map((issue: { path?: (string | number)[]; message?: string }) =>
            issue.path?.length ? `${issue.path.join('.')}：${issue.message || '格式不正确'}` : issue.message,
          )
          .filter(Boolean)
          .join('；')
      : '';
    const message = code + (issues ? `${data.error || '请求失败'}（${issues}）` : data.error || '请求失败');
    throw new ApiError(message, response.status, typeof data.code === 'string' ? data.code : undefined);
  }
  return data as T;
}
export const post = <T>(url: string, body: unknown) => api<T>(url, { method: 'POST', body: JSON.stringify(body) });
export type User = {
  id: string;
  username: string;
  phone: string | null;
  nickname: string;
  avatarUrl: string;
  role: 'ADMIN' | 'USER';
  isAdmin: boolean;
  bio: string;
  wechatId: string;
};
export type InvitationCode = {
  id: string;
  code: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  disabled: boolean;
  createdAt: string;
  createdBy?: { nickname: string } | null;
};
export type Demand = {
  id: string;
  userId: string;
  title: string;
  description: string;
  materialCode: string;
  colorName: string;
  quantity: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  budget: number;
  shippingAddress: string;
  modelName?: string;
  status: string;
  nickname: string;
  acceptCount: number;
  raiseCount: number;
  createdAt: string;
  volumeCm3?: number | null;
  estimatedWeight?: number | null;
  estimatedHours?: number | null;
  modelUrl?: string | null;
};
export type ShippingAddress = {
  id: string;
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault: boolean;
};
export type Printer = {
  id: string;
  name: string;
  model: string;
  technology: string;
  maxX: number;
  maxY: number;
  maxZ: number;
  colorMode: string;
  maxColors: number;
  materials: string[];
  enclosed: boolean;
};
export type AppNotification = {
  id: string;
  orderId: string | null;
  demandId: string | null;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};
export type NotificationPage = {
  items: AppNotification[];
  unreadCount: number;
  total: number;
  page: number;
  limit: number;
};
export type NotificationListParams = { page: number; limit: number };
export const fetchNotifications = ({ page, limit }: NotificationListParams) =>
  api<NotificationPage>(`/api/notifications?page=${page}&limit=${limit}`);
export type UploadCredentials = {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: string;
  upload: {
    provider: string;
    bucket: string;
    region: string;
    endpoint?: string;
    prefix: string;
    maxSizeMb: number;
    allowedExtensions: string[];
  };
};
export const fetchUploadCredentials = () => api<UploadCredentials>('/api/uploads/credentials');

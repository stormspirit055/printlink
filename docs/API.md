# PrintLink API 契约索引

所有业务接口使用 `/api` 前缀，通过 HttpOnly Cookie `pl_session` 认证。错误响应包含稳定的 `code` 和兼容字段 `error`。

## 当前业务接口

| 模块      | 接口                                                                | 权限与约束                                    |
| --------- | ------------------------------------------------------------------- | --------------------------------------------- |
| 健康      | `GET /health/live`、`GET /health/ready`                             | 公开                                          |
| 短信      | `POST /api/auth/code`                                               | 每 IP 5 次/分钟，手机号冷却                   |
| 登录/注册 | `POST /api/auth/login`                                              | 手机号、验证码；新手机号需邀请码并自动注册    |
| 会话      | `POST /api/auth/logout`、`GET /api/me`                              | 注销需登录；`GET /me` 未登录返回 `user: null` |
| 资料      | `PUT /api/me`                                                       | 登录用户；昵称、微信号、简介                  |
| 地址      | `GET/POST /api/addresses`、`PUT/DELETE /api/addresses/:id`          | 登录 + 本人资源                               |
| 配置      | `GET /api/config`                                                   | 公开只读                                      |
| 需求      | `GET/POST /api/demands`、`GET /api/demands/:id`                     | 创建需登录且已填写微信号；详情需登录，非公开状态仅本人和管理员可见 |
| 本地模型  | `GET /uploads/:key`                                               | 需登录并通过关联需求权限校验；不公开上传目录 |
| 上传凭证  | `GET /api/uploads/credentials`                                      | 登录用户；每 IP 10 次/分钟；需 OSS 存储       |
| 审核      | `POST /api/demands/:id/review`                                      | 管理员；仅待审核需求                          |
| 联系申请  | `POST /api/demands/:id/contact-requests`                            | 登录、非本人、需求可申请、不可重复            |
| 本人申请  | `GET /api/demands/:id/contact-request`                              | 只返回当前用户对该需求的申请                  |
| 申请列表  | `GET /api/demands/:id/contact-requests`                             | 仅需求所有者                                  |
| 同意申请  | `POST /api/contact-requests/:id/approve`                            | 仅需求所有者；必须有微信号                    |
| 打印机    | `GET/POST /api/printers`、`GET /api/printer-catalog`                | 登录用户                                      |
| 通知      | `GET /api/notifications`、单条/全部已读                             | 登录 + 本人通知                               |
| 实时      | `GET /api/events`                                                   | 登录；SSE + Redis pub/sub                     |
| 后台      | `/api/admin/reviews`、`/api/admin/config`、`/api/admin/invitations` | 管理员                                        |

## 联系方式申请契约

### 创建申请

```http
POST /api/demands/:id/contact-requests
```

成功返回 `201` 和 `ContactRequest`。可能错误：

- `403 PERMISSION_DENIED`：申请自己的需求。
- `409 ORDER_STATE_CONFLICT`：需求不存在于可申请状态。
- `409 CONCURRENT_MODIFICATION`：已申请过。

### 读取申请

需求方读取全部申请：

```http
GET /api/demands/:id/contact-requests
```

申请人读取自己的状态：

```http
GET /api/demands/:id/contact-request
```

未申请时返回 `null`。

### 同意申请

```http
POST /api/contact-requests/:id/approve
```

成功后：

1. 申请从 `PENDING` 变为 `APPROVED`。
2. `approvedAt` 写入当前时间。
3. 系统给申请人创建 `CONTACT_APPROVED` 通知。
4. 通知正文包含需求方当前微信号。

申请更新和通知创建处于同一数据库事务。可能错误：

- `404 RESOURCE_NOT_FOUND`：申请不存在或当前用户不是需求所有者。
- `409 CONTACT_REQUIRED`：需求方尚未填写微信号。
- `409 ORDER_STATE_CONFLICT`：申请已处理。
- `409 CONCURRENT_MODIFICATION`：并发请求中已被处理。

## 上传凭证契约

### 获取上传凭证

```http
GET /api/uploads/credentials
```

登录用户实时获取阿里云 STS 临时上传凭证（AssumeRole，按用户生成会话名，有效期由 `OSS_STS_DURATION_SEC` 控制，默认 3600 秒）。成功返回：

```json
{
  "accessKeyId": "STS.…",
  "accessKeySecret": "…",
  "securityToken": "…",
  "expiration": "2026-09-02T12:00:00Z",
  "upload": {
    "provider": "oss",
    "bucket": "printlink-models",
    "region": "oss-cn-hangzhou",
    "endpoint": "https://oss-cn-hangzhou.aliyuncs.com",
    "prefix": "models",
    "maxSizeMb": 50,
    "allowedExtensions": [".3mf"]
  }
}
```

凭证仅授予 `oss:PutObject`，且限定在 `upload.prefix` 之下；模型下载继续走服务端签名 URL。每 IP 每分钟最多 10 次。可能错误：

- `401`：未登录。
- `429 RATE_LIMIT_EXCEEDED`：请求过于频繁。
- `501 DEPENDENCY_UNAVAILABLE`：未启用 OSS 存储（`STORAGE_PROVIDER=local`）。
- `502 DEPENDENCY_UNAVAILABLE`：阿里云 STS 调用失败或返回不完整。

`endpoint` 仅在配置 `OSS_ENDPOINT` 时返回。

## 保留的数据模型

数据库暂时保留订单、订单事件和评价模型，用于未来扩展。当前 API 不挂载订单、支付、履约或评价接口；相关路径统一返回 `404 RESOURCE_NOT_FOUND`。

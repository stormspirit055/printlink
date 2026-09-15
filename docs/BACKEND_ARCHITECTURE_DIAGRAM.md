# PrintLink 架构与业务图

## 运行架构

```text
Browser / Vue 3
      │ HTTPS + pl_session
      ▼
Nginx ──────────────── /uploads
      │ /api               │
      ▼                    ▼
Express API        LocalStorageAdapter
  │       │
  │       └── Redis: OTP / rate limit / realtime pub-sub
  └────────── PostgreSQL: users / demands / contact requests / notifications
```

## 联系方式交换时序

```text
接单方              API / PostgreSQL             需求方
  │ POST contact-request  │                         │
  ├──────────────────────>│                         │
  │                       ├─ ContactRequest(PENDING)│
  │                       ├─ Notification─────────>│
  │<────── 201 ───────────┤                         │
  │                       │<──── approve request ──┤
  │                       ├─ conditional update     │
  │                       ├─ private notification   │
  │<──── 微信号通知 ──────┤                         │
```

创建申请和首次通知为一个事务；批准状态更新和微信号通知为另一个事务。

## 数据关系

```text
User 1 ── N Demand
User 1 ── N ContactRequest (requester)
User 1 ── N ContactRequest (owner)
Demand 1 ── N ContactRequest
Demand 1 ── N Notification
User 1 ── N Notification
```

`ContactRequest` 对 `(demandId, requesterId)` 建唯一约束。

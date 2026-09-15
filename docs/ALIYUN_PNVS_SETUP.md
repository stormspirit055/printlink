# 阿里云短信认证配置

控制台：<https://dypns.console.aliyun.com/smsServiceOverview>

该产品属于号码认证服务，使用 `dypnsapi.aliyuncs.com`。普通短信服务的签名、模板和套餐不能直接用于本接入。

## 控制台准备

1. 登录并确认短信认证服务已开通，账号有可用发送额度。
2. 在系统签名和系统模板配置中选择验证码场景，记录签名原文和模板编号。使用含 `code`、`min` 变量的模板；不要使用普通短信服务的 `SMS_...` 模板。
3. 为服务端配置 RAM 凭证，最小调用权限为 `dypns:SendSmsVerifyCode`，资源为 `*`。密钥仅保存在服务端环境变量或部署平台 Secret，不写入前端或聊天消息。

## 项目配置

在项目根目录 `.env` 设置以下字段，值以控制台为准：

```dotenv
OTP_PROVIDER=aliyun-pnvs
ALIYUN_PNVS_ACCESS_KEY_ID=
ALIYUN_PNVS_ACCESS_KEY_SECRET=
ALIYUN_PNVS_SIGN_NAME=
ALIYUN_PNVS_TEMPLATE_CODE=
OTP_RESEND_COOLDOWN_SEC=60
DEV_LOGIN_PHONES=
```

填完后重启 API。联调时可以保留 `NODE_ENV=development`，但必须清空 `DEV_LOGIN_PHONES`，避免测试绕过。生产设置 `NODE_ENV=production`。

项目生成 6 位验证码，只在 Redis 保存哈希，有效期为 300 秒。发送参数为 `{"code":"实际验证码","min":"5"}`。此方式由印蛙完成校验，不调用阿里云 `CheckSmsVerifyCode`，不使用 `##code##` 占位符。

## 实测验收

1. 使用自己控制的真实手机号，在印蛙登录页请求一次验证码。
2. 确认手机收到短信；阿里云接口接受请求不等于运营商已送达，应结合控制台发送记录核对。
3. 输入短信中的验证码完成登录；首次注册同时填写有效邀请码。
4. 检查错误验证码不能登录，发送冷却生效，API 响应不包含验证码。

缺少凭证时服务启动会报出缺失的配置项；业务拒绝会返回供应商错误码和请求 ID，可据此查询控制台。网络或 SDK 异常会隐藏底层请求信息，避免密钥或验证码泄露。

参考：[官方接入指南](https://help.aliyun.com/zh/pnvs/use-cases/sms-verify-for-individual-developers)、[SendSmsVerifyCode](https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-sendsmsverifycode)。

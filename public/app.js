import * as THREE from "/vendor/three/build/three.module.js";
import { STLLoader } from "/vendor/three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "/vendor/three/examples/jsm/loaders/OBJLoader.js";
import { ThreeMFLoader } from "/vendor/three/examples/jsm/loaders/3MFLoader.js";
const $ = (s) => document.querySelector(s),
  app = $("#app");
const state = {
  user: null,
  view: "hall",
  demands: [],
  config: null,
  printers: [],
  orders: [],
  modal: null,
  toast: "",
};
const api = async (url, opt = {}) => {
  const r = await fetch(url, opt);
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "请求失败");
  return data;
};
const post = (url, body) =>
  api(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (n) => `¥${Number(n || 0).toFixed(2)}`;
const date = (s) =>
  s
    ? new Date(s).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
function toast(t) {
  state.toast = t;
  render();
  setTimeout(() => {
    state.toast = "";
    render();
  }, 2200);
}
const statusMap = {
  pending_review: "待审核",
  open: "开放报价",
  quoted: "已有报价",
  matched: "已匹配",
  rejected: "未通过",
  awaiting_payment: "待付款",
  paid: "已托管",
  printing: "打印中",
  shipped: "已发货",
  completed: "已完成",
  disputed: "争议中",
};

async function boot() {
  const [me, cfg] = await Promise.all([api("/api/me"), api("/api/config")]);
  state.user = me.user;
  state.config = cfg;
  if (state.user) await loadAll();
  render();
}
async function loadAll() {
  const [d, p, o] = await Promise.all([
    api("/api/demands"),
    api("/api/printers"),
    api("/api/orders"),
  ]);
  state.demands = d;
  state.printers = p;
  state.orders = o;
}
function brand() {
  return `<div class="brand"><div class="brand-mark"></div><span>印蛙<small>PRINTLINK</small></span></div>`;
}
function login() {
  return `<main class="auth"><section class="auth-art">${brand()}<h1>3D <span>打印</span></h1></section><section class="auth-panel"><form class="auth-box" id="loginForm">${brand()}<h2>登录</h2><p>手机号即账号，新用户验证后自动注册。</p><div class="stack"><div class="field"><label>手机号</label><input class="input" name="phone" inputmode="numeric" placeholder="11 位中国大陆手机号" required></div><div class="field"><label>验证码</label><div class="code-row"><input class="input" name="code" inputmode="numeric" maxlength="6" placeholder="6 位验证码" required><button type="button" class="btn secondary" id="sendCode">获取验证码</button></div></div><div class="field"><label>昵称（首次注册）</label><input class="input" name="nickname" placeholder="例如：层纹工坊"></div><div id="devNotice"></div><button class="btn">验证并进入平台</button><div class="hint">管理员演示账号：13800000000，验证码 000000</div></div></form></section></main>`;
}
function shell(content) {
  return `<div class="shell"><header class="topbar">${brand()}<nav class="nav">${nav("hall", "需求大厅")}${nav("workspace", "工作台")}${nav("orders", "交易订单")}${nav("printers", "打印设备")}${state.user.isAdmin ? nav("admin", "管理控制台") : ""}</nav><div class="top-actions"><button class="btn small" data-action="publish">+ 发布需求</button><div class="avatar">${esc(state.user.nickname[0])}</div><button class="ghost" data-action="logout">退出</button></div></header><div class="container">${content}</div>${state.modal || ""}${state.toast ? `<div class="toast">${esc(state.toast)}</div>` : ""}</div>`;
}
function nav(v, label) {
  return `<button data-view="${v}" class="${state.view === v ? "active" : ""}">${label}</button>`;
}
function demandCard(d) {
  return `<article class="card demand-card" data-demand="${d.id}"><div class="model-window"><div class="model-glyph"></div><span class="tag status" style="position:absolute;left:12px;top:12px">${statusMap[d.status] || d.status}</span><span class="meta" style="position:absolute;right:12px;bottom:10px">${d.model_name ? esc(d.model_name) : "NO MODEL FILE"}</span></div><div class="card-body"><div class="card-top"><span class="meta">REQ-${String(d.id).padStart(5, "0")}</span><span class="meta">${date(d.created_at)}</span></div><h3>${esc(d.title)}</h3><p class="desc">${esc(d.description)}</p><div class="specs"><span class="tag">${esc(d.material_code)}</span><span class="tag">${esc(d.color_name)}</span><span class="tag">${d.size_x || "?"}×${d.size_y || "?"}×${d.size_z || "?"} mm</span></div><div class="card-foot"><div><span class="price">${fmt(d.budget)}</span><div class="meta">需求方 ${esc(d.nickname)}</div></div><div class="meta">${d.quote_count || 0} 个报价 →</div></div></div></article>`;
}
function hall() {
  return shell(
    `<div class="page-head"><div><h1>打印需求大厅</h1><p>所有需求均经人工审核，打印方自主判断并报价。</p></div><button class="btn" data-action="publish">发布打印需求</button></div><div class="toolbar"><input class="input search" id="search" placeholder="搜索需求、材料或城市"><select class="select" id="matFilter" style="width:160px"><option value="">全部材料</option>${state.config.materials.map((m) => `<option>${m.code}</option>`).join("")}</select><select class="select" style="width:150px"><option>最新发布</option><option>预算从高到低</option></select></div><div class="grid" id="demandGrid">${state.demands.length ? state.demands.map(demandCard).join("") : '<div class="empty">暂无开放需求</div>'}</div>`,
  );
}
async function workspace() {
  const mine = await api(`/api/demands?mine=${state.user.id}`);
  return shell(
    `<div class="page-head"><div><h1>${esc(state.user.nickname)}的工作台</h1><p>管理你发布的需求和收到的报价。</p></div><button class="btn" data-action="publish">发布新需求</button></div><div class="kpis"><div class="kpi"><span class="meta">发布需求</span><strong>${mine.length}</strong></div><div class="kpi"><span class="meta">进行中订单</span><strong>${state.orders.filter((o) => !["completed"].includes(o.status)).length}</strong></div><div class="kpi"><span class="meta">已完成交易</span><strong>${state.orders.filter((o) => o.status === "completed").length}</strong></div><div class="kpi"><span class="meta">打印设备</span><strong>${state.printers.length}</strong></div></div><div class="table-wrap"><table class="table"><thead><tr><th>需求编号</th><th>标题</th><th>状态</th><th>预算</th><th>报价</th><th>发布时间</th></tr></thead><tbody>${mine.map((d) => `<tr data-demand="${d.id}"><td>REQ-${String(d.id).padStart(5, "0")}</td><td>${esc(d.title)}</td><td><span class="tag ${d.status === "rejected" ? "" : "status"}">${statusMap[d.status]}</span></td><td>${fmt(d.budget)}</td><td>${d.quote_count || 0}</td><td>${date(d.created_at)}</td></tr>`).join("")}</tbody></table></div>`,
  );
}
function orders() {
  return shell(
    `<div class="page-head"><div><div class="eyebrow">ESCROW TRANSACTIONS</div><h1>交易订单</h1><p>款项托管、生产与交付进度均在订单内留痕。</p></div></div><div class="list">${state.orders.length ? state.orders.map((o) => `<div class="panel row" data-order="${o.id}"><div><div class="meta">${o.order_no} · ${state.user.id === o.buyer_id ? "我是需求方" : "我是打印方"}</div><h3 style="margin:7px 0">${esc(o.title)}</h3><span class="meta">${esc(o.buyer_name)} → ${esc(o.maker_name)}</span></div><div style="text-align:right"><span class="tag status ${o.status === "disputed" ? "amber" : ""}">${statusMap[o.status]}</span><div class="price" style="margin-top:10px">${fmt(o.amount)}</div></div></div>`).join("") : '<div class="empty">暂无交易订单</div>'}</div>`,
  );
}
function printers() {
  return shell(
    `<div class="page-head"><div><h1>打印设备</h1><p>录入打印设备及规格，报价时选择使用的打印机。</p></div><button class="btn" data-action="addPrinter">登记打印机</button></div><div class="grid">${state.printers.map((p) => `<div class="card"><div class="model-window"><div class="model-glyph"></div></div><div class="card-body"><div class="card-top"><span class="tag status">已登记</span><span class="meta">${esc(p.technology)}</span></div><h3>${esc(p.name)}</h3><p class="desc">${esc(p.model)} · ${esc(p.description || "未填写设备说明")}</p><div class="specs"><span class="tag">${p.max_x}×${p.max_y}×${p.max_z} mm</span><span class="tag">${p.color_mode === "multi" ? `最多 ${p.max_colors} 色` : "单色"}</span><span class="tag">${p.enclosed ? "封闭仓" : "开放式"}</span></div></div></div>`).join("") || '<div class="empty">还没有登记打印设备</div>'}</div>`,
  );
}
async function adminView() {
  const [pending, cfg] = await Promise.all([
    api("/api/admin/reviews"),
    api("/api/admin/config"),
  ]);
  return shell(
    `<div class="page-head"><div><div class="eyebrow">SYSTEM ADMINISTRATION</div><h1>管理控制台</h1><p>审核公开内容并维护平台计价基准。</p></div></div><div class="tabs"><button class="active" data-tab="review">需求审核 <span class="tag">${pending.length}</span></button><button data-tab="materials">物料价格</button><button data-tab="rules">计价参数</button><button data-tab="colors">颜色系数</button></div><section id="adminBody">${reviewTab(pending)}</section><template id="adminData">${encodeURIComponent(JSON.stringify(cfg))}</template>`,
  );
}
function reviewTab(rows) {
  return `<div class="list">${rows.map((d) => `<div class="panel"><div class="row"><div><span class="meta">REQ-${String(d.id).padStart(5, "0")} · ${esc(d.nickname)}</span><h3 style="margin:8px 0">${esc(d.title)}</h3><p class="desc" style="height:auto">${esc(d.description)}</p><div class="specs"><span class="tag">${esc(d.material_code)}</span><span class="tag">${esc(d.color_name)}</span><span class="tag">${d.size_x}×${d.size_y}×${d.size_z} mm</span><span class="tag">${fmt(d.budget)}</span></div></div><div class="row"><button class="btn secondary small" data-review="reject" data-id="${d.id}">驳回</button><button class="btn small" data-review="approve" data-id="${d.id}">通过</button></div></div></div>`).join("") || '<div class="empty">审核队列为空</div>'}</div>`;
}
function configTable(type, rows) {
  if (type === "materials")
    return `<div class="table-wrap"><table class="table"><thead><tr><th>材料</th><th>类别</th><th>市场区间</th><th>平台克价</th><th>启用</th><th></th></tr></thead><tbody>${rows.map((x) => `<tr><td><input class="input" value="${esc(x.name)}" data-k="name"></td><td>${x.category}</td><td><input class="input" value="${esc(x.market_range)}" data-k="market_range"></td><td><input class="input" type="number" step="0.01" value="${x.price_per_gram}" data-k="price_per_gram"></td><td><input type="checkbox" ${x.active ? "checked" : ""} data-k="active"></td><td><button class="btn small" data-save-material="${x.id}">保存</button></td></tr>`).join("")}</tbody></table></div>`;
  if (type === "rules")
    return `<div class="table-wrap"><table class="table"><thead><tr><th>参数</th><th>说明</th><th>数值</th><th>单位</th><th></th></tr></thead><tbody>${rows.map((x) => `<tr><td>${esc(x.label)}</td><td>${esc(x.description)}</td><td><input class="input" type="number" step="0.01" value="${x.value}" data-k="value"></td><td>${x.unit}</td><td><button class="btn small" data-save-rule="${x.key}">保存</button></td></tr>`).join("")}</tbody></table></div>`;
  return `<div class="table-wrap"><table class="table"><thead><tr><th>色样</th><th>名称</th><th>HEX</th><th>价格系数</th><th>启用</th><th></th></tr></thead><tbody>${rows.map((x) => `<tr><td><span style="display:block;width:24px;height:24px;background:${x.hex};border:1px solid #fff3"></span></td><td><input class="input" value="${esc(x.name)}" data-k="name"></td><td><input class="input" value="${x.hex}" data-k="hex"></td><td><input class="input" type="number" step="0.05" value="${x.multiplier}" data-k="multiplier"></td><td><input type="checkbox" ${x.active ? "checked" : ""} data-k="active"></td><td><button class="btn small" data-save-color="${x.id}">保存</button></td></tr>`).join("")}</tbody></table></div>`;
}

function publishModal() {
  const mats = state.config.materials,
    colors = state.config.colors;
  return `<div class="modal-bg"><form class="modal wide" id="publishForm"><div class="modal-head"><div><div class="eyebrow">NEW PRINT REQUEST</div><h2>发布打印需求</h2></div><button type="button" class="close" data-close>×</button></div><div class="form-grid"><div class="field full"><label>需求标题</label><input class="input" name="title" required placeholder="例如：无人机相机固定支架，小批量 4 件"></div><div class="field full"><label>需求说明</label><textarea class="textarea" name="description" rows="4" required placeholder="用途、表面效果、强度要求、可接受的误差和需要后处理的部分"></textarea></div><div class="field"><label>模型文件（STL / OBJ / 3MF，最大 50MB）</label><input class="input" type="file" name="model" accept=".stl,.obj,.3mf"></div><div class="field"><label>交付城市</label><input class="input" name="city" placeholder="上海市"></div><div class="field"><label>材料</label><select class="select pricing" name="material_code">${mats.map((m) => `<option value="${m.code}" data-price="${m.price_per_gram}" data-cat="${m.category}">${m.name} · ${m.market_range}</option>`).join("")}</select></div><div class="field"><label>颜色/效果</label><select class="select pricing" name="color_name">${colors.map((c) => `<option value="${c.name}" data-mult="${c.multiplier}">${c.name} ×${c.multiplier}</option>`).join("")}</select></div><div class="field"><label>成品尺寸 X / mm</label><input class="input" type="number" min="1" name="size_x" required></div><div class="field"><label>成品尺寸 Y / mm</label><input class="input" type="number" min="1" name="size_y" required></div><div class="field"><label>成品尺寸 Z / mm</label><input class="input" type="number" min="1" name="size_z" required></div><div class="field"><label>数量</label><input class="input pricing" type="number" min="1" value="1" name="quantity"></div><div class="field"><label>预计耗材重量 / g</label><input class="input pricing" type="number" min="0" value="100" name="estimated_weight"><div class="hint">不知道时可先填写大致重量，接单方会重新判断。</div></div><div class="field"><label>预计打印时长 / 小时</label><input class="input pricing" type="number" min="0" value="8" name="estimated_hours"></div><div class="field"><label>期望交付日期</label><input class="input" type="date" name="deadline"></div><div class="field"><label>交付方式</label><select class="select" name="delivery_method"><option value="express">快递</option><option value="pickup">同城自取</option><option value="either">均可</option></select></div></div><div class="estimate"><div class="meta">PLATFORM REFERENCE / 不代表可生产性或最终成交价</div><strong id="estimatePrice">¥0.00</strong><div class="hint" id="formula"></div></div><div class="field"><label>你的发帖预算</label><input class="input" type="number" step="0.01" name="budget" id="budget" required></div><label class="checkbox" style="margin:15px 0"><input type="checkbox" name="authorized_public" value="true">交易完成后，允许在我的主页公开展示这项打印需求</label><div class="row"><span class="hint">提交后先进入管理员审核，不会立即公开。</span><button class="btn">提交审核</button></div></form></div>`;
}
function printerModal() {
  return `<div class="modal-bg"><form class="modal" id="printerForm"><div class="modal-head"><div><h2>登记打印设备</h2></div><button type="button" class="close" data-close>×</button></div><div class="form-grid"><div class="field"><label>设备名称</label><input class="input" name="name" required placeholder="工作台 A-01"></div><div class="field"><label>品牌型号</label><input class="input" name="model" required placeholder="Bambu Lab P1S"></div><div class="field"><label>打印技术</label><select class="select" name="technology"><option>FDM</option><option>RESIN</option></select></div><div class="field"><label>喷嘴规格</label><input class="input" name="nozzle" value="0.4mm"></div><div class="field"><label>最大 X / mm</label><input class="input" type="number" name="max_x" required></div><div class="field"><label>最大 Y / mm</label><input class="input" type="number" name="max_y" required></div><div class="field"><label>最大 Z / mm</label><input class="input" type="number" name="max_z" required></div><div class="field"><label>颜色能力</label><select class="select" name="color_mode"><option value="single">单色</option><option value="multi">多色</option></select></div><div class="field"><label>最大颜色数</label><input class="input" type="number" min="1" value="1" name="max_colors"></div><div class="field"><label>所在城市</label><input class="input" name="location"></div><div class="field full"><label>支持材料（按住 Ctrl/Cmd 多选）</label><select class="select" multiple name="materials" style="height:120px">${state.config.materials.map((m) => `<option value="${m.code}">${m.name}</option>`).join("")}</select></div><div class="field full"><label class="checkbox"><input type="checkbox" name="enclosed">具备封闭仓</label></div><div class="field full"><label>设备与接单说明</label><textarea class="textarea" name="description" rows="3"></textarea></div></div><div class="row" style="margin-top:18px"><span></span><button class="btn">保存打印设备</button></div></form></div>`;
}
async function demandModal(id) {
  const d = await api(`/api/demands/${id}`);
  const own = d.user_id === state.user.id;
  state.modal = `<div class="modal-bg"><div class="modal wide"><div class="modal-head"><div><div class="eyebrow">REQ-${String(d.id).padStart(5, "0")} / ${statusMap[d.status]}</div><h2>${esc(d.title)}</h2></div><button class="close" data-close>×</button></div><div class="layout"><div><div class="model-window" id="modelCanvas" data-src="${esc(d.model_file || "")}" data-name="${esc(d.model_name || "")}" style="height:320px">${d.model_file ? "" : `<div class="model-glyph"></div>`}<span class="meta" style="position:absolute;bottom:12px;z-index:2">${esc(d.model_name || "未上传模型")}</span></div><div class="panel" style="margin-top:12px"><h3>打印要求</h3><p style="color:var(--muted);line-height:1.8">${esc(d.description)}</p><div class="specs"><span class="tag">${d.material_code}</span><span class="tag">${d.color_name}</span><span class="tag">${d.quantity} 件</span><span class="tag">${d.size_x}×${d.size_y}×${d.size_z} mm</span><span class="tag">${esc(d.city || "不限城市")}</span></div></div></div><aside class="side"><div class="panel"><span class="meta">需求预算</span><div class="price" style="font-size:30px;margin:8px 0">${fmt(d.budget)}</div><span class="meta">${esc(d.nickname)} · ${date(d.created_at)}</span></div><div class="panel"><h3>打印报价 / ${d.quotes.length}</h3><div class="list">${d.quotes.map((q) => `<div class="quote"><div class="row"><b>${esc(q.nickname)}</b><span class="price">${fmt(q.amount)}</span></div><div class="meta" style="margin:6px 0">${esc(q.printer_name)} · ${q.days} 天交付</div><p style="color:var(--muted)">${esc(q.message)}</p>${own && ["open", "quoted"].includes(d.status) ? `<button class="btn small" data-accept="${q.id}">选择此报价</button>` : ""}</div>`).join("") || '<div class="hint">还没有打印方报价</div>'}</div>${!own && ["open", "quoted"].includes(d.status) ? (state.printers.length ? `<button class="btn" data-action="quote" data-id="${d.id}" style="width:100%;margin-top:14px">提交报价</button>` : `<button class="btn secondary" data-action="addPrinter" style="width:100%;margin-top:14px">先登记打印机</button>`) : ""}</div></aside></div></div></div>`;
  render();
  if (d.model_file) renderModel(d.model_file, d.model_name);
}

async function renderModel(src, name) {
  const host = $("#modelCanvas");
  if (!host) return;
  try {
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(
        40,
        host.clientWidth / host.clientHeight,
        0.1,
        2000,
      ),
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setClearColor(0x0c1011, 1);
    host.prepend(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xdfffee, 0x18201e, 2.3));
    const key = new THREE.DirectionalLight(0x4be0a0, 3);
    key.position.set(3, 4, 5);
    scene.add(key);
    let object;
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (ext === "stl") {
      const geometry = await new STLLoader().loadAsync(src);
      geometry.computeVertexNormals();
      object = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: 0x4be0a0,
          roughness: 0.52,
          metalness: 0.12,
        }),
      );
    } else if (ext === "obj") object = await new OBJLoader().loadAsync(src);
    else if (ext === "3mf") object = await new ThreeMFLoader().loadAsync(src);
    else throw Error("暂不支持此格式预览");
    const box = new THREE.Box3().setFromObject(object),
      size = box.getSize(new THREE.Vector3()),
      center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);
    const scale = 130 / Math.max(size.x, size.y, size.z, 1);
    object.scale.setScalar(scale);
    scene.add(object);
    camera.position.set(180, 130, 210);
    camera.lookAt(0, 0, 0);
    let alive = true;
    const loop = () => {
      if (!host.isConnected) {
        alive = false;
        renderer.dispose();
        return;
      }
      object.rotation.y += 0.006;
      renderer.render(scene, camera);
      if (alive) requestAnimationFrame(loop);
    };
    loop();
  } catch (e) {
    host.insertAdjacentHTML(
      "beforeend",
      `<div class="notice" style="z-index:2">模型预览失败：${esc(e.message)}</div>`,
    );
  }
}
function quoteModal(id) {
  state.modal = `<div class="modal-bg"><form class="modal" id="quoteForm" data-id="${id}"><div class="modal-head"><div><h2>提交打印报价</h2></div><button type="button" class="close" data-close>×</button></div><div class="stack"><div class="field"><label>执行设备</label><select class="select" name="printer_id">${state.printers.map((p) => `<option value="${p.id}">${esc(p.name)} · ${p.max_x}×${p.max_y}×${p.max_z}</option>`)}</select></div><div class="field"><label>总报价 / 元</label><input class="input" type="number" step="0.01" name="amount" required></div><div class="field"><label>预计交付天数</label><input class="input" type="number" min="1" name="days" required></div><div class="field"><label>生产方案与风险说明</label><textarea class="textarea" rows="4" name="message" required placeholder="说明打印方向、层高、支撑、材料品牌及可能的表面效果"></textarea></div><button class="btn">确认报价</button></div></form></div>`;
  render();
}
async function orderModal(id) {
  const o = await api(`/api/orders/${id}`),
    buyer = state.user.id === o.buyer_id;
  let actions = "";
  if (o.status === "awaiting_payment" && buyer)
    actions = `<button class="btn" data-order-action="pay">模拟支付并托管 ${fmt(o.amount)}</button>`;
  if (o.status === "paid" && !buyer)
    actions = `<button class="btn" data-order-action="start">开始生产</button>`;
  if (o.status === "printing" && !buyer)
    actions = `<div class="stack"><input class="input" id="carrier" placeholder="物流公司"><input class="input" id="tracking" placeholder="物流单号"><button class="btn" data-order-action="ship">提交发货</button></div>`;
  if (o.status === "shipped" && buyer)
    actions = `<button class="btn" data-order-action="complete">确认收货并放款</button>`;
  if (["paid", "printing", "shipped"].includes(o.status))
    actions += `<button class="btn danger" data-order-action="dispute">发起争议</button>`;
  if (
    o.status === "completed" &&
    !o.reviews.some((r) => r.from_user_id === state.user.id)
  )
    actions += `<button class="btn secondary" data-action="reviewOrder">评价本次交易</button>`;
  state.modal = `<div class="modal-bg"><div class="modal wide" id="orderModal" data-id="${o.id}"><div class="modal-head"><div><div class="eyebrow">${o.order_no} / ESCROW ${o.escrow_status.toUpperCase()}</div><h2>${esc(o.title)}</h2></div><button class="close" data-close>×</button></div><div class="layout"><div class="panel"><div class="row"><div><span class="meta">需求方</span><h3>${esc(o.buyer_name)}</h3></div><span>→</span><div style="text-align:right"><span class="meta">打印方</span><h3>${esc(o.maker_name)}</h3></div></div><div class="specs"><span class="tag">${o.material_code}</span><span class="tag">${o.color_name}</span><span class="tag">${o.quantity} 件</span></div><p style="color:var(--muted)">${esc(o.description)}</p><div class="timeline" style="margin-top:28px">${o.events.map((e) => `<div class="event"><b>${esc(e.nickname)} · ${esc(e.type)}</b><p>${esc(e.detail || "状态已更新")}</p><span class="meta">${date(e.created_at)}</span></div>`).join("") || '<div class="event"><b>订单已创建</b><p>等待需求方付款</p></div>'}</div></div><aside class="side"><div class="panel"><span class="tag status ${o.status === "disputed" ? "amber" : ""}">${statusMap[o.status]}</span><div class="price" style="font-size:32px;margin:12px 0">${fmt(o.amount)}</div><div class="meta">平台托管状态：${o.escrow_status}</div></div><div class="panel stack">${actions || '<span class="hint">当前无需操作</span>'}</div>${o.tracking_no ? `<div class="panel"><h3>物流信息</h3><p>${esc(o.carrier)} · ${esc(o.tracking_no)}</p></div>` : ""}</aside></div></div></div>`;
  render();
}

async function showView(v) {
  state.view = v;
  state.modal = null;
  if (v === "workspace") app.innerHTML = await workspace();
  else if (v === "admin") app.innerHTML = await adminView();
  else {
    render();
    return;
  }
  bind();
}
function render() {
  if (!state.config) return;
  if (!state.user) {
    app.innerHTML = login();
    bind();
    return;
  }
  let html =
    state.view === "hall"
      ? hall()
      : state.view === "orders"
        ? orders()
        : state.view === "printers"
          ? printers()
          : hall();
  app.innerHTML = html;
  bind();
}
function bind() {
  document
    .querySelectorAll("[data-view]")
    .forEach((x) => (x.onclick = () => showView(x.dataset.view)));
  document.querySelectorAll("[data-close]").forEach(
    (x) =>
      (x.onclick = () => {
        state.modal = null;
        render();
      }),
  );
  document.querySelectorAll('[data-action="publish"]').forEach(
    (x) =>
      (x.onclick = () => {
        state.modal = publishModal();
        render();
        calcEstimate();
      }),
  );
  document.querySelectorAll('[data-action="addPrinter"]').forEach(
    (x) =>
      (x.onclick = () => {
        state.modal = printerModal();
        render();
      }),
  );
  document
    .querySelectorAll("[data-demand]")
    .forEach((x) => (x.onclick = () => demandModal(x.dataset.demand)));
  document
    .querySelectorAll("[data-order]")
    .forEach((x) => (x.onclick = () => orderModal(x.dataset.order)));
  const send = $("#sendCode");
  if (send)
    send.onclick = async () => {
      const phone = new FormData($("#loginForm")).get("phone");
      try {
        const d = await post("/api/auth/code", { phone });
        $("#devNotice").innerHTML =
          `<div class="notice">开发验证码：<b>${d.devCode}</b>，5 分钟内有效</div>`;
      } catch (e) {
        $("#devNotice").innerHTML = `<div class="error">${e.message}</div>`;
      }
    };
  const lf = $("#loginForm");
  if (lf)
    lf.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const b = Object.fromEntries(new FormData(lf));
        const d = await post("/api/auth/login", b);
        state.user = d.user;
        await loadAll();
        state.view = "hall";
        render();
      } catch (err) {
        toast(err.message);
      }
    };
  document.querySelectorAll('[data-action="logout"]').forEach(
    (x) =>
      (x.onclick = async () => {
        await post("/api/auth/logout", {});
        state.user = null;
        render();
      }),
  );
  const pf = $("#publishForm");
  if (pf) {
    pf.querySelectorAll(".pricing").forEach((x) => (x.oninput = calcEstimate));
    pf.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api("/api/demands", { method: "POST", body: new FormData(pf) });
        state.modal = null;
        await loadAll();
        state.view = "workspace";
        app.innerHTML = await workspace();
        bind();
        toast("需求已提交管理员审核");
      } catch (err) {
        toast(err.message);
      }
    };
  }
  const prf = $("#printerForm");
  if (prf)
    prf.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(prf),
        b = Object.fromEntries(fd);
      b.materials = fd.getAll("materials");
      b.enclosed = fd.has("enclosed");
      try {
        await post("/api/printers", b);
        state.modal = null;
        await loadAll();
        render();
        toast("打印设备已保存");
      } catch (err) {
        toast(err.message);
      }
    };
  document
    .querySelectorAll('[data-action="quote"]')
    .forEach((x) => (x.onclick = () => quoteModal(x.dataset.id)));
  const qf = $("#quoteForm");
  if (qf)
    qf.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await post(
          `/api/demands/${qf.dataset.id}/quotes`,
          Object.fromEntries(new FormData(qf)),
        );
        state.modal = null;
        await loadAll();
        render();
        toast("报价已提交");
      } catch (err) {
        toast(err.message);
      }
    };
  document.querySelectorAll("[data-accept]").forEach(
    (x) =>
      (x.onclick = async () => {
        if (!confirm("确认选择该打印方？其他报价将自动关闭。")) return;
        try {
          const d = await post(`/api/quotes/${x.dataset.accept}/accept`, {});
          state.modal = null;
          await loadAll();
          state.view = "orders";
          render();
          orderModal(d.id);
        } catch (err) {
          toast(err.message);
        }
      }),
  );
  document.querySelectorAll("[data-order-action]").forEach(
    (x) =>
      (x.onclick = async () => {
        const box = $("#orderModal"),
          action = x.dataset.orderAction;
        let b = { action };
        if (action === "ship") {
          b.carrier = $("#carrier").value;
          b.tracking_no = $("#tracking").value;
        }
        if (action === "dispute") {
          const reason = prompt("请说明争议原因");
          if (!reason) return;
          b.reason = reason;
        }
        try {
          await post(`/api/orders/${box.dataset.id}/action`, b);
          await loadAll();
          await orderModal(box.dataset.id);
          toast("订单状态已更新");
        } catch (err) {
          toast(err.message);
        }
      }),
  );
  document.querySelectorAll("[data-review]").forEach(
    (x) =>
      (x.onclick = async () => {
        const reason =
          x.dataset.review === "reject"
            ? prompt("请填写驳回原因") || "内容不符合发布规范"
            : "";
        await post(`/api/demands/${x.dataset.id}/review`, {
          action: x.dataset.review,
          reason,
        });
        app.innerHTML = await adminView();
        bind();
        toast("审核已处理");
      }),
  );
  document.querySelectorAll("[data-tab]").forEach(
    (x) =>
      (x.onclick = async () => {
        document
          .querySelectorAll("[data-tab]")
          .forEach((b) => b.classList.remove("active"));
        x.classList.add("active");
        if (x.dataset.tab === "review") {
          const p = await api("/api/admin/reviews");
          $("#adminBody").innerHTML = reviewTab(p);
        } else {
          const cfg = await api("/api/admin/config");
          $("#adminBody").innerHTML = configTable(
            x.dataset.tab,
            cfg[x.dataset.tab],
          );
        }
        bind();
      }),
  );
  document
    .querySelectorAll("[data-save-material]")
    .forEach(
      (x) =>
        (x.onclick = () => saveRow(x, "materials", x.dataset.saveMaterial)),
    );
  document
    .querySelectorAll("[data-save-rule]")
    .forEach(
      (x) => (x.onclick = () => saveRow(x, "rules", x.dataset.saveRule)),
    );
  document
    .querySelectorAll("[data-save-color]")
    .forEach(
      (x) => (x.onclick = () => saveRow(x, "colors", x.dataset.saveColor)),
    );
  const search = $("#search");
  if (search)
    search.oninput = () => {
      const q = search.value.toLowerCase();
      $("#demandGrid").innerHTML = state.demands
        .filter((d) =>
          [d.title, d.description, d.material_code, d.city]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
        .map(demandCard)
        .join("");
      bind();
    };
  document.querySelectorAll('[data-action="reviewOrder"]').forEach(
    (x) =>
      (x.onclick = async () => {
        const box = $("#orderModal");
        const rating = prompt("请评分 1-5 分", "5");
        if (!rating) return;
        const content = prompt("写下本次交易评价", "按约完成，沟通顺畅") || "";
        try {
          await post(`/api/orders/${box.dataset.id}/review`, {
            rating,
            content,
          });
          await orderModal(box.dataset.id);
          toast("评价已发布");
        } catch (err) {
          toast(err.message);
        }
      }),
  );
}
function calcEstimate() {
  const f = $("#publishForm");
  if (!f) return;
  const m = f.material_code.selectedOptions[0],
    c = f.color_name.selectedOptions[0],
    w = +f.estimated_weight.value || 0,
    h = +f.estimated_hours.value || 0,
    q = +f.quantity.value || 1,
    r = state.config.rules,
    loss = c.dataset.mult > 1.2 ? r.loss_multicolor.value : r.loss_single.value,
    rate =
      m.dataset.cat === "RESIN" ? r.machine_resin.value : r.machine_fdm.value;
  const mat = w * +m.dataset.price * +c.dataset.mult * loss * q,
    total = Math.max(
      r.minimum_order.value,
      mat + h * rate * q + r.setup_fee.value,
    );
  $("#estimatePrice").textContent = fmt(total);
  $("#formula").textContent =
    `材料 ${fmt(mat)} + 机时 ${fmt(h * rate * q)} + 开机 ${fmt(r.setup_fee.value)} · 损耗系数 ×${loss}`;
  $("#budget").value = total.toFixed(2);
}
async function saveRow(btn, type, id) {
  const tr = btn.closest("tr"),
    body = {};
  tr.querySelectorAll("[data-k]").forEach(
    (i) => (body[i.dataset.k] = i.type === "checkbox" ? i.checked : i.value),
  );
  await api(`/api/admin/${type}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  state.config = await api("/api/config");
  toast("配置已保存并生效");
}
boot().catch((e) => {
  app.innerHTML = `<div class="boot error">SYSTEM ERROR / ${esc(e.message)}</div>`;
});

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'printlink.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, phone TEXT UNIQUE NOT NULL, nickname TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'buyer', avatar_color TEXT DEFAULT '#44e3a1',
  bio TEXT DEFAULT '', is_admin INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS otp_codes (phone TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS printers (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL, model TEXT NOT NULL,
  technology TEXT DEFAULT 'FDM', max_x INTEGER, max_y INTEGER, max_z INTEGER,
  color_mode TEXT DEFAULT 'single', max_colors INTEGER DEFAULT 1, materials TEXT DEFAULT '[]',
  nozzle TEXT DEFAULT '0.4mm', enclosed INTEGER DEFAULT 0, location TEXT DEFAULT '',
  description TEXT DEFAULT '', active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL,
  price_per_gram REAL NOT NULL, market_range TEXT NOT NULL, active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS pricing_rules (
  key TEXT PRIMARY KEY, label TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL, description TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS color_options (
  id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, hex TEXT NOT NULL, multiplier REAL DEFAULT 1,
  kind TEXT DEFAULT 'standard', active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS demands (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
  material_code TEXT NOT NULL, color_name TEXT NOT NULL, quantity INTEGER DEFAULT 1,
  size_x REAL, size_y REAL, size_z REAL, estimated_weight REAL, estimated_hours REAL,
  budget REAL NOT NULL, deadline TEXT, delivery_method TEXT DEFAULT 'express', city TEXT DEFAULT '',
  model_file TEXT, model_name TEXT, cover_type TEXT DEFAULT 'model', status TEXT DEFAULT 'pending_review',
  reject_reason TEXT DEFAULT '', authorized_public INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY, demand_id INTEGER NOT NULL, printer_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  amount REAL NOT NULL, days INTEGER NOT NULL, message TEXT NOT NULL, status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(demand_id,user_id),
  FOREIGN KEY(demand_id) REFERENCES demands(id), FOREIGN KEY(printer_id) REFERENCES printers(id), FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, order_no TEXT UNIQUE NOT NULL, demand_id INTEGER NOT NULL, quote_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL, maker_id INTEGER NOT NULL, amount REAL NOT NULL,
  status TEXT DEFAULT 'awaiting_payment', escrow_status TEXT DEFAULT 'unpaid',
  tracking_no TEXT DEFAULT '', carrier TEXT DEFAULT '', proof TEXT DEFAULT '', dispute_reason TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, paid_at TEXT, shipped_at TEXT, completed_at TEXT,
  FOREIGN KEY(demand_id) REFERENCES demands(id), FOREIGN KEY(quote_id) REFERENCES quotes(id)
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, from_user_id INTEGER NOT NULL, to_user_id INTEGER NOT NULL,
  rating INTEGER NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id,from_user_id), FOREIGN KEY(order_id) REFERENCES orders(id)
);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, actor_id INTEGER NOT NULL, type TEXT NOT NULL,
  detail TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(order_id) REFERENCES orders(id)
);
`);

const materials = [
 ['PLA','PLA / PLA+','FDM',0.07,'¥45–85/kg',10],['PLA_MATTE','哑光 PLA','FDM',0.08,'¥55–95/kg',20],
 ['PETG','PETG','FDM',0.07,'¥45–80/kg',30],['ABS','ABS','FDM',0.08,'¥55–90/kg',40],
 ['ASA','ASA','FDM',0.10,'¥75–120/kg',50],['TPU','TPU','FDM',0.12,'¥85–150/kg',60],
 ['PC','PC','FDM',0.15,'¥100–180/kg',70],['PA','PA / 尼龙','FDM',0.18,'¥120–220/kg',80],
 ['CF','碳纤维增强','FDM',0.20,'¥140–280/kg',90],['RESIN','标准光敏树脂','RESIN',0.10,'¥70–130/kg',100],
 ['RESIN_WASH','水洗树脂','RESIN',0.13,'¥90–160/kg',110],['RESIN_TOUGH','高韧工程树脂','RESIN',0.28,'¥180–400/kg',120]
];
const insertMaterial = db.prepare('INSERT OR IGNORE INTO materials(code,name,category,price_per_gram,market_range,sort_order) VALUES(?,?,?,?,?,?)');
materials.forEach(x => insertMaterial.run(...x));
const rules = [
 ['loss_single','单色损耗系数',1.10,'倍','覆盖裙边、支撑和常规废料'],['loss_multicolor','多色损耗系数',1.55,'倍','覆盖换色塔和冲刷损耗'],
 ['machine_fdm','FDM 设备时价',3,'元/小时','消费级 FDM 参考机时'],['machine_resin','光固化设备时价',4,'元/小时','含基础清洗固化设备使用'],
 ['setup_fee','开机基础费',8,'元/单','切片、调机和基础沟通'],['minimum_order','最低订单额',18,'元','建议报价下限']
];
const insertRule = db.prepare('INSERT OR IGNORE INTO pricing_rules(key,label,value,unit,description) VALUES(?,?,?,?,?)');
rules.forEach(x => insertRule.run(...x));
const colors = [['黑色','#171a1f',1,'standard'],['白色','#e8ece9',1,'standard'],['机械灰','#7b858c',1,'standard'],['信号红','#ef5757',1,'standard'],['工业黄','#f2ca52',1,'standard'],['钴蓝','#3a7bd5',1,'standard'],['荧光绿','#50e3a4',1.15,'effect'],['透明','#b6d9da',1.1,'effect'],['丝绸银','#bfc5ca',1.2,'effect'],['渐变色','#925cff',1.25,'effect'],['夜光','#d8f39a',1.5,'effect']];
const insertColor = db.prepare('INSERT OR IGNORE INTO color_options(name,hex,multiplier,kind) VALUES(?,?,?,?)');
colors.forEach(x => insertColor.run(...x));

// Demo admin is available immediately; all other accounts use phone verification.
db.prepare("INSERT OR IGNORE INTO users(id,phone,nickname,role,is_admin,bio) VALUES(1,'13800000000','平台管理员','maker',1,'平台审核与交易仲裁')").run();

module.exports = db;

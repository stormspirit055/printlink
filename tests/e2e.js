const assert = require('assert');
const base = process.env.BASE_URL || 'http://localhost:4311';

async function client(phone, nickname) {
  let cookie = '';
  const call = async (url, options = {}) => {
    options.headers = { ...(options.headers || {}), ...(cookie ? { cookie } : {}) };
    const response = await fetch(base + url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(`${url}: ${data.error}`);
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return data;
  };
  const codeResult = await call('/api/auth/code', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ phone }) });
  await call('/api/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ phone, code:codeResult.devCode, nickname }) });
  return { call };
}

(async () => {
  const suffix = String(Date.now()).slice(-8);
  const buyer = await client(`131${suffix}`, '验收需求方');
  const maker = await client(`132${suffix}`, '验收打印方');
  const admin = await client('13800000000', '平台管理员');

  const demandForm = new FormData();
  Object.entries({ title:'自动化验收零件', description:'用于验证平台完整交易状态机', material_code:'PLA', color_name:'机械灰', quantity:'2', size_x:'80', size_y:'40', size_z:'20', estimated_weight:'90', estimated_hours:'5', budget:'48', city:'上海市' }).forEach(([k,v]) => demandForm.append(k,v));
  const demand = await buyer.call('/api/demands', { method:'POST', body:demandForm });
  assert.equal(demand.status, 'pending_review');
  await admin.call(`/api/demands/${demand.id}/review`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({action:'approve'}) });

  const printer = await maker.call('/api/printers', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({name:'验收节点',model:'P1S',technology:'FDM',max_x:256,max_y:256,max_z:256,color_mode:'multi',max_colors:4,materials:['PLA','PETG'],enclosed:true,location:'上海市'}) });
  await maker.call(`/api/demands/${demand.id}/quotes`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({printer_id:printer.id,amount:46,days:2,message:'0.2mm 层高，常规支撑，打印前确认方向'}) });
  const detail = await buyer.call(`/api/demands/${demand.id}`);
  assert.equal(detail.quotes.length, 1);
  const order = await buyer.call(`/api/quotes/${detail.quotes[0].id}/accept`, { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
  await buyer.call(`/api/orders/${order.id}/action`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({action:'pay'}) });
  await maker.call(`/api/orders/${order.id}/action`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({action:'start'}) });
  await maker.call(`/api/orders/${order.id}/action`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({action:'ship',carrier:'顺丰速运',tracking_no:'SF-TEST-001'}) });
  await buyer.call(`/api/orders/${order.id}/action`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({action:'complete'}) });
  await buyer.call(`/api/orders/${order.id}/review`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({rating:5,content:'成品符合要求'}) });
  await maker.call(`/api/orders/${order.id}/review`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({rating:5,content:'需求清晰，确认及时'}) });
  const finalOrder = await buyer.call(`/api/orders/${order.id}`);
  assert.equal(finalOrder.status, 'completed');
  assert.equal(finalOrder.escrow_status, 'released');
  assert.equal(finalOrder.reviews.length, 2);
  console.log(`E2E PASS: ${order.orderNo}, pending_review -> completed, escrow released, 2 reviews`);
})().catch(error => { console.error(error); process.exit(1); });

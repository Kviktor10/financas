/* Mercado & Finanças — interface comum às edições LocalStorage e Flask/SQLite. */
(() => {
  'use strict';

  const MODE = document.body.dataset.mode || 'local';
  const STORAGE_KEY = 'mercado_financas_v2_local';
  const CATEGORIES = [
    ['comida','🥬','Comida'],['limpeza','🧽','Limpeza'],['medicamento','💊','Medicamentos'],
    ['eletronico','🔌','Eletrônicos'],['higiene','🧴','Higiene'],['escolar','📚','Escolar'],
    ['utensilios','🍴','Utensílios'],['vestuario','👕','Vestuário'],['bebidas','🧃','Bebidas'],
    ['supermercado','🛒','Supermercado'],['transporte','🚌','Transporte'],['moradia','🏠','Moradia'],
    ['contas','🧾','Contas'],['lazer','🎟️','Lazer'],['pets','🐾','Pets'],['outros','📦','Outros']
  ].map(([id,icon,name]) => ({id,icon,name}));
  const UNIT_GROUPS = {
    mass: { units: ['g','kg'], factor: {g:1,kg:1000}, base:'g' },
    volume: { units: ['ml','L'], factor: {ml:1,L:1000}, base:'ml' },
    count: { units: ['un'], factor: {un:1}, base:'un' }
  };
  const TYPE_LABELS = {
    mensalidade:'Mensalidade', energia:'Energia', internet:'Internet', streaming:'Streaming', jogo:'Jogos',
    cartao:'Cartão de crédito', emprestimo:'Empréstimo', financiamento:'Financiamento', conta:'Conta', outro:'Outro'
  };
  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
  const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const uid = prefix => `${prefix}_${(crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`)}`;
  const nowISO = () => new Date().toISOString();
  const dateInput = date => { const d = new Date(date || Date.now()); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
  const dateBR = value => value ? new Date(value).toLocaleDateString('pt-BR') : '—';
  const monthName = month => new Date(2020, month-1, 1).toLocaleDateString('pt-BR',{month:'long'});
  const total = (items, selector=x=>x) => items.reduce((s,item)=>s+(Number(selector(item))||0),0);
  const normalizeName = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  const moneyRound = value => Math.round((Number(value)||0)*100)/100;

  function defaultState() {
    return { version:2, settings:{}, products:[], transactions:[], services:[], serviceRuns:[], obligations:[], installments:[], purchases:[], activeCart:[] };
  }
  function normalizeState(value) {
    const base = defaultState();
    if (!value || typeof value !== 'object') return base;
    // Compatibilidade básica com backup da edição anterior (appData + credenciais).
    if (value.appData && typeof value.appData === 'object') {
      const old = value.appData;
      const migratedProducts = (Array.isArray(old.products) ? old.products : []).map((p, i) => {
        const unit = ['g','kg','ml','L','un'].includes(p.unit) ? p.unit : 'un';
        const codes = productCodes(i + 1);
        return { id:p.id || uid('prod'), name:p.name || 'Produto importado', productCode:codes.productCode, barcode:codes.barcode,
          category:p.category || 'outros', icon:p.icon || '', purchaseQty:1, purchaseUnit:unit, totalPrice:Number(p.price)||0,
          baseUnit:UNIT_GROUPS[unitGroup(unit)].base, createdAt:p.createdAt || nowISO(), updatedAt:p.updatedAt || nowISO() };
      });
      return {...base, settings:{...(old.settings||{}),productSequence:migratedProducts.length}, products:migratedProducts, transactions:Array.isArray(old.transactions)?old.transactions:[],
        purchases:Array.isArray(old.purchases)?old.purchases:[], activeCart:Array.isArray(old.activeCart)?old.activeCart:[]};
    }
    const sourceProducts = Array.isArray(value.products) ? value.products : [];
    if (sourceProducts.some(p => !p.productCode || p.totalPrice === undefined || p.purchaseQty === undefined)) {
      const migratedProducts = sourceProducts.map((p, i) => {
        const rawUnit = p.purchaseUnit || p.unit || 'un';
        const unit = ['g','kg','ml','L','un'].includes(rawUnit) ? rawUnit : 'un';
        const generated = productCodes(i + 1);
        const code = /^PRD-\d{6,}$/.test(p.productCode || '') ? p.productCode : generated.productCode;
        const barcode = /^\d{13}$/.test(p.barcode || '') ? p.barcode : generated.barcode;
        return {...p,id:p.id || uid('prod'),name:p.name || 'Produto importado',productCode:code,barcode,
          category:p.category || 'outros',icon:p.icon || '',purchaseQty:Number(p.purchaseQty)||1,purchaseUnit:unit,
          totalPrice:Number(p.totalPrice ?? p.price)||0,baseUnit:p.baseUnit || UNIT_GROUPS[unitGroup(unit)].base,
          createdAt:p.createdAt || nowISO(),updatedAt:p.updatedAt || nowISO()};
      });
      const highest = migratedProducts.reduce((max,p)=>Math.max(max,Number(String(p.productCode).match(/(\d+)$/)?.[1]||0)),0);
      return {...base,...value,version:2,settings:{...(value.settings||{}),productSequence:Math.max(highest,Number(value.settings?.productSequence)||0)},products:migratedProducts};
    }
    return {...base,...value,
      settings:{...base.settings,...(value.settings||{})},
      products:Array.isArray(value.products)?value.products:[],
      transactions:Array.isArray(value.transactions)?value.transactions:[],
      services:Array.isArray(value.services)?value.services:[],
      serviceRuns:Array.isArray(value.serviceRuns)?value.serviceRuns:[],
      obligations:Array.isArray(value.obligations)?value.obligations:[],
      installments:Array.isArray(value.installments)?value.installments:[],
      purchases:Array.isArray(value.purchases)?value.purchases:[],
      activeCart:Array.isArray(value.activeCart)?value.activeCart:[]
    };
  }

  let state = defaultState();
  let currentView = 'dashboard';
  let selectedYear = new Date().getFullYear();
  let searchProducts = '';
  let searchShopping = '';

  async function loadState() {
    if (MODE === 'flask') {
      const response = await fetch('/api/state');
      if (!response.ok) throw new Error(`Servidor respondeu ${response.status} ao carregar o banco de dados.`);
      state = normalizeState(await response.json());
    } else {
      try { state = normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')); }
      catch (error) { console.warn('Dados locais inválidos; iniciando uma estrutura vazia.',error); state = defaultState(); }
    }
  }
  async function saveState() {
    if (MODE === 'flask') {
      const response = await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)});
      const body = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(body.error || `Falha ao gravar SQLite (${response.status}).`);
      state = normalizeState(body.state || state);
    } else {
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    }
    updateHeader();
  }
  function transactionsBalance() {
    return moneyRound(total(state.transactions,tx=>tx.type==='income'?tx.amount:-tx.amount));
  }
  function updateHeader() {
    $('#topBalance').textContent = money(transactionsBalance());
    $('#modeLabel').textContent = MODE==='flask'?'Flask + SQLite':'LocalStorage';
  }
  function toast(message, type='success') {
    const el=document.createElement('div'); el.className=`toast ${type}`; el.textContent=message;
    $('#toastRoot').append(el); setTimeout(()=>el.remove(),3800);
  }
  function openModal(html) { $('#modalRoot').innerHTML=html; }
  function closeModal() { $('#modalRoot').innerHTML=''; }
  function categoryOptions(selected='outros') {
    return CATEGORIES.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${c.icon} ${c.name}</option>`).join('');
  }
  function transactionTypeOptions(selected='expense') {
    return `<option value="expense" ${selected==='expense'?'selected':''}>Despesa</option><option value="income" ${selected==='income'?'selected':''}>Entrada</option>`;
  }
  function getProductSequence() {
    const used=state.products.reduce((max,p)=>Math.max(max,Number(String(p.productCode||'').match(/(\d+)$/)?.[1]||0)),0);
    return Math.max(used,Number(state.settings.productSequence)||0)+1;
  }
  function ean13For(sequence) {
    const body=`200${String(sequence).padStart(9,'0').slice(-9)}`;
    const sum=[...body].reduce((acc,d,i)=>acc+Number(d)*(i%2===0?1:3),0);
    return body+String((10-sum%10)%10);
  }
  function productCodes(sequence=getProductSequence()) {
    return {productCode:`PRD-${String(sequence).padStart(6,'0')}`,barcode:ean13For(sequence)};
  }
  function levenshtein(a,b) {
    const matrix=Array.from({length:a.length+1},(_,i)=>[i]);
    for(let j=1;j<=b.length;j++) matrix[0][j]=j;
    for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++) matrix[i][j]=Math.min(matrix[i-1][j]+1,matrix[i][j-1]+1,matrix[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    return matrix[a.length][b.length];
  }
  function similarProducts(name, excludeId='') {
    const key=normalizeName(name); if(!key) return [];
    return state.products.filter(p=>p.id!==excludeId).map(p=>({product:p,key:normalizeName(p.name)})).filter(x=>{
      const a=key,b=x.key; if(!a||!b) return false;
      const ratio=1-levenshtein(a,b)/Math.max(a.length,b.length,1);
      return a===b || (Math.min(a.length,b.length)>=4 && (a.includes(b)||b.includes(a)||ratio>=0.82));
    }).slice(0,4).map(x=>x.product);
  }
  function duplicateProductError({name,productCode,barcode,id=''}) {
    const key=normalizeName(name);
    const duplicateName=state.products.find(p=>p.id!==id&&normalizeName(p.name)===key);
    if(duplicateName) return `Já existe um produto com esse nome: ${duplicateName.name} (${duplicateName.productCode}).`;
    const duplicateCode=state.products.find(p=>p.id!==id&&(p.productCode===productCode||p.barcode===barcode));
    if(duplicateCode) return `Código já associado ao produto "${duplicateCode.name}" (${duplicateCode.productCode}).`;
    return '';
  }
  function unitGroup(unit) { return Object.entries(UNIT_GROUPS).find(([,g])=>g.units.includes(unit))?.[0]||'count'; }
  function productUnitCost(product) {
    const group=UNIT_GROUPS[unitGroup(product.purchaseUnit||product.unit||'un')];
    const quantity=Math.max(Number(product.purchaseQty)||1,0.000001);
    const factor=group.factor[product.purchaseUnit||product.unit||'un']||1;
    return (Number(product.totalPrice ?? product.price)||0)/(quantity*factor);
  }
  function amountToBase(amount,unit) {
    const group=UNIT_GROUPS[unitGroup(unit)]; return (Number(amount)||0)*(group.factor[unit]||1);
  }
  function itemCost(product,amount,unit) {
    if(!product || unitGroup(product.purchaseUnit||product.unit||'un')!==unitGroup(unit)) return null;
    return moneyRound(productUnitCost(product)*amountToBase(amount,unit));
  }
  function svgQR(value,size=116) {
    try {
      const qr=new QRCodeVendor(0,1); qr.addData(String(value)); qr.make();
      const count=qr.getModuleCount(), quiet=4, view=count+quiet*2;
      let path='';
      for(let r=0;r<count;r++) for(let c=0;c<count;c++) if(qr.isDark(r,c)) path+=`M${c+quiet} ${r+quiet}h1v1h-1z`;
      return `<svg class="qr-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}" width="${size}" height="${size}" role="img" aria-label="QR Code ${escapeHTML(value)}"><rect width="${view}" height="${view}" fill="#fff"/><path d="${path}" fill="#101827"/></svg>`;
    } catch(error) { console.warn('QR não pôde ser gerado:',error); return '<span class="muted">QR indisponível</span>'; }
  }
  const EAN_L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const EAN_G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const EAN_R=['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
  const EAN_PARITY=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
  function barcodeSvg(code) {
    const digits=String(code||''); if(!/^\d{13}$/.test(digits)) return '<span class="muted">Código de barras indisponível</span>';
    let bits='101'; const parity=EAN_PARITY[Number(digits[0])];
    for(let i=1;i<=6;i++) bits+=(parity[i-1]==='L'?EAN_L:EAN_G)[Number(digits[i])];
    bits+='01010'; for(let i=7;i<13;i++) bits+=EAN_R[Number(digits[i])]; bits+='101';
    const barWidth=2, height=54, quiet=10, width=bits.length*barWidth+quiet*2;
    const rects=[...bits].map((bit,i)=>bit==='1'?`<rect x="${quiet+i*barWidth}" y="0" width="${barWidth}" height="${height}"/>`:'').join('');
    return `<svg class="barcode-svg" viewBox="0 0 ${width} 72" role="img" aria-label="Código de barras ${digits}"><rect width="${width}" height="72" fill="#fff"/><g fill="#111827">${rects}</g><text x="${width/2}" y="68" text-anchor="middle" font-size="11" fill="#111827" letter-spacing="1">${digits}</text></svg>`;
  }

  function renderShell() {
    const root=$('#appShell'); root.classList.remove('hidden');
    $$('.nav-item').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===currentView));
    const meta={dashboard:['Painel inicial','VISÃO GERAL'],shopping:['Compras','SUPERMERCADO'],products:['Produtos','CATÁLOGO'],services:['Serviços e receitas','CUSTOS E ORÇAMENTOS'],obligations:['Contas e compromissos','PARCELAS E MENSALIDADES'],finance:['Movimentações','CONTROLE FINANCEIRO'],reports:['Relatórios','ANÁLISE'],settings:['Configurações','DADOS E BACKUP']}[currentView]||['Painel inicial','VISÃO GERAL'];
    $('#pageTitle').textContent=meta[0]; $('#topEyebrow').textContent=meta[1]; updateHeader();
    $('#viewRoot').innerHTML=renderCurrentView();
  }
  function renderCurrentView() {
    switch(currentView){
      case 'shopping': return renderShopping();
      case 'products': return renderProducts();
      case 'services': return renderServices();
      case 'obligations': return renderObligations();
      case 'finance': return renderFinance();
      case 'reports': return renderReports();
      case 'settings': return renderSettings();
      default: return renderDashboard();
    }
  }
  function pageIntro(title,description,button='') {
    return `<div class="page-intro"><div><h2>${title}</h2><p>${description}</p></div>${button}</div>`;
  }
  function renderDashboard() {
    const balance=transactionsBalance(), year=selectedYear;
    const yearTx=state.transactions.filter(t=>new Date(t.date).getFullYear()===year);
    const income=total(yearTx.filter(t=>t.type==='income'),t=>t.amount), expense=total(yearTx.filter(t=>t.type==='expense'),t=>t.amount);
    const pending=obligationsForYear(year).filter(x=>x.payment?.status!=='paid');
    const pendingTotal=total(pending,x=>x.amount);
    const recent=[...state.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);
    const quick=state.products.slice(0,5);
    return `${pageIntro('Seu resumo financeiro','Acompanhe o saldo, os custos dos serviços e os compromissos do ano selecionado.',`<label class="year-control">Ano <select id="dashboardYear">${yearOptions(year)}</select></label>`)}
      <section class="metric-grid">
        <article class="metric-card balance-card"><span>Saldo atual</span><strong>${money(balance)}</strong><small>Entradas menos saídas lançadas</small><i>↗</i></article>
        <article class="metric-card"><span>Entradas em ${year}</span><strong>${money(income)}</strong><small>${yearTx.filter(t=>t.type==='income').length} lançamento(s)</small><i>＋</i></article>
        <article class="metric-card"><span>Saídas em ${year}</span><strong>${money(expense)}</strong><small>${yearTx.filter(t=>t.type==='expense').length} lançamento(s)</small><i>−</i></article>
        <article class="metric-card"><span>Parcelas pendentes em ${year}</span><strong>${money(pendingTotal)}</strong><small>${pending.length} parcela(s) ainda não paga(s)</small><i>◷</i></article>
      </section>
      <div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h3>Movimentações recentes</h3><p>Últimos registros lançados no saldo</p></div><button class="button subtle small" data-view="finance">Ver todas</button></div>
        ${recent.length?`<div class="transaction-list">${recent.map(transactionRow).join('')}</div>`:emptyState('Nenhuma movimentação','Cadastre uma entrada ou uma despesa para iniciar o controle.')}
      </section><section class="panel"><div class="panel-heading"><div><h3>Atalhos</h3><p>Cadastros e operações frequentes</p></div></div>
        <div class="shortcut-grid"><button data-action="new-product"><span>📦</span><b>Novo produto</b><small>Catálogo e códigos</small></button><button data-action="new-service"><span>🧁</span><b>Calcular serviço</b><small>Ingredientes e custos</small></button><button data-action="new-obligation"><span>🧾</span><b>Nova mensalidade</b><small>Parcelas e contas</small></button><button data-action="new-transaction"><span>💳</span><b>Lançamento manual</b><small>Entrada ou despesa</small></button></div>
      </section></div>
      <section class="panel"><div class="panel-heading"><div><h3>Produtos cadastrados</h3><p>Resumo do catálogo e custo de compra por embalagem</p></div><button class="button outline small" data-view="products">Abrir catálogo</button></div>
        ${quick.length?`<div class="quick-products">${quick.map(p=>`<div><span class="product-emoji">${escapeHTML(p.icon||'📦')}</span><div><b>${escapeHTML(p.name)}</b><small>${escapeHTML(p.productCode||'')}</small></div><strong>${money(p.totalPrice)}</strong></div>`).join('')}</div>`:emptyState('Catálogo vazio','Cadastre os produtos e seus preços de compra.')}
      </section>`;
  }
  function emptyState(title,description) { return `<div class="empty-state"><span>◌</span><b>${title}</b><p>${description}</p></div>`; }
  function yearOptions(selected) { const years=new Set(); for(let y=new Date().getFullYear()-3;y<=new Date().getFullYear()+5;y++) years.add(y); state.obligations.forEach(o=>years.add(Number(o.startYear))); return [...years].sort((a,b)=>a-b).map(y=>`<option value="${y}" ${y===Number(selected)?'selected':''}>${y}</option>`).join(''); }
  function transactionRow(t) {
    const income=t.type==='income'; const label=t.source==='service_run'?'Execução de serviço':t.source==='obligation'?'Parcela / compromisso':t.source==='purchase'?'Compra de supermercado':'Manual';
    return `<div class="transaction-row"><span class="transaction-icon ${income?'income':'expense'}">${income?'↗':'↘'}</span><div class="transaction-copy"><b>${escapeHTML(t.description)}</b><small>${dateBR(t.date)} · ${escapeHTML(t.category||'outros')} · ${label}</small></div><strong class="${income?'income-text':'expense-text'}">${income?'+':'−'} ${money(t.amount)}</strong><button class="mini-action danger" data-action="delete-transaction" data-id="${t.id}" title="Excluir lançamento">×</button></div>`;
  }
  function renderProducts() {
    const products=state.products.filter(p=>normalizeName(p.name).includes(normalizeName(searchProducts))||String(p.productCode).toLowerCase().includes(searchProducts.toLowerCase())||String(p.barcode).includes(searchProducts));
    const table=products.length?products.map(p=>`<tr><td><div class="product-name-cell"><span class="product-emoji">${escapeHTML(p.icon||'📦')}</span><div><b>${escapeHTML(p.name)}</b><small>${escapeHTML(p.productCode||'')}</small></div></div></td><td>${escapeHTML(p.category||'outros')}</td><td>${Number(p.purchaseQty||1)} ${escapeHTML(p.purchaseUnit||'un')}</td><td><b>${money(p.totalPrice)}</b><small class="sub-cell">${money(productUnitCost(p))} / ${p.baseUnit||UNIT_GROUPS[unitGroup(p.purchaseUnit||'un')].base}</small></td><td><code>${escapeHTML(p.barcode||'')}</code></td><td><div class="table-actions"><button class="mini-action" data-action="show-codes" data-id="${p.id}" title="QR e código de barras">▦</button><button class="mini-action" data-action="edit-product" data-id="${p.id}" title="Editar">✎</button><button class="mini-action danger" data-action="delete-product" data-id="${p.id}" title="Excluir">×</button></div></td></tr>`).join(''):`<tr><td colspan="6">${emptyState('Nenhum produto encontrado','Cadastre um produto ou altere a pesquisa.')}</td></tr>`;
    return `${pageIntro('Catálogo de produtos','Informe o conteúdo total da embalagem e o preço pago. O sistema converte unidades para calcular o consumo em serviços.',`<button class="button primary" data-action="new-product">＋ Novo produto</button>`)}
      <section class="panel"><div class="toolbar"><label class="search-field">⌕ <input id="productSearch" value="${escapeHTML(searchProducts)}" placeholder="Pesquisar por nome, código ou barcode"></label><span class="muted">${state.products.length} produto(s)</span></div>
        <div class="table-wrap"><table><thead><tr><th>Produto</th><th>Categoria</th><th>Embalagem</th><th>Preço de compra</th><th>EAN-13</th><th>Ações</th></tr></thead><tbody id="productTableBody">${table}</tbody></table></div>
      </section><div class="notice-line">📌 O código interno e o EAN-13 são gerados automaticamente em sequência. Produtos com nome/código repetido não são aceitos; nomes semelhantes geram um alerta antes do cadastro.</div>`;
  }
  function renderShopping() {
    const products=state.products.filter(p=>normalizeName(p.name).includes(normalizeName(searchShopping)));
    const cartTotal=total(state.activeCart,i=>i.unitPrice*i.quantity);
    const rows=state.activeCart.map(item=>`<tr><td><b>${escapeHTML(item.name)}</b><small>${escapeHTML(item.productCode||'')}</small></td><td>${money(item.unitPrice)}</td><td><input class="quantity-input" type="number" min="0.001" step="0.001" data-cart-qty="${item.id}" value="${item.quantity}"></td><td><b>${money(item.unitPrice*item.quantity)}</b></td><td><button class="mini-action danger" data-action="remove-cart-item" data-id="${item.id}">×</button></td></tr>`).join('');
    const productCards=products.map(p=>`<article class="shop-product"><span class="product-emoji">${escapeHTML(p.icon||'📦')}</span><div><b>${escapeHTML(p.name)}</b><small>${escapeHTML(p.purchaseQty||1)} ${escapeHTML(p.purchaseUnit||'un')} · ${escapeHTML(p.productCode||'')}</small><strong>${money(p.totalPrice)}</strong></div><button class="add-button" data-action="add-cart" data-id="${p.id}">＋</button></article>`).join('');
    const histories=state.purchases.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,8);
    return `${pageIntro('Caixa de compras','Monte uma lista, salve sem lançar no saldo ou finalize a compra com lançamento financeiro opcional.',`<button class="button outline" data-action="save-shopping-list" ${state.activeCart.length?'':'disabled'}>Salvar lista</button>`)}
      <div class="shopping-layout"><section class="panel"><div class="panel-heading"><div><h3>Produtos disponíveis</h3><p>Selecione os itens para o carrinho</p></div></div><label class="search-field full-search">⌕ <input id="shoppingSearch" value="${escapeHTML(searchShopping)}" placeholder="Buscar produto"></label><div class="shop-product-grid">${productCards||emptyState('Nenhum produto no catálogo','Cadastre produtos antes de iniciar uma compra.')}</div></section>
      <section class="panel cart-panel"><div class="panel-heading"><div><h3>Carrinho atual</h3><p>${state.activeCart.length} item(ns)</p></div><button class="mini-action danger" data-action="clear-cart" ${state.activeCart.length?'':'disabled'} title="Esvaziar carrinho">×</button></div>
        <div class="table-wrap"><table><thead><tr><th>Produto</th><th>Unitário</th><th>Qtd.</th><th>Subtotal</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="5" class="table-empty">Carrinho vazio.</td></tr>'}</tbody></table></div><div class="cart-total"><span>Total estimado</span><strong>${money(cartTotal)}</strong></div><button class="button primary full" data-action="checkout" ${state.activeCart.length?'':'disabled'}>Finalizar compra</button></section></div>
      <section class="panel"><div class="panel-heading"><div><h3>Listas e compras recentes</h3><p>Listas salvas não alteram o saldo; compras finalizadas ficam no histórico.</p></div></div>${histories.length?`<div class="history-list">${histories.map(p=>`<div class="history-row"><div><b>${escapeHTML(p.name)}</b><small>${dateBR(p.createdAt)} · ${p.status==='saved'?'Lista salva':(p.addedToFinance?'Lançada no financeiro':'Sem lançamento')}</small></div><strong>${money(p.total)}</strong><div class="table-actions">${p.status==='saved'?`<button class="button subtle small" data-action="load-list" data-id="${p.id}">Carregar</button>`:''}<button class="mini-action danger" data-action="delete-purchase" data-id="${p.id}">×</button></div></div>`).join('')}</div>`:emptyState('Sem listas ou compras','Salve uma lista para consultar depois.')}</section>`;
  }

  function renderServiceItemRow(item={}) {
    const product=state.products.find(p=>p.id===item.productId);
    const selectedGroup=product?unitGroup(product.purchaseUnit||'un'):(item.baseUnit==='g'?'mass':item.baseUnit==='ml'?'volume':(item.group||'count'));
    const unitList=UNIT_GROUPS[selectedGroup].units;
    const selectedUnit=unitList.includes(item.unit)?item.unit:(product?.purchaseUnit||unitList[0]);
    const options=state.products.map(p=>`<option value="${p.id}" ${p.id===item.productId?'selected':''}>${escapeHTML(p.name)} · ${escapeHTML(p.productCode||'')}</option>`).join('');
    const missing=item.productId&&!product?`<option value="${escapeHTML(item.productId)}" selected>Produto removido: ${escapeHTML(item.productName||'')}</option>`:'';
    return `<div class="service-item-row" data-item-row><label class="field item-product">Produto<select name="itemProduct" required><option value="">Selecione um produto</option>${missing}${options}</select></label><label class="field item-quantity">Quantidade<input name="itemQuantity" type="number" min="0.001" step="0.001" value="${Number(item.quantity||1)}" required></label><label class="field item-unit">Unidade<select name="itemUnit">${unitList.map(u=>`<option value="${u}" ${u===selectedUnit?'selected':''}>${u}</option>`).join('')}</select></label><div class="item-cost"><small>Custo estimado</small><b data-line-cost>${money(Number(item.cost)||0)}</b></div><button type="button" class="mini-action danger remove-line" data-action="remove-service-item" title="Remover ingrediente">×</button></div>`;
  }
  function calculateServiceForm(form) {
    const rows=$$('[data-item-row]',form); let ingredients=0;
    rows.forEach(row=>{
      const product=state.products.find(p=>p.id===$('select[name="itemProduct"]',row).value);
      const qty=Number($('input[name="itemQuantity"]',row).value)||0; const unit=$('select[name="itemUnit"]',row).value;
      let value=0;
      if(product){ const result=itemCost(product,qty,unit); value=result===null?0:result; }
      else { const saved=state.services.find(s=>s.items?.some(i=>i.productId===$('select[name="itemProduct"]',row).value)); const savedItem=saved?.items.find(i=>i.productId===$('select[name="itemProduct"]',row).value); value=savedItem?moneyRound((Number(savedItem.unitCostBase)||0)*amountToBase(qty,unit)):0; }
      ingredients+=value; $('[data-line-cost]',row).textContent=money(value);
    });
    const labor=Number($('input[name="laborCost"]',form)?.value)||0, gas=Number($('input[name="gasCost"]',form)?.value)||0, energy=Number($('input[name="energyCost"]',form)?.value)||0, other=Number($('input[name="otherCost"]',form)?.value)||0;
    const cost=moneyRound(ingredients+labor+gas+energy+other), sale=Number($('input[name="sellingPrice"]',form)?.value)||0;
    const output=$('[data-cost-summary]',form);
    if(output) output.innerHTML=`<div><span>Ingredientes</span><b>${money(ingredients)}</b></div><div><span>Mão de obra</span><b>${money(labor)}</b></div><div><span>Gás</span><b>${money(gas)}</b></div><div><span>Energia</span><b>${money(energy)}</b></div><div><span>Outros custos</span><b>${money(other)}</b></div><div class="cost-total"><span>Custo total</span><strong>${money(cost)}</strong></div><div><span>Preço de venda sugerido/definido</span><b>${sale?money(sale):'Não informado'}</b></div><div><span>Diferença estimada</span><b class="${sale-cost>=0?'income-text':'expense-text'}">${sale?money(sale-cost):'—'}</b></div>`;
    return {ingredients:moneyRound(ingredients),labor:moneyRound(labor),gas:moneyRound(gas),energy:moneyRound(energy),other:moneyRound(other),totalCost:cost,sellingPrice:moneyRound(sale)};
  }
  function renderServiceForm(service=null) {
    const items=service?.items?.length?service.items:(state.products.length?[{}]:[]);
    return `<div class="modal-backdrop"><section class="modal-card modal-wide" role="dialog" aria-modal="true"><div class="modal-header"><div><span class="eyebrow">FICHA DE CUSTOS</span><h2>${service?'Editar serviço / receita':'Novo serviço / receita'}</h2></div><button class="icon-button" data-action="close-modal">×</button></div>
      <form class="form-grid" data-form="service" data-id="${service?.id||''}"><label class="field full-field">Nome do serviço / produto final<input name="name" maxlength="120" required value="${escapeHTML(service?.name||'') }" placeholder="Ex.: Bolo de chocolate"></label><label class="field full-field">Descrição<textarea name="description" rows="2">${escapeHTML(service?.description||'')}</textarea></label>
      <div class="section-title full-field"><div><h3>Produtos e ingredientes</h3><p>Informe somente a quantidade consumida na receita. O custo será proporcional ao preço da embalagem cadastrada.</p></div><button type="button" class="button outline small" data-action="add-service-item">＋ Ingrediente</button></div>
      <div class="service-items full-field" data-service-items>${items.map(renderServiceItemRow).join('')}</div>
      <div class="cost-input-grid full-field"><label class="field">Mão de obra (R$)<input name="laborCost" type="number" min="0" step="0.01" value="${Number(service?.laborCost||0)}"></label><label class="field">Gás (R$)<input name="gasCost" type="number" min="0" step="0.01" value="${Number(service?.gasCost||0)}"></label><label class="field">Energia (R$)<input name="energyCost" type="number" min="0" step="0.01" value="${Number(service?.energyCost||0)}"></label><label class="field">Outros custos (R$)<input name="otherCost" type="number" min="0" step="0.01" value="${Number(service?.otherCost||0)}"></label><label class="field">Preço de venda (opcional)<input name="sellingPrice" type="number" min="0" step="0.01" value="${Number(service?.sellingPrice||0)}"></label></div>
      <div class="cost-summary full-field" data-cost-summary><p>Adicione ingredientes para calcular os custos.</p></div>
      <div class="notice-line full-field">Salvar orçamento apenas registra a ficha de custos. Registrar execução lança o custo total como despesa e reduz o saldo financeiro.</div>
      <div class="modal-actions full-field"><button type="button" class="button subtle" data-action="close-modal">Cancelar</button><button class="button outline" type="submit" name="submitMode" value="save">Salvar orçamento</button><button class="button primary" type="submit" name="submitMode" value="run">Registrar execução e lançar custo</button></div></form></section></div>`;
  }
  function renderServices() {
    const cards=state.services.map(s=>`<article class="service-card"><div class="service-card-head"><span>🧾</span><div><b>${escapeHTML(s.name)}</b><small>${escapeHTML(s.description||'Sem descrição')}</small></div><strong>${money(s.totalCost)}</strong></div><div class="service-card-meta"><span>${s.items?.length||0} ingrediente(s)</span><span>Venda: ${s.sellingPrice?money(s.sellingPrice):'—'}</span><span>Diferença: ${s.sellingPrice?money(s.sellingPrice-s.totalCost):'—'}</span></div><div class="service-actions"><button class="button outline small" data-action="edit-service" data-id="${s.id}">Editar ficha</button><button class="button primary small" data-action="run-service" data-id="${s.id}">Executar e lançar custo</button><button class="mini-action danger" data-action="delete-service" data-id="${s.id}">×</button></div></article>`).join('');
    const runs=state.serviceRuns.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,12);
    return `${pageIntro('Serviços, receitas e orçamentos','Monte uma ficha técnica, calcule ingredientes por gramas/mililitros/unidades e some mão de obra, gás, energia e outros custos.',`<button class="button primary" data-action="new-service">＋ Novo serviço</button>`)}
      ${!state.products.length?'<div class="notice-line warning">Cadastre os produtos e preços de compra antes de calcular ingredientes. Custos fixos podem ser informados mesmo sem produtos.</div>':''}
      <section class="service-grid">${cards||emptyState('Nenhum serviço salvo','Crie uma receita, orçamento ou serviço para reutilizar os cálculos.')}</section>
      <section class="panel"><div class="panel-heading"><div><h3>Execuções registradas</h3><p>Custos que foram efetivamente lançados como despesas</p></div></div>${runs.length?`<div class="history-list">${runs.map(r=>`<div class="history-row"><div><b>${escapeHTML(r.name)}</b><small>${dateBR(r.date)} · ${r.transactionId?'Lançado no financeiro':'Sem lançamento'}</small></div><strong>${money(r.totalCost)}</strong><button class="mini-action danger" data-action="delete-service-run" data-id="${r.id}" title="Excluir execução e estornar despesa">×</button></div>`).join('')}</div>`:emptyState('Nenhuma execução','Executar um serviço lança o custo total como uma despesa.')}</section>`;
  }
  function obligationsForYear(year) {
    const result=[];
    for(const obligation of state.obligations){
      const start=(Number(obligation.startYear)*12)+(Number(obligation.startMonth)-1);
      if (obligation.recurring) {
        if (Number(year) < Number(obligation.startYear)) continue;
        const firstMonth = Number(year) === Number(obligation.startYear) ? Number(obligation.startMonth) : 1;
        for (let month=firstMonth; month<=12; month++) {
          const yearMonth=`${year}-${String(month).padStart(2,'0')}`;
          const payment=state.installments.find(x=>x.obligationId===obligation.id&&x.yearMonth===yearMonth)||null;
          result.push({obligation,yearMonth,year:Number(year),month,index:month-Number(obligation.startMonth)+1,totalInstallments:null,amount:Number(obligation.monthlyAmount)||0,payment});
        }
      } else {
        const months=Number(obligation.installmentsCount||0);
        for(let i=0;i<months;i++){
          const absolute=start+i, y=Math.floor(absolute/12), m=(absolute%12)+1; if(y!==Number(year)) continue;
          const yearMonth=`${y}-${String(m).padStart(2,'0')}`;
          const payment=state.installments.find(x=>x.obligationId===obligation.id&&x.yearMonth===yearMonth)||null;
          result.push({obligation,yearMonth,year:y,month:m,index:i+1,totalInstallments:months,amount:Number(obligation.monthlyAmount)||0,payment});
        }
      }
    }
    return result.sort((a,b)=>a.month-b.month||a.obligation.name.localeCompare(b.obligation.name,'pt-BR'));
  }
  function renderObligations() {
    const rows=obligationsForYear(selectedYear);
    const paid=rows.filter(r=>r.payment?.status==='paid'); const pending=rows.filter(r=>r.payment?.status!=='paid');
    const groups=Array.from({length:12},(_,i)=>({month:i+1,rows:rows.filter(r=>r.month===i+1)})).filter(g=>g.rows.length);
    const groupHTML=groups.map(g=>`<section class="month-group"><h3>${monthName(g.month)} <span>${g.rows.length} parcela(s)</span></h3><div class="table-wrap"><table><thead><tr><th>Compromisso</th><th>Parcela</th><th>Valor</th><th>Situação</th><th>Financeiro</th><th>Ação</th></tr></thead><tbody>${g.rows.map(r=>{
      const isPaid=r.payment?.status==='paid'; const duePast=new Date(`${r.yearMonth}-28T12:00:00`)<new Date()&&!isPaid;
      return `<tr><td><div class="table-primary">${escapeHTML(r.obligation.name)}</div><small>${escapeHTML(TYPE_LABELS[r.obligation.type]||r.obligation.type)}</small></td><td>${r.obligation.recurring?'Mensal':`${r.index}/${r.totalInstallments}`}</td><td><b>${money(r.amount)}</b></td><td><span class="status-pill ${isPaid?'paid':duePast?'late':'pending'}">${isPaid?'Paga':duePast?'Pendente (vencida)':'Pendente'}</span></td><td><span class="launch-pill ${r.payment?.launched?'launched':'not-launched'}">${r.payment?.launched?'Lançada':'Sem lançamento'}</span></td><td><button class="button subtle small" data-action="edit-installment" data-id="${r.obligation.id}" data-yearmonth="${r.yearMonth}">${isPaid?'Alterar':'Registrar'}</button></td></tr>`;
    }).join('')}</tbody></table></div></section>`).join('');
    const allObligations=state.obligations.map(o=>`<div class="obligation-list-row"><div><b>${escapeHTML(o.name)}</b><small>${escapeHTML(TYPE_LABELS[o.type]||o.type)} · ${o.recurring?'Recorrente':`${o.installmentsCount} parcela(s)`} · Início ${String(o.startMonth).padStart(2,'0')}/${o.startYear}</small></div><strong>${money(o.monthlyAmount)}<small>/mês</small></strong><div class="table-actions"><button class="mini-action" data-action="edit-obligation" data-id="${o.id}">✎</button><button class="mini-action danger" data-action="delete-obligation" data-id="${o.id}">×</button></div></div>`).join('');
    return `${pageIntro('Contas, mensalidades e dívidas','Organize energia, internet, streaming, jogos, cartão de crédito, empréstimos e financiamentos. Cada parcela pode ser paga sem lançamento ou lançada no saldo.',`<label class="year-control">Ano <select id="obligationYear">${yearOptions(selectedYear)}</select></label><button class="button primary" data-action="new-obligation">＋ Novo compromisso</button>`)}
      <section class="metric-grid compact-metrics"><article class="metric-card"><span>Total previsto</span><strong>${money(total(rows,r=>r.amount))}</strong><small>${selectedYear}</small></article><article class="metric-card"><span>Pagas</span><strong>${paid.length}</strong><small>${money(total(paid,r=>r.amount))}</small></article><article class="metric-card"><span>Pendentes</span><strong>${pending.length}</strong><small>${money(total(pending,r=>r.amount))}</small></article></section>
      <section class="panel"><div class="panel-heading"><div><h3>Parcelas de ${selectedYear}</h3><p>O status e o lançamento são controlados por mês e parcela.</p></div></div>${groupHTML||emptyState('Nenhuma parcela prevista neste ano','Cadastre uma mensalidade recorrente ou uma dívida parcelada.')}</section>
      <section class="panel"><div class="panel-heading"><div><h3>Compromissos cadastrados</h3><p>Edite ou exclua os modelos e suas regras de recorrência.</p></div></div>${allObligations?`<div class="obligation-list">${allObligations}</div>`:emptyState('Sem compromissos cadastrados','Adicione sua primeira conta, mensalidade ou dívida.')}</section>`;
  }
  function renderObligationForm(obligation=null) {
    const current=new Date();
    return `<div class="modal-backdrop"><section class="modal-card" role="dialog" aria-modal="true"><div class="modal-header"><div><span class="eyebrow">CONTAS E DÍVIDAS</span><h2>${obligation?'Editar compromisso':'Novo compromisso'}</h2></div><button class="icon-button" data-action="close-modal">×</button></div><form class="form-grid" data-form="obligation" data-id="${obligation?.id||''}">
      <label class="field full-field">Nome<input name="name" required maxlength="120" value="${escapeHTML(obligation?.name||'')}" placeholder="Ex.: Internet residencial / Cartão de crédito"></label>
      <label class="field">Tipo<select name="type">${Object.entries(TYPE_LABELS).map(([v,l])=>`<option value="${v}" ${obligation?.type===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="field">Valor mensal / parcela (R$)<input name="monthlyAmount" type="number" min="0" step="0.01" value="${Number(obligation?.monthlyAmount||0)}"><small class="field-help">Para dívidas parceladas, você também pode informar o total e a quantidade de parcelas; o valor será calculado.</small></label>
      <label class="field full-field">Descrição<textarea name="description" rows="2">${escapeHTML(obligation?.description||'')}</textarea></label>
      <label class="field">Ano da primeira parcela<input name="startYear" type="number" min="2000" max="2200" required value="${Number(obligation?.startYear||current.getFullYear())}"></label>
      <label class="field">Mês inicial<select name="startMonth">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${(Number(obligation?.startMonth||current.getMonth()+1))===i+1?'selected':''}>${monthName(i+1)}</option>`).join('')}</select></label>
      <label class="field">Quantidade de parcelas<input name="installmentsCount" type="number" min="1" max="600" value="${Number(obligation?.installmentsCount||12)}"></label>
      <label class="field">Total da dívida (opcional)<input name="totalAmount" type="number" min="0" step="0.01" value="${Number(obligation?.totalAmount||0)}"></label>
      <label class="checkbox-field full-field"><input type="checkbox" name="recurring" ${obligation?.recurring?'checked':''}><span><b>Mensalidade recorrente sem data final</b><small>Ex.: energia, internet, streaming ou assinatura de jogos. Será exibida em cada mês a partir da data inicial.</small></span></label>
      ${obligation?'':`<label class="checkbox-field full-field"><input type="checkbox" name="launchFirst"><span><b>Lançar a primeira parcela no financeiro agora</b><small>Marca a primeira parcela como paga e registra uma despesa, reduzindo o saldo.</small></span></label>`}
      <div class="modal-actions full-field"><button type="button" class="button subtle" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">Salvar compromisso</button></div></form></section></div>`;
  }
  function renderPaymentForm(obligationId,yearMonth) {
    const obligation=state.obligations.find(o=>o.id===obligationId); const current=state.installments.find(x=>x.obligationId===obligationId&&x.yearMonth===yearMonth);
    if(!obligation) return '';
    const [year,month]=yearMonth.split('-').map(Number);
    return `<div class="modal-backdrop"><section class="modal-card" role="dialog" aria-modal="true"><div class="modal-header"><div><span class="eyebrow">PAGAMENTO DA PARCELA</span><h2>${escapeHTML(obligation.name)}</h2></div><button class="icon-button" data-action="close-modal">×</button></div><form class="form-grid" data-form="payment" data-obligation-id="${obligationId}" data-yearmonth="${yearMonth}"><div class="checkout-total full-field"><span>${monthName(month)} de ${year}</span><strong>${money(obligation.monthlyAmount)}</strong></div><label class="field full-field">Situação<select name="status"><option value="pending" ${current?.status!=='paid'?'selected':''}>Pendente</option><option value="paid" ${current?.status==='paid'?'selected':''}>Paga</option></select></label><label class="checkbox-field full-field"><input type="checkbox" name="launch" ${current?.launched?'checked':''}><span><b>Lançar no controle financeiro</b><small>Quando marcado, cria uma despesa e desconta o valor do saldo. Desmarcar uma parcela já lançada estorna o lançamento vinculado.</small></span></label><div class="modal-actions full-field"><button type="button" class="button subtle" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">Salvar pagamento</button></div></form></section></div>`;
  }
  function renderFinance() {
    const transactions=state.transactions.slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
    const balance=transactionsBalance(), income=total(transactions.filter(t=>t.type==='income'),t=>t.amount),expense=total(transactions.filter(t=>t.type==='expense'),t=>t.amount);
    return `${pageIntro('Movimentações financeiras','Somente operações lançadas alteram o saldo. Orçamentos, parcelas sem lançamento e listas salvas permanecem fora do saldo.',`<button class="button primary" data-action="new-transaction">＋ Novo lançamento</button>`)}
      <section class="metric-grid"><article class="metric-card balance-card"><span>Saldo atual</span><strong>${money(balance)}</strong><small>Saldo acumulado</small></article><article class="metric-card"><span>Entradas acumuladas</span><strong>${money(income)}</strong><small>${transactions.filter(t=>t.type==='income').length} registro(s)</small></article><article class="metric-card"><span>Saídas acumuladas</span><strong>${money(expense)}</strong><small>${transactions.filter(t=>t.type==='expense').length} registro(s)</small></article></section>
      <section class="panel"><div class="panel-heading"><div><h3>Extrato</h3><p>Movimentações manuais, compras, serviços e parcelas lançadas</p></div><button class="button outline small" data-action="export-csv">⇩ Exportar CSV</button></div>
        ${transactions.length?`<div class="transaction-list">${transactions.map(t=>`<div class="transaction-row"><span class="transaction-icon ${t.type==='income'?'income':'expense'}">${t.type==='income'?'↗':'↘'}</span><div class="transaction-copy"><b>${escapeHTML(t.description)}</b><small>${dateBR(t.date)} · ${escapeHTML(t.category||'outros')} · ${escapeHTML(t.source||'manual')}</small></div><strong class="${t.type==='income'?'income-text':'expense-text'}">${t.type==='income'?'+':'−'} ${money(t.amount)}</strong><div class="table-actions">${t.source==='manual'?`<button class="mini-action" data-action="edit-transaction" data-id="${t.id}">✎</button>`:''}<button class="mini-action danger" data-action="delete-transaction" data-id="${t.id}">×</button></div></div>`).join('')}</div>`:emptyState('Extrato vazio','Registre entradas e despesas para visualizar o saldo.')}
      </section>`;
  }
  function renderTransactionForm(tx=null) {
    return `<div class="modal-backdrop"><section class="modal-card" role="dialog" aria-modal="true"><div class="modal-header"><div><span class="eyebrow">CONTROLE FINANCEIRO</span><h2>${tx?'Editar lançamento':'Novo lançamento'}</h2></div><button class="icon-button" data-action="close-modal">×</button></div><form class="form-grid" data-form="transaction" data-id="${tx?.id||''}"><label class="field">Tipo<select name="type">${transactionTypeOptions(tx?.type||'expense')}</select></label><label class="field">Valor (R$)<input name="amount" type="number" min="0.01" step="0.01" required value="${Number(tx?.amount||'')}"></label><label class="field full-field">Descrição<input name="description" maxlength="160" required value="${escapeHTML(tx?.description||'')}"></label><label class="field">Categoria<select name="category">${categoryOptions(tx?.category||'outros')}</select></label><label class="field">Data e hora<input name="date" type="datetime-local" required value="${dateInput(tx?.date||Date.now())}"></label><label class="field full-field">Observações<textarea name="notes" rows="2">${escapeHTML(tx?.notes||'')}</textarea></label><div class="modal-actions full-field"><button type="button" class="button subtle" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">Salvar lançamento</button></div></form></section></div>`;
  }
  function renderReports() {
    const rows=state.transactions.filter(t=>new Date(t.date).getFullYear()===selectedYear);
    const inc=total(rows.filter(t=>t.type==='income'),t=>t.amount),exp=total(rows.filter(t=>t.type==='expense'),t=>t.amount);
    const categories=Object.entries(rows.filter(t=>t.type==='expense').reduce((map,t)=>{const key=t.category||'outros';map[key]=(map[key]||0)+Number(t.amount);return map;},{})).sort((a,b)=>b[1]-a[1]);
    const obligationRows=obligationsForYear(selectedYear);
    return `${pageIntro('Relatórios','Resumo anual do que foi efetivamente lançado e do que continua previsto para pagamento.',`<label class="year-control">Ano <select id="reportYear">${yearOptions(selectedYear)}</select></label><button class="button outline" data-action="export-csv">⇩ CSV</button>`)}
      <section class="metric-grid"><article class="metric-card"><span>Entradas em ${selectedYear}</span><strong>${money(inc)}</strong></article><article class="metric-card"><span>Despesas em ${selectedYear}</span><strong>${money(exp)}</strong></article><article class="metric-card balance-card"><span>Resultado do ano</span><strong>${money(inc-exp)}</strong></article><article class="metric-card"><span>Compromissos pendentes</span><strong>${money(total(obligationRows.filter(r=>r.payment?.status!=='paid'),r=>r.amount))}</strong></article></section>
      <div class="report-grid"><section class="panel"><div class="panel-heading"><div><h3>Despesas por categoria</h3><p>Somente lançamentos realizados</p></div></div>${categories.length?categories.map(([name,value])=>`<div class="report-bar-row"><div><span>${escapeHTML(name)}</span><b>${money(value)}</b></div><div class="bar-track"><i style="width:${exp?value/exp*100:0}%"></i></div></div>`).join(''):emptyState('Sem despesas','Os dados aparecerão quando houver saídas.')}</section>
      <section class="panel"><div class="panel-heading"><div><h3>Despesas por mês</h3><p>Valores registrados no extrato</p></div></div>${Array.from({length:12},(_,i)=>{const val=total(rows.filter(t=>t.type==='expense'&&new Date(t.date).getMonth()===i),t=>t.amount);return `<div class="monthly-row"><span>${monthName(i+1)}</span><div class="bar-track"><i style="width:${exp?val/exp*100:0}%"></i></div><b>${money(val)}</b></div>`;}).join('')}</section></div>`;
  }
  function renderSettings() {
    return `${pageIntro('Configurações e dados','Faça cópias de segurança e restaure os registros. Não existe login nem cofre de credenciais nesta edição.')}
      <div class="settings-grid"><section class="panel"><div class="panel-heading"><div><h3>Backup e restauração</h3><p>O arquivo JSON contém produtos, compras, serviços, parcelas e movimentações.</p></div></div><div class="settings-actions"><button class="button primary" data-action="export-backup">⇩ Exportar backup JSON</button><label class="button outline file-button">Importar backup JSON<input id="backupFile" type="file" accept="application/json,.json" hidden></label></div><div class="notice-line">Armazene os backups em local protegido. No modo LocalStorage, os registros ficam no perfil do navegador. No modo Flask, ficam em um arquivo SQLite na pasta instance.</div></section>
      <section class="panel"><div class="panel-heading"><div><h3>Resumo dos registros</h3><p>Contagem atual no armazenamento</p></div></div><div class="settings-counts"><div><b>${state.products.length}</b><span>Produtos</span></div><div><b>${state.services.length}</b><span>Serviços</span></div><div><b>${state.obligations.length}</b><span>Compromissos</span></div><div><b>${state.transactions.length}</b><span>Movimentações</span></div></div></section>
      <section class="panel danger-panel"><div class="panel-heading"><div><h3>Apagar todos os dados</h3><p>Remove todos os registros do armazenamento ativo.</p></div></div><button class="button danger-button" data-action="clear-data">Limpar dados do aplicativo</button></section></div>`;
  }

  function openProductForm(product=null) {
    const codes=product?{productCode:product.productCode,barcode:product.barcode}:productCodes();
    openModal(`<div class="modal-backdrop"><section class="modal-card" role="dialog" aria-modal="true"><div class="modal-header"><div><span class="eyebrow">CATÁLOGO</span><h2>${product?'Editar produto':'Novo produto'}</h2></div><button class="icon-button" data-action="close-modal">×</button></div><form class="form-grid" data-form="product" data-id="${product?.id||''}">
      <label class="field full-field">Nome do produto<input name="name" required maxlength="120" value="${escapeHTML(product?.name||'')}" placeholder="Ex.: Farinha de trigo"></label><label class="field">Ícone (opcional)<input name="icon" maxlength="8" value="${escapeHTML(product?.icon||'')}" placeholder="🌾"></label><label class="field">Categoria<select name="category">${categoryOptions(product?.category||'comida')}</select></label>
      <div class="field full-field"><span class="field-label">Quantidade total comprada e unidade</span><div class="inline-fields"><input name="purchaseQty" type="number" min="0.001" step="0.001" required value="${Number(product?.purchaseQty||1)}"><select name="purchaseUnit">${['un','g','kg','ml','L'].map(u=>`<option value="${u}" ${(product?.purchaseUnit||product?.unit||'un')===u?'selected':''}>${u}</option>`).join('')}</select></div><small class="field-help">Exemplo: 1 kg de farinha, 12 un de ovos ou 1 L de leite.</small></div>
      <label class="field full-field">Preço total pago pela embalagem (R$)<input name="totalPrice" type="number" min="0" step="0.01" required value="${Number(product?.totalPrice??product?.price??0)}"></label>
      <div class="code-preview full-field"><div><small>Código interno</small><b>${escapeHTML(codes.productCode||'')}</b></div><div><small>EAN-13 / código de barras</small><b>${escapeHTML(codes.barcode||'')}</b></div><span>Gerado automaticamente e não editável.</span></div>
      <div class="modal-actions full-field"><button type="button" class="button subtle" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">Salvar produto</button></div></form></section></div>`);
  }
  function openCodes(product) {
    openModal(`<div class="modal-backdrop"><section class="modal-card code-modal" role="dialog" aria-modal="true"><div class="modal-header"><div><span class="eyebrow">IDENTIFICAÇÃO DO PRODUTO</span><h2>${escapeHTML(product.name)}</h2></div><button class="icon-button" data-action="close-modal">×</button></div><div class="product-code-details"><div class="qr-panel">${svgQR(product.productCode)}<b>QR Code</b><small>${escapeHTML(product.productCode)}</small></div><div class="barcode-panel">${barcodeSvg(product.barcode)}<b>EAN-13</b><small>${escapeHTML(product.barcode)}</small></div></div><div class="notice-line">O QR Code contém o código interno. O código de barras EAN-13 é gerado para identificação interna do catálogo.</div><div class="modal-actions"><button class="button primary" data-action="close-modal">Fechar</button></div></section></div>`);
  }

  function addTransaction({type='expense',description,category='outros',amount,date=nowISO(),notes='',source='manual',sourceId=null}) {
    const value=Number(amount); if(!description?.trim()||!Number.isFinite(value)||value<=0) throw new Error('Informe uma descrição e um valor maior que zero.');
    const tx={id:uid('tx'),type,description:description.trim(),category,amount:moneyRound(value),date:new Date(date).toISOString(),notes:notes||'',source,sourceId,createdAt:nowISO()};
    state.transactions.unshift(tx); return tx;
  }
  function getServicePayload(form) {
    const name=$('input[name="name"]',form).value.trim(); if(!name) throw new Error('Informe o nome do serviço.');
    const items=[];
    $$('[data-item-row]',form).forEach(row=>{
      const productId=$('select[name="itemProduct"]',row).value, quantity=Number($('input[name="itemQuantity"]',row).value),unit=$('select[name="itemUnit"]',row).value;
      if(!productId || !Number.isFinite(quantity)||quantity<=0) throw new Error('Revise os ingredientes: produto e quantidade são obrigatórios.');
      const product=state.products.find(p=>p.id===productId);
      if(!product) {
        const oldService=state.services.find(s=>s.id===form.dataset.id);
        const snapshot=oldService?.items?.find(i=>i.productId===productId);
        if(!snapshot) throw new Error('Um ingrediente não está mais cadastrado no catálogo. Remova-o ou cadastre novamente o produto.');
        const unitGroupFromBase=snapshot.baseUnit==='g'?'mass':snapshot.baseUnit==='ml'?'volume':'count';
        if(unitGroupFromBase!==unitGroup(unit)) throw new Error(`Unidade incompatível para ${snapshot.productName}.`);
        const factor=UNIT_GROUPS[unitGroupFromBase].factor[unit]||1;
        items.push({...snapshot,quantity,unit,cost:moneyRound((Number(snapshot.unitCostBase)||0)*amountToBase(quantity,unit))});
        return;
      }
      if(unitGroup(product.purchaseUnit||'un')!==unitGroup(unit)) throw new Error(`Unidade incompatível para ${product.name}.`);
      items.push({productId,productName:product.name,quantity,unit,unitCostBase:productUnitCost(product),baseUnit:UNIT_GROUPS[unitGroup(product.purchaseUnit||'un')].base,cost:itemCost(product,quantity,unit)});
    });
    const costs=calculateServiceForm(form);
    return {name,description:$('textarea[name="description"]',form).value.trim(),items,...costs,createdAt:nowISO(),updatedAt:nowISO()};
  }
  function executeService(service) {
    const run={id:uid('run'),serviceId:service.id,name:service.name,date:nowISO(),items:structuredClone(service.items||[]),totalCost:moneyRound(service.totalCost),sellingPrice:moneyRound(service.sellingPrice||0),transactionId:null};
    const tx=addTransaction({type:'expense',description:`Execução: ${service.name}`,category:'outros',amount:run.totalCost,date:run.date,notes:'Custo de produção/execução calculado pela ficha do serviço.',source:'service_run',sourceId:run.id});
    run.transactionId=tx.id; state.serviceRuns.unshift(run); return run;
  }
  function monthKey(year,month) { return `${year}-${String(month).padStart(2,'0')}`; }

  async function handleSubmit(event) {
    const form=event.target.closest('form[data-form]'); if(!form) return;
    event.preventDefault(); const fd=new FormData(form), values=Object.fromEntries(fd.entries()), type=form.dataset.form;
    const submitMode=event.submitter?.value||'save'; const button=event.submitter; if(button) button.disabled=true;
    try {
      if(type==='product') {
        const id=form.dataset.id||'', existing=state.products.find(p=>p.id===id);
        const codes=existing?{productCode:existing.productCode,barcode:existing.barcode}:productCodes();
        const input={name:values.name.trim(),productCode:codes.productCode,barcode:codes.barcode,id};
        const duplicate=duplicateProductError(input); if(duplicate) throw new Error(duplicate);
        const similar=similarProducts(input.name,id);
        if(similar.length&&!confirm(`Encontramos produto(s) com nome semelhante:\n${similar.map(p=>`• ${p.name} (${p.productCode})`).join('\n')}\n\nDeseja cadastrar mesmo assim?`)) { if(button) button.disabled=false; return; }
        const qty=Number(values.purchaseQty),price=Number(values.totalPrice); if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(price)||price<0) throw new Error('Quantidade e preço da embalagem devem ser válidos.');
        const group=unitGroup(values.purchaseUnit);
        const product={id:existing?.id||uid('prod'),name:input.name,productCode:codes.productCode,barcode:codes.barcode,category:values.category||'outros',icon:values.icon.trim(),purchaseQty:qty,purchaseUnit:values.purchaseUnit,totalPrice:moneyRound(price),baseUnit:UNIT_GROUPS[group].base,createdAt:existing?.createdAt||nowISO(),updatedAt:nowISO()};
        if(existing) Object.assign(existing,product); else { state.products.unshift(product); state.settings.productSequence=Math.max(Number(state.settings.productSequence)||0,Number(codes.productCode.match(/(\d+)$/)?.[1]||0)); }
        await saveState(); closeModal(); renderShell(); toast(existing?'Produto atualizado.':'Produto cadastrado com códigos únicos.');
      } else if(type==='service') {
        const payload=getServicePayload(form), existing=state.services.find(s=>s.id===form.dataset.id);
        const service={...payload,id:existing?.id||uid('service'),createdAt:existing?.createdAt||payload.createdAt};
        if(existing) Object.assign(existing,service); else state.services.unshift(service);
        if(submitMode==='run') executeService(service);
        await saveState(); closeModal(); renderShell(); toast(submitMode==='run'?'Serviço executado; custo lançado como despesa.':'Ficha de custos salva sem alterar o saldo.');
      } else if(type==='obligation') {
        const recurring=fd.has('recurring'),count=recurring?0:Number(values.installmentsCount);
        const rawMonthly=Number(values.monthlyAmount)||0,startYear=Number(values.startYear),startMonth=Number(values.startMonth),debtTotal=Number(values.totalAmount)||0;
        const monthly=rawMonthly>0?rawMonthly:(!recurring&&debtTotal>0&&Number.isInteger(count)&&count>0?moneyRound(debtTotal/count):0);
        if(!values.name.trim()||monthly<=0||startYear<2000||startYear>2200||startMonth<1||startMonth>12||(!recurring&&(!Number.isInteger(count)||count<1))) throw new Error('Informe o valor da parcela ou o total da dívida com a quantidade de parcelas. Revise também a data inicial.');
        const existing=state.obligations.find(o=>o.id===form.dataset.id);
        const ob={id:existing?.id||uid('obl'),name:values.name.trim(),type:values.type,description:values.description.trim(),monthlyAmount:moneyRound(monthly),totalAmount:moneyRound(debtTotal),installmentsCount:count,recurring,startYear,startMonth,createdAt:existing?.createdAt||nowISO(),updatedAt:nowISO()};
        if(existing) Object.assign(existing,ob); else state.obligations.unshift(ob);
        if(!existing&&fd.has('launchFirst')) {
          const ym=monthKey(startYear,startMonth); const tx=addTransaction({type:'expense',description:`Parcela: ${ob.name} (${ym})`,category:'contas',amount:ob.monthlyAmount,source:'obligation',sourceId:`${ob.id}|${ym}`});
          state.installments.push({id:uid('inst'),obligationId:ob.id,yearMonth:ym,status:'paid',launched:true,paidDate:nowISO(),transactionId:tx.id});
        }
        await saveState(); closeModal(); renderShell(); toast(existing?'Compromisso atualizado.':'Compromisso cadastrado.');
      } else if(type==='payment') {
        const obligationId=form.dataset.obligationId,yearMonth=form.dataset.yearmonth,obligation=state.obligations.find(o=>o.id===obligationId); if(!obligation) throw new Error('Compromisso não encontrado.');
        let item=state.installments.find(x=>x.obligationId===obligationId&&x.yearMonth===yearMonth);
        const status=values.status, launch=fd.has('launch');
        if(launch&&status!=='paid') throw new Error('Uma parcela pendente não pode ficar lançada como pagamento. Marque-a como paga ou desmarque o lançamento.');
        if(!item){item={id:uid('inst'),obligationId,yearMonth,status:'pending',launched:false,paidDate:null,transactionId:null};state.installments.push(item);}
        if(item.launched&&!launch&&item.transactionId){state.transactions=state.transactions.filter(t=>t.id!==item.transactionId);item.transactionId=null;item.launched=false;}
        if(launch&&!item.launched){const tx=addTransaction({type:'expense',description:`Parcela: ${obligation.name} (${yearMonth})`,category:'contas',amount:obligation.monthlyAmount,source:'obligation',sourceId:`${obligationId}|${yearMonth}`});item.transactionId=tx.id;item.launched=true;}
        item.status=status;item.paidDate=status==='paid'?nowISO():null;
        await saveState();closeModal();renderShell();toast(status==='paid'?(launch?'Parcela paga e lançada no saldo.':'Parcela marcada como paga sem lançamento.'):'Parcela marcada como pendente.');
      } else if(type==='transaction') {
        const existing=state.transactions.find(t=>t.id===form.dataset.id);
        if(existing&&existing.source!=='manual') throw new Error('Lançamentos vinculados a serviços, compras ou parcelas devem ser alterados na seção de origem.');
        const payload={type:values.type,description:values.description,category:values.category,amount:values.amount,date:values.date,notes:values.notes,source:'manual'};
        if(existing) Object.assign(existing,{...payload,amount:moneyRound(payload.amount),date:new Date(payload.date).toISOString(),updatedAt:nowISO()});
        else addTransaction(payload);
        await saveState();closeModal();renderShell();toast(existing?'Lançamento atualizado.':'Lançamento registrado.');
      } else if(type==='checkout') {
        if(!state.activeCart.length) throw new Error('O carrinho está vazio.');
        const items=structuredClone(state.activeCart);const amount=moneyRound(total(items,i=>i.unitPrice*i.quantity));
        const purchase={id:uid('buy'),name:values.name.trim()||'Compra de supermercado',status:'completed',items,total:amount,createdAt:nowISO(),addedToFinance:fd.has('addToFinance'),transactionId:null};
        if(fd.has('addToFinance')) { const tx=addTransaction({type:'expense',description:`Compra: ${purchase.name}`,category:'supermercado',amount,date:purchase.createdAt,source:'purchase',sourceId:purchase.id});purchase.transactionId=tx.id; }
        state.purchases.unshift(purchase);state.activeCart=[];await saveState();closeModal();renderShell();toast(purchase.addedToFinance?'Compra finalizada e lançada no saldo.':'Compra salva sem alterar o saldo.');
      }
    } catch(error) { toast(error.message||'Não foi possível salvar os dados.','error'); if(button) button.disabled=false; }
  }

  async function handleClick(event) {
    const target=event.target.closest('[data-action],[data-view]'); if(!target) return;
    if(target.dataset.view){currentView=target.dataset.view;searchProducts='';searchShopping='';closeModal();renderShell();return;}
    const action=target.dataset.action,id=target.dataset.id;
    try {
      switch(action){
        case 'close-modal': closeModal(); break;
        case 'new-product': openProductForm(); break;
        case 'edit-product': {const p=state.products.find(x=>x.id===id);if(p)openProductForm(p);break;}
        case 'show-codes': {const p=state.products.find(x=>x.id===id);if(p)openCodes(p);break;}
        case 'delete-product': if(confirm('Excluir este produto do catálogo? Fichas de serviço já salvas preservam os custos e nomes registrados.')){state.products=state.products.filter(p=>p.id!==id);await saveState();renderShell();toast('Produto excluído.');}break;
        case 'add-cart': {const p=state.products.find(x=>x.id===id);if(!p)throw new Error('Produto não encontrado.');const current=state.activeCart.find(x=>x.productId===id);if(current)current.quantity+=1;else state.activeCart.push({id:uid('cart'),productId:id,name:p.name,productCode:p.productCode,unitPrice:p.totalPrice,quantity:1,unit:p.purchaseUnit});await saveState();renderShell();toast('Produto adicionado ao carrinho.');break;}
        case 'remove-cart-item': state.activeCart=state.activeCart.filter(x=>x.id!==id);await saveState();renderShell();break;
        case 'clear-cart': if(confirm('Esvaziar o carrinho atual?')){state.activeCart=[];await saveState();renderShell();}break;
        case 'save-shopping-list': {if(!state.activeCart.length)break;const name=prompt('Nome da lista:','Lista de compras');if(name===null)break;const items=structuredClone(state.activeCart),amount=moneyRound(total(items,i=>i.unitPrice*i.quantity));state.purchases.unshift({id:uid('buy'),name:name.trim()||'Lista de compras',status:'saved',items,total:amount,createdAt:nowISO(),addedToFinance:false,transactionId:null});state.activeCart=[];await saveState();renderShell();toast('Lista salva sem alterar o saldo.');break;}
        case 'checkout': openModal(`<div class="modal-backdrop"><section class="modal-card" role="dialog" aria-modal="true"><div class="modal-header"><div><span class="eyebrow">FECHAMENTO DE COMPRA</span><h2>Finalizar compra</h2></div><button class="icon-button" data-action="close-modal">×</button></div><form class="form-grid" data-form="checkout"><label class="field full-field">Identificação<input name="name" value="Compra de supermercado" maxlength="120"></label><div class="checkout-total full-field"><span>Total da compra</span><strong>${money(total(state.activeCart,i=>i.unitPrice*i.quantity))}</strong></div><label class="checkbox-field full-field"><input name="addToFinance" type="checkbox"><span><b>Lançar como despesa no controle financeiro</b><small>Desmarcado: registra somente no histórico de compras, sem reduzir o saldo.</small></span></label><div class="modal-actions full-field"><button type="button" class="button subtle" data-action="close-modal">Voltar</button><button type="submit" class="button primary">Confirmar compra</button></div></form></section></div>`);break;
        case 'load-list': {const p=state.purchases.find(x=>x.id===id&&x.status==='saved');if(!p)throw new Error('Lista salva não encontrada.');state.activeCart=structuredClone(p.items).map(x=>({...x,id:uid('cart')}));await saveState();renderShell();toast('Lista carregada no carrinho.');break;}
        case 'delete-purchase': if(confirm('Excluir este registro de compra/lista? Se houver uma despesa vinculada, ela também será estornada.')){const p=state.purchases.find(x=>x.id===id);if(p?.transactionId)state.transactions=state.transactions.filter(t=>t.id!==p.transactionId);state.purchases=state.purchases.filter(x=>x.id!==id);await saveState();renderShell();toast('Registro removido.');}break;
        case 'new-service': openModal(renderServiceForm()); calculateServiceForm($('[data-form="service"]')); break;
        case 'edit-service': {const s=state.services.find(x=>x.id===id);if(s){openModal(renderServiceForm(s));calculateServiceForm($('[data-form="service"]'));}break;}
        case 'add-service-item': {const form=target.closest('form');if(form){if(!state.products.length){toast('Cadastre pelo menos um produto antes de adicionar ingredientes.','error');break;}$('[data-service-items]',form).insertAdjacentHTML('beforeend',renderServiceItemRow());calculateServiceForm(form);}break;}
        case 'remove-service-item': {const form=target.closest('form');target.closest('[data-item-row]')?.remove();if(form)calculateServiceForm(form);break;}
        case 'delete-service': if(confirm('Excluir a ficha deste serviço? O histórico de execuções será preservado.')){state.services=state.services.filter(s=>s.id!==id);await saveState();renderShell();toast('Ficha de serviço excluída.');}break;
        case 'run-service': {const s=state.services.find(x=>x.id===id);if(!s)throw new Error('Serviço não encontrado.');if(confirm(`Registrar execução de "${s.name}" e lançar ${money(s.totalCost)} como despesa?`)){executeService(s);await saveState();renderShell();toast('Execução lançada no financeiro.');}break;}
        case 'delete-service-run': if(confirm('Excluir esta execução e estornar a despesa vinculada?')){const run=state.serviceRuns.find(x=>x.id===id);if(run?.transactionId)state.transactions=state.transactions.filter(t=>t.id!==run.transactionId);state.serviceRuns=state.serviceRuns.filter(x=>x.id!==id);await saveState();renderShell();toast('Execução excluída e saldo recalculado.');}break;
        case 'new-obligation': openModal(renderObligationForm());break;
        case 'edit-obligation': {const o=state.obligations.find(x=>x.id===id);if(o)openModal(renderObligationForm(o));break;}
        case 'delete-obligation': if(confirm('Excluir este compromisso e remover os lançamentos financeiros vinculados às parcelas?')){const linked=state.transactions.filter(t=>t.source==='obligation'&&String(t.sourceId||'').startsWith(`${id}|`)).map(t=>t.id);state.transactions=state.transactions.filter(t=>!linked.includes(t.id));state.installments=state.installments.filter(x=>x.obligationId!==id);state.obligations=state.obligations.filter(x=>x.id!==id);await saveState();renderShell();toast('Compromisso removido.');}break;
        case 'edit-installment': openModal(renderPaymentForm(id,target.dataset.yearmonth));break;
        case 'new-transaction': openModal(renderTransactionForm());break;
        case 'edit-transaction': {const tx=state.transactions.find(x=>x.id===id);if(tx)openModal(renderTransactionForm(tx));break;}
        case 'delete-transaction': if(confirm('Excluir este lançamento? O saldo será recalculado; o compromisso ou registro original permanece salvo sem este vínculo financeiro.')){const tx=state.transactions.find(x=>x.id===id);state.transactions=state.transactions.filter(x=>x.id!==id);if(tx?.source==='obligation'){const inst=state.installments.find(i=>i.transactionId===id);if(inst){inst.launched=false;inst.transactionId=null;}}if(tx?.source==='service_run'){const run=state.serviceRuns.find(r=>r.transactionId===id);if(run)run.transactionId=null;}if(tx?.source==='purchase'){const purchase=state.purchases.find(p=>p.transactionId===id);if(purchase){purchase.transactionId=null;purchase.addedToFinance=false;}}await saveState();renderShell();toast('Lançamento excluído e saldo atualizado.');}break;
        case 'export-backup': exportBackup();break;
        case 'export-csv': exportCSV();break;
        case 'clear-data': if(confirm('Apagar todos os produtos, compras, serviços, compromissos e lançamentos? Essa operação não pode ser desfeita sem backup.')){state=defaultState();await saveState();renderShell();toast('Dados apagados.');}break;
      }
    } catch(error){toast(error.message||'Não foi possível concluir a operação.','error');}
  }

  function exportBackup() {
    const blob=new Blob([JSON.stringify({app:'Mercado & Finanças',version:2,exportedAt:nowISO(),state},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`backup-mercado-financas-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);toast('Backup JSON exportado.');
  }
  function exportCSV() {
    const rows=[['data','tipo','descricao','categoria','valor','origem'],...state.transactions.map(t=>[t.date,t.type,t.description,t.category,t.amount,t.source])];
    const csv='\uFEFF'+rows.map(row=>row.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(';')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`movimentacoes-${selectedYear}.csv`;a.click();URL.revokeObjectURL(url);toast('CSV exportado.');
  }
  async function importBackup(file) {
    try {
      const parsed=JSON.parse(await file.text());const candidate=normalizeState(parsed.state||parsed);
      if(!Array.isArray(candidate.products)||!Array.isArray(candidate.transactions))throw new Error('Formato de backup não reconhecido.');
      if(!confirm('Importar o backup substituirá os dados atuais do aplicativo. Deseja continuar?'))return;
      state=candidate;await saveState();renderShell();toast('Backup restaurado com sucesso.');
    } catch(error){toast(error.message||'Não foi possível importar o backup.','error');}
    finally {const input=$('#backupFile');if(input)input.value='';}
  }

  function handleInput(event) {
    if(event.target.id==='productSearch') {
      searchProducts=event.target.value;const body=$('#productTableBody');if(body){const products=state.products.filter(p=>normalizeName(p.name).includes(normalizeName(searchProducts))||String(p.productCode).toLowerCase().includes(searchProducts.toLowerCase())||String(p.barcode).includes(searchProducts));body.innerHTML=products.length?products.map(p=>`<tr><td><div class="product-name-cell"><span class="product-emoji">${escapeHTML(p.icon||'📦')}</span><div><b>${escapeHTML(p.name)}</b><small>${escapeHTML(p.productCode||'')}</small></div></div></td><td>${escapeHTML(p.category||'outros')}</td><td>${Number(p.purchaseQty||1)} ${escapeHTML(p.purchaseUnit||'un')}</td><td><b>${money(p.totalPrice)}</b><small class="sub-cell">${money(productUnitCost(p))} / ${p.baseUnit||'un'}</small></td><td><code>${escapeHTML(p.barcode||'')}</code></td><td><div class="table-actions"><button class="mini-action" data-action="show-codes" data-id="${p.id}">▦</button><button class="mini-action" data-action="edit-product" data-id="${p.id}">✎</button><button class="mini-action danger" data-action="delete-product" data-id="${p.id}">×</button></div></td></tr>`).join(''):`<tr><td colspan="6">Nenhum produto encontrado.</td></tr>`;}
    }
    if(event.target.id==='shoppingSearch'){searchShopping=event.target.value;const view=$('#viewRoot');view.innerHTML=renderShopping();}
    const serviceForm=event.target.closest('form[data-form="service"]');if(serviceForm)calculateServiceForm(serviceForm);
  }
  async function handleChange(event) {
    const input=event.target;
    if(input.id==='dashboardYear'||input.id==='obligationYear'||input.id==='reportYear'){selectedYear=Number(input.value);renderShell();return;}
    if(input.id==='backupFile'&&input.files?.[0]){await importBackup(input.files[0]);return;}
    if(input.matches('[data-cart-qty]')){const item=state.activeCart.find(x=>x.id===input.dataset.cartQty),qty=Number(input.value);if(item){if(!Number.isFinite(qty)||qty<=0)state.activeCart=state.activeCart.filter(x=>x.id!==item.id);else item.quantity=Math.round(qty*1000)/1000;await saveState();renderShell();}return;}
    const row=input.closest('[data-item-row]');if(row&&input.name==='itemProduct'){
      const product=state.products.find(p=>p.id===input.value),unitSelect=$('select[name="itemUnit"]',row);
      if(product){const group=UNIT_GROUPS[unitGroup(product.purchaseUnit||'un')];unitSelect.innerHTML=group.units.map(u=>`<option value="${u}">${u}</option>`).join('');unitSelect.value=product.purchaseUnit;}
      const form=input.closest('form');if(form)calculateServiceForm(form);
    }
  }

  document.addEventListener('click',handleClick);
  document.addEventListener('submit',handleSubmit);
  document.addEventListener('input',handleInput);
  document.addEventListener('change',handleChange);
  $('#mobileMenu').addEventListener('click',()=>$('#appShell').classList.toggle('sidebar-open'));

  loadState().then(()=>{renderShell();}).catch(error=>{
    $('#viewRoot').innerHTML=`<section class="panel boot-error"><h2>Não foi possível carregar o aplicativo</h2><p>${escapeHTML(error.message)}</p><p>Confirme se o servidor Flask está ativo e se a pasta do projeto foi extraída corretamente.</p></section>`;
  });
})();

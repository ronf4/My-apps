#!/usr/bin/env node
// Быстрые команды для CRM «Первая Форма» (https://1f.koinotinav.com).
// Запуск: node tools/1forma.js <команда> [аргументы]
//
// Только чтение:  status | questions | projects | card <id> | section <id>
// Изменяют 1Ф (только по команде владельца!): read-all | questions-close
// Вход: login  (логин/пароль из переменных 1F_LOGIN и 1F_PASSWORD, в файлы не пишутся)
//
// Сессия хранится в 1forma-state.json рядом со скриптом (в .gitignore).

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const BASE = 'https://1f.koinotinav.com';
const STATE = path.join(__dirname, '1forma-state.json');
const SECTIONS = { 215: 'Карточка проекта', 48: 'Задачи проекта', 60: 'Заявка на отпуск' };

async function open() {
  const browser = await chromium.launch();
  const opts = { timezoneId: 'Asia/Dushanbe', locale: 'ru-RU' };
  if (fs.existsSync(STATE)) opts.storageState = STATE;
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/spa/portal/7`, { waitUntil: 'networkidle', timeout: 60000 });
  return { browser, ctx, page };
}

const api = (page, url, method = 'GET', body) =>
  page.evaluate(async ([url, method, body]) => {
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    try { return { status: r.status, data: JSON.parse(text) }; } catch { return { status: r.status, data: text }; }
  }, [url, method, body]);

function gridBody(select, endRow = 500) {
  return {
    startRow: 0, endRow, rowGroupCols: [], valueCols: [], pivotCols: [], pivotMode: false,
    groupKeys: [], filterModel: {}, sortModel: [], select, quickFilter: '',
    quickFilterAllColumns: false, myTasks: null, tasksState: null, smartExpressionIds: null,
    selectionId: null, context: null, aggregations: [], withAdvancedFilter: false,
  };
}

const COLS = ['task', 'state', 'dueDate', 'owner', 'performer'].map((f) => ({
  field: f, type: f === 'dueDate' ? 'dateTimeValue' : f, extParamType: null,
}));

async function rows(page, subcatId) {
  const r = await api(page, `/api-core/datasource/subcat/${subcatId}/data`, 'POST', gridBody(COLS));
  return (r.data.tasksDataSourceResponse || []).map((t) => ({
    id: t.task.taskId, name: t.task.taskText, state: (t.state.stateDescription || '').trim(),
    due: t.dueDate ? t.dueDate.slice(0, 10) : '', overdue: t.isOverdue, closed: t.isClosed,
    owner: t.owner?.owner || '', performer: t.performer?.name || '',
  }));
}

async function myQuestions(page) {
  const r = await api(page, '/api/comments/lenta', 'POST', {
    limit: 50, offset: 0, lentaCommTypes: [3], includeReactions: false,
    collapseThreads: false, toUserAsAnyRecipientOnly: false, compactResponse: true,
  });
  return (r.data.data?.comments || []).filter((c) => c.needsAnswer)
    .map((c) => ({ id: c.commentID, task: c.taskID, date: c.date.slice(0, 10), text: c.content.slice(0, 120) }));
}

const COMMANDS = {
  async login() {
    const login = process.env['1F_LOGIN'];
    const pass = process.env['1F_PASSWORD'];
    if (!login || !pass) throw new Error('Задайте переменные 1F_LOGIN и 1F_PASSWORD');
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ timezoneId: 'Asia/Dushanbe' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/spa/entry/signin`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.fill('#login-input', login);
    await page.fill('#pass-input', pass);
    await page.keyboard.press('Enter');
    await page.waitForURL((u) => !u.toString().includes('signin'), { timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    await ctx.storageState({ path: STATE });
    console.log(page.url().includes('signin') ? 'Вход НЕ выполнен' : 'Вход выполнен, сессия сохранена');
    await browser.close();
  },

  async status(page) {
    const t = (await api(page, '/api/tickers/system?tickers=unreadCommentsCount,myQuestionsCount,allOverdueTasksUserOwns,subscribesUnreadCount')).data.data;
    console.log(`Непрочитанные в ленте: ${t.unreadCommentsCount}`);
    console.log(`Исходящие (мои вопросы без ответа): ${t.myQuestionsCount}`);
    console.log(`Просрочено, где я заказчик: ${t.allOverdueTasksUserOwns}`);
    for (const [id, name] of Object.entries(SECTIONS)) {
      const open = (await rows(page, id)).filter((r) => !r.closed);
      const over = open.filter((r) => r.overdue);
      console.log(`\n${name} (id ${id}): открыто ${open.length}, просрочено ${over.length}`);
      for (const r of over) console.log(`  ! ${r.id} ${r.name} — срок ${r.due}, исполнитель ${r.performer}`);
    }
  },

  async questions(page) {
    const q = await myQuestions(page);
    if (!q.length) return console.log('Неотвеченных исходящих вопросов нет');
    for (const x of q) console.log(`${x.date} коммент ${x.id} в задаче ${x.task}: ${x.text}`);
  },

  async 'questions-close'(page) {
    const q = await myQuestions(page);
    for (const x of q) {
      const r = await api(page, '/api/comments/mark-as-answered', 'POST', { commentText: null, isForAll: null, commentID: x.id });
      console.log(`${x.id}: ${r.status === 204 || r.status === 200 ? 'отмечен отвеченным' : 'ошибка ' + r.status}`);
    }
    if (!q.length) console.log('Закрывать нечего');
  },

  async 'read-all'(page) {
    const r = await api(page, '/api/comments/read-all', 'POST', {
      catID: null, count: 100, favsFolderId: null, filterCommentsSignatures: false, onlySubscribed: false,
      orgUnitId: null, personalsType: null, showSystem: false, subcatID: null, type: 'unread',
    });
    console.log(`Лента: «прочитать все» — ответ ${r.status}`);
  },

  async projects(page) {
    for (const r of await rows(page, 215)) {
      console.log(`${r.id}\t${r.state}\t${r.due}\t${r.performer}\t${r.name}`);
    }
  },

  async card(page, id) {
    const route = (await api(page, `/app/v1.0/api/tasks/${id}/mainroute`)).data;
    const cur = route.taskMainRoute?.states?.find((s) => s.isCurrent);
    console.log(`Задача ${id}, статус: ${cur?.name || '?'}`);
    console.log('Доступные кнопки:', (route.steps || []).map((s) => s.name).join(', ') || 'нет');
  },

  async section(page, id) {
    const s = (await api(page, `/api/storage/subcategories/${id}`)).data.data;
    const st = (await api(page, `/app/v1.0/api/subcategory/${id}/states`)).data.data;
    const name = Object.fromEntries(st.map((x) => [x.id, x.name.trim()]));
    console.log(`Статусы: ${st.map((x) => x.name.trim() + (x.isActive ? '' : ' (выкл)')).join(', ')}`);
    console.log('Переходы:');
    for (const r of s.stateRouteInSubcats) console.log(`  ${name[r.stateID]} → ${name[r.stateNextID]}: «${r.stepDescr.trim()}»${r.hiddenStep ? ' (скрыт)' : ''}`);
    console.log(`Полей: ${s.extParams.length}, блоков: ${s.extParamBlocks.length}`);
  },
};

// ---------- Чаты и комментарии ----------
const COMMENT_DEFAULTS = {
  addToQuickReply: false, chatMode: false, copyRecipientGroupsIds: [], copyRecipientsIds: [], fileIds: [],
  forceEmail: false, forwardedCommentId: null, inReplyToCommentId: null, location: null, maxCommentId: null,
  needSubscribe: true, needSubscriberOthers: true, needsAnswer: false, recipientGroupsIds: [], recipientIds: [],
  sendSms: false, guid: null, silentComment: false,
};

async function sendComment(page, taskId, text, extra = {}) {
  const body = { ...COMMENT_DEFAULTS, ...extra, taskId: Number(taskId), commentText: text };
  const r = await api(page, '/api/comments/add', 'POST', body);
  const ok = r.status >= 200 && r.status < 300;
  console.log(ok ? `Отправлено в задачу/чат ${taskId}` : `Ошибка ${r.status}: ${JSON.stringify(r.data).slice(0, 300)}`);
}

Object.assign(COMMANDS, {
  // Список чатов (только чтение)
  async chats(page) {
    const r = await api(page, '/api/chats?limit=40&offset=0');
    const list = r.data?.data?.data || r.data?.data?.chats || r.data?.data || [];
    if (!Array.isArray(list)) return console.log(JSON.stringify(r.data).slice(0, 1500));
    for (const c of list) {
      const id = c.taskId ?? c.id;
      const name = c.name || c.title || c.taskText || c.description || '';
      const unread = c.unreadCount ?? c.unreadCommentsCount ?? c.unread ?? 0;
      console.log(`${id}\t${unread ? 'непрочит. ' + unread : ''}\t${name}`);
    }
  },

  // Последние сообщения ленты по задаче/чату (только чтение)
  async messages(page, taskId, limit = '10') {
    const r = await api(page, '/api/comments/lenta', 'POST', {
      limit: 120, offset: 0, lentaCommTypes: [0], includeReactions: false, grouped: false,
      collapseThreads: false, toUserAsAnyRecipientOnly: false, compactResponse: true,
    });
    const users = Object.fromEntries((r.data.data?.users || []).map((u) => [u.userId ?? u.id, u.userName ?? u.name]));
    const list = (r.data.data?.comments || []).filter((c) => String(c.taskID) === String(taskId)).slice(0, Number(limit));
    if (!list.length) return console.log('В последних сообщениях ленты по этой задаче ничего нет');
    for (const c of list.reverse()) console.log(`${c.date.slice(0, 16).replace('T', ' ')} ${c.userName || users[c.userID] || c.userID} [${c.commentID}]: ${c.content}`);
  },

  // ИЗМЕНЯЕТ: сообщение в задачу или чат. send <taskId> "текст"
  async send(page, taskId, ...words) {
    if (!taskId || !words.length) throw new Error('send <taskId> "текст"');
    await sendComment(page, taskId, words.join(' '));
  },

  // ИЗМЕНЯЕТ: ответ на конкретное сообщение. reply <taskId> <commentId> "текст"
  async reply(page, taskId, commentId, ...words) {
    if (!commentId || !words.length) throw new Error('reply <taskId> <commentId> "текст"');
    await sendComment(page, taskId, words.join(' '), { inReplyToCommentId: Number(commentId) });
  },

  // Поля формы создания (только чтение). form <subcatId> ["Поле=Значение" ... чтобы раскрыть зависимые поля]
  async form(page, subcatId, ...pairs) {
    await page.goto(`${BASE}/spa/tasks/subcat/${subcatId}/grid`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.locator('button:has-text("Создать") >> visible=true').last().click();
    await page.waitForTimeout(4000);
    for (const x of pairs) { const i = x.indexOf('='); await fillField(page, x.slice(0, i).trim(), x.slice(i + 1).trim()); await page.waitForTimeout(800); }
    const f = await page.evaluate(() => [...document.querySelectorAll('vh-ext-param-control-wrapper')].filter((e) => e.offsetParent)
      .map((e) => `${(e.querySelector('[control-name]') || {}).innerText?.trim() || '?'}${e.querySelector('.vh-ext-param-control-wrapper--required-sign') ? ' *' : ''} (${e.getAttribute('ep-wrapper-type')})`));
    console.log(f.join('\n'));
  },

  // Создание заявки/задачи через форму 1Ф.
  // create <subcatId> "Поле=Значение" ... [--go]
  // Без --go только заполняет форму и делает снимок (ничего не создаёт).
  async create(page, subcatId, ...pairs) {
    const go = pairs.includes('--go');
    const fields = pairs.filter((x) => x !== '--go').map((x) => {
      const i = x.indexOf('=');
      return [x.slice(0, i).trim(), x.slice(i + 1).trim()];
    });
    let created = null;
    page.on('response', async (r) => {
      if (/\/api\/tasks$/.test(r.url()) && r.request().method() === 'POST') {
        try { created = (await r.json()).newTaskIds; } catch { /* ignore */ }
      }
    });
    await page.goto(`${BASE}/spa/tasks/subcat/${subcatId}/grid`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.locator('button:has-text("Создать") >> visible=true').last().click();
    await page.waitForTimeout(4000);

    for (const [label, value] of fields) {
      const ok = await fillField(page, label, value);
      console.log(`${ok ? 'OK ' : 'НЕТ'} ${label} = ${value}`);
      await page.waitForTimeout(800);
    }
    const shot = path.join(__dirname, `1forma-create-${subcatId}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    const missing = await page.evaluate(() => [...document.querySelectorAll('vh-ext-param-control-wrapper')]
      .filter((e) => e.offsetParent && e.querySelector('.vh-ext-param-control-wrapper--required-sign') && e.querySelector('.value-empty'))
      .map((e) => (e.querySelector('[control-name]') || {}).innerText?.trim()));
    if (missing.length) console.log('Не заполнены обязательные:', missing.join(', '));
    if (!go) return console.log(`Проверка без создания. Снимок формы: ${shot}`);

    const btn = page.locator('button >> visible=true', { hasText: /^\s*Создать\s+\S+/ }).last();
    await btn.click();
    for (let i = 0; i < 20 && !created; i++) await page.waitForTimeout(500);
    console.log(created ? `Создано: №${created.join(', ')} — ${BASE}/spa/tasks/${created[0]}` : 'Не создано — смотри снимок/обязательные поля');
  },
});

// Заполнение одного поля формы по подписи
async function fillField(page, label, value) {
  const wrap = page.locator('vh-ext-param-control-wrapper >> visible=true')
    .filter({ has: page.locator('.vh-ext-param-control-wrapper--name', { hasText: label }) }).first();
  if (await wrap.count()) {
    const type = await wrap.getAttribute('ep-wrapper-type');
    await wrap.click();
    await page.waitForTimeout(700);
    if (/LookUp|Combobox|Select|MultiSlct/.test(type)) return pickOption(page, wrap, value);
    if (type === 'Checkbox') { if (/^(да|yes|true|1)$/i.test(value)) await wrap.locator('input').first().check().catch(() => wrap.click()); return true; }
    if (type === 'TextArea') { const ed = wrap.locator('.ck-editor__editable').first(); await ed.click(); await page.keyboard.type(value); return true; }
    const input = wrap.locator('textarea, input:not([type=file])').first();
    await input.fill(value);
    await page.keyboard.press('Tab');
    return true;
  }
  // Стандартные поля формы (Дедлайн, Исполнители и т.п.)
  const lab = page.locator(`text="${label}" >> visible=true`).first();
  if (!(await lab.count())) return false;
  const box = lab.locator('xpath=ancestor::*[.//input][1]');
  const input = box.locator('input:not([type=file]):not([type=checkbox])').first();
  await input.click();
  if (/Исполнител|Сотрудник|Согласующ/i.test(label)) {
    await page.keyboard.type(value, { delay: 40 });
    await page.waitForTimeout(2500);
    return pickOption(page, null, value);
  }
  await input.fill(value);
  await page.keyboard.press('Tab');
  return true;
}

async function pickOption(page, wrap, value) {
  const search = page.locator('.cdk-overlay-container input[placeholder="Поиск"] >> visible=true').first();
  if (await search.count()) { await search.fill(value.split(' ')[0]); await page.waitForTimeout(2500); }
  const opts = page.locator('.cdk-overlay-container [role="option"], .cdk-overlay-container mat-option, .cdk-overlay-container li');
  const n = await opts.count();
  for (let k = 0; k < n; k++) {
    if ((await opts.nth(k).innerText()).replace(/\s+/g, ' ').includes(value)) { await opts.nth(k).click(); return true; }
  }
  await page.keyboard.press('Escape');
  return false;
}

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  if (!COMMANDS[cmd]) {
    console.log('Команды: login | status | questions | questions-close | read-all | projects | card <id> | section <id>'
      + ' | chats | messages <taskId> | send <taskId> "текст" | reply <taskId> <commentId> "текст"'
      + ' | form <subcatId> | create <subcatId> "Поле=Значение" ... [--go]');
    process.exit(1);
  }
  if (cmd === 'login') return COMMANDS.login();
  const { browser, page } = await open();
  if (page.url().includes('signin')) {
    console.log('Сессия истекла — нужен login');
    await browser.close();
    process.exit(2);
  }
  try { await COMMANDS[cmd](page, ...args); } finally { await browser.close(); }
})();

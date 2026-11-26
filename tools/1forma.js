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
    await page.waitForTimeout(6000);
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

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  if (!COMMANDS[cmd]) {
    console.log('Команды: login | status | questions | questions-close | read-all | projects | card <id> | section <id>');
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

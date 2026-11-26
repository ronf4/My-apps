#!/usr/bin/env node
// Карта всех разделов «Первой Формы» — только чтение.
// Запуск: node tools/1forma-map.js  -> tools/1forma-map.json и tools/1forma-map.md
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const STATE = path.join(__dirname, '1forma-state.json');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ storageState: STATE, timezoneId: 'Asia/Dushanbe' });
  const p = await ctx.newPage();
  await p.goto('https://1f.koinotinav.com/spa/portal/7', { waitUntil: 'networkidle', timeout: 60000 });
  if (p.url().includes('signin')) { console.log('Сессия истекла — node tools/1forma.js login'); process.exit(2); }

  const data = await p.evaluate(async () => {
    const j = async (u) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } };
    const tree = (await j('/app/v1.0/api/subcategories/tree')).data;
    const subs = tree.filter((n) => n.nodeType === 'Subcategory');
    const out = {};
    for (let i = 0; i < subs.length; i += 8) {
      await Promise.all(subs.slice(i, i + 8).map(async (n) => {
        const [cfg, st] = await Promise.all([j(`/api/storage/subcategories/${n.id}`), j(`/app/v1.0/api/subcategory/${n.id}/states`)]);
        const s = cfg && cfg.data;
        const states = st && st.data ? st.data : [];
        const sn = Object.fromEntries(states.map((x) => [x.id, x.name.trim()]));
        out[n.id] = s ? {
          entity: s.subcategory.entity,
          states: states.map((x) => x.name.trim() + (x.isActive ? '' : ' (выкл)')),
          routes: s.stateRouteInSubcats.map((r) => `${sn[r.stateID] || r.stateID} → ${sn[r.stateNextID] || r.stateNextID}: ${r.stepDescr.trim()}${r.hiddenStep ? ' (скрыт)' : ''}`),
          blocks: s.extParamBlocks.sort((a, c) => a.order - c.order).map((bl) => ({
            name: bl.name.trim(),
            fields: bl.extParamIds.map((id) => s.extParams.find((e) => e.extParamId === id)).filter(Boolean)
              .map((e) => (e.extParamName || e.extParam.name || '').trim() + (e.isRequired ? '*' : '')),
          })),
          fieldsTotal: s.extParams.length,
          projectTasksSubcat: s.subcategory.isForProjects ? s.subcategory.projectTasksSubcatId : null,
        } : { noAccess: true };
      }));
    }
    return { tree, details: out };
  });
  await b.close();

  const { tree, details } = data;
  fs.writeFileSync(path.join(__dirname, '1forma-map.json'), JSON.stringify(data, null, 1));

  const byParent = {};
  for (const n of tree) (byParent[n.parentId ?? 'root'] ||= []).push(n);
  for (const k in byParent) byParent[k].sort((a, c) => a.orderId - c.orderId);

  const lines = ['# Карта «Первой Формы» (все разделы)', '',
    `Снято ${new Date().toISOString().slice(0, 10)} скриптом \`tools/1forma-map.js\` (только чтение).`,
    'Обозначения: [С] — справочник; «можно создать» — у учётки есть право создавать; * — обязательное поле.', ''];
  const toc = [];
  const walk = (parent, depth) => {
    for (const n of byParent[parent] || []) {
      const name = n.name.trim();
      if (n.nodeType === 'Category') {
        lines.push(`${'#'.repeat(Math.min(depth + 2, 4))} ${name} (категория ${n.id})`, '');
        if (depth === 0) toc.push(`- ${name} (${n.id})`);
        walk(n.id, depth + 1);
      } else {
        const d = details[n.id] || {};
        const c = n.tasksCounters || {};
        const flags = [n.isDictionary ? '[С]' : '', n.canCreateTask ? 'можно создать' : 'только просмотр',
          c.allTasksUserOwns ? `я заказчик: ${c.allTasksUserOwns}` : '', c.allTasksUserPerforms ? `я исполнитель: ${c.allTasksUserPerforms}` : '',
          c.overdueTasksCount ? `просрочено: ${c.overdueTasksCount}` : ''].filter(Boolean).join(', ');
        lines.push(`- **${name}** — id ${n.id}${d.entity ? `, сущность «${d.entity.trim()}»` : ''}; ${flags}`);
        if (d.noAccess) { lines.push('  - настройки недоступны'); continue; }
        if (n.isDictionary) {
          const f = d.blocks.flatMap((bl) => bl.fields);
          if (f.length) lines.push(`  - поля: ${f.join('; ')}`);
          continue;
        }
        if (d.states?.length) lines.push(`  - статусы: ${d.states.join(', ')}`);
        if (d.routes?.length) lines.push(`  - переходы: ${d.routes.join(' | ')}`);
        for (const bl of d.blocks || []) if (bl.fields.length) lines.push(`  - блок «${bl.name || 'без названия'}»: ${bl.fields.join('; ')}`);
        if (d.projectTasksSubcat) lines.push(`  - задачи проекта ведутся в разделе ${d.projectTasksSubcat}`);
      }
    }
  };
  walk('root', 0);
  lines.splice(5, 0, '## Категории верхнего уровня', ...toc, '');
  fs.writeFileSync(path.join(__dirname, '1forma-map.md'), lines.join('\n') + '\n');
  const subs = tree.filter((n) => n.nodeType === 'Subcategory');
  console.log(`Категорий: ${tree.length - subs.length}, разделов: ${subs.length}, справочников: ${subs.filter((n) => n.isDictionary).length}, без доступа к настройкам: ${Object.values(details).filter((d) => d.noAccess).length}`);
})();

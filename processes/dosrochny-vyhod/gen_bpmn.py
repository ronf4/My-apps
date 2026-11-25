"""Генератор BPMN 2.0 схемы «Досрочный выход из Неделимой части отпуска».

Запуск: python3 gen_bpmn.py  -> dosrochny-vyhod.bpmn рядом со скриптом.
Схема строится из списков элементов и связей ниже; координаты считаются сами.
"""
from pathlib import Path
from xml.sax.saxutils import escape

LANE_H = 150
COL_W = 185
TASK_W, TASK_H = 140, 80
GW, EV = 50, 36
POOL_LABEL_W = 30
LANE_LABEL_W = 30
X0 = 60 + POOL_LABEL_W + LANE_LABEL_W + 30

SIZES = {
    "task": (TASK_W, TASK_H), "userTask": (TASK_W, TASK_H), "serviceTask": (TASK_W, TASK_H),
    "exclusiveGateway": (GW, GW), "parallelGateway": (GW, GW),
    "startEvent": (EV, EV), "endEvent": (EV, EV), "timerStart": (EV, EV),
    "messageStart": (EV, EV),
}

# ---------------- Процесс 1. Досрочный выход ----------------
P1 = {
    "id": "P1", "name": "1. Досрочный выход (ветка в БП «Отпуск», раздел 60)",
    "lanes": [
        ("EMP", "Сотрудник"),
        ("MGR", "Непосредственный руководитель"),
        ("DEP", "Руководитель департамента / ТОП"),
        ("HR", "ДЧР"),
        ("SYS", "Система 1Ф"),
        ("FIN", "ФЭД / БЮД"),
    ],
    "nodes": [
        ("p1_s_emp", "startEvent", "Отпуск оформлен, нужно выйти раньше", "EMP", 0),
        ("p1_s_mgr", "startEvent", "Отпуск оформлен, нужен сотрудник", "MGR", 0),
        ("p1_t_emp_req", "userTask", "В заявке на отпуск «Выйти досрочно»: дата выхода", "EMP", 1),
        ("p1_t_mgr_req", "userTask", "В заявке на отпуск «Отозвать из отпуска»: причина, задачи, дата", "MGR", 1),
        ("p1_t_check", "serviceTask", "Проверки: отпуск начат, 7 дн. использовано, рабочий день, нет 2-го обращения", "SYS", 2),
        ("p1_g_check", "exclusiveGateway", "Проверки пройдены?", "SYS", 3),
        ("p1_e_block", "endEvent", "Заблокировано, причина показана", "SYS", 4, {"dy": 42, "label": "right"}),
        ("p1_g_init", "exclusiveGateway", "Кто инициатор?", "SYS", 5),
        ("p1_t_consent", "userTask", "Рассмотреть запрос на отзыв: согласие или причина отказа", "EMP", 6),
        ("p1_g_consent", "exclusiveGateway", "Согласен?", "EMP", 7),
        ("p1_e_noconsent", "endEvent", "Заявка снова «Отпуск оформлен», отпуск без изменений", "EMP", 8),
        ("p1_t_mgr_appr", "userTask", "Согласовать досрочный выход (1 раб. день)", "MGR", 6),
        ("p1_g_mgr", "exclusiveGateway", "Согласовано?", "MGR", 7),
        ("p1_t_dep_appr", "userTask", "Окончательное управленческое решение (1 раб. день)", "DEP", 8),
        ("p1_g_dep", "exclusiveGateway", "Согласовано?", "DEP", 9),
        ("p1_t_hr_check", "userTask", "Кадровая проверка: приказ об отпуске, согласие, дата, БП", "HR", 10),
        ("p1_g_hr", "exclusiveGateway", "Препятствий нет?", "HR", 11),
        ("p1_t_reject", "serviceTask", "Уведомить инициатора: причина, отпуск остаётся в силе", "SYS", 8),
        ("p1_e_reject", "endEvent", "Заявка снова «Отпуск оформлен»", "SYS", 9),
        ("p1_t_order", "serviceTask", "Сформировать проект Приказа о досрочном выходе", "SYS", 12),
        ("p1_t_hr_confirm", "userTask", "Проверить и «Подтвердить» Приказ", "HR", 13),
        ("p1_t_apply", "serviceTask", "Изменить даты отпуска; Остаток = 14 − использовано", "SYS", 14),
        ("p1_t_notify", "serviceTask", "Остаток в карточке и Help Center; уведомление; СКУД и табель", "SYS", 15),
        ("p1_g_split", "parallelGateway", "", "SYS", 16),
        ("p1_t_return", "userTask", "Выйти на работу в дату Приказа", "EMP", 17),
        ("p1_t_fin", "userTask", "Расчёт и корректировка выплат", "FIN", 17),
        ("p1_g_join", "parallelGateway", "", "SYS", 18),
        ("p1_e_ok", "endEvent", "Заявка «Завершена», Остаток создан", "SYS", 19),
    ],
    "flows": [
        ("p1_s_emp", "p1_t_emp_req", ""),
        ("p1_s_mgr", "p1_t_mgr_req", ""),
        ("p1_t_emp_req", "p1_t_check", ""),
        ("p1_t_mgr_req", "p1_t_check", ""),
        ("p1_t_check", "p1_g_check", ""),
        ("p1_g_check", "p1_e_block", "Нет", {"exit": "bottom"}),
        ("p1_g_check", "p1_g_init", "Да"),
        ("p1_g_init", "p1_t_consent", "Компания (отзыв)", {"exit": "top"}),
        ("p1_g_init", "p1_t_mgr_appr", "Сотрудник", {"lab": "below"}),
        ("p1_t_consent", "p1_g_consent", ""),
        ("p1_g_consent", "p1_e_noconsent", "Нет"),
        ("p1_g_consent", "p1_t_dep_appr", "Да (руководитель не согласует повторно)", {"lab": "below"}),
        ("p1_t_mgr_appr", "p1_g_mgr", ""),
        ("p1_g_mgr", "p1_t_dep_appr", "Да"),
        ("p1_g_mgr", "p1_t_reject", "Нет", {"exit": "bottom"}),
        ("p1_t_dep_appr", "p1_g_dep", ""),
        ("p1_g_dep", "p1_t_hr_check", "Да"),
        ("p1_g_dep", "p1_t_reject", "Нет"),
        ("p1_t_hr_check", "p1_g_hr", ""),
        ("p1_g_hr", "p1_t_reject", "Нет, возврат с причиной"),
        ("p1_g_hr", "p1_t_order", "Да"),
        ("p1_t_reject", "p1_e_reject", ""),
        ("p1_t_order", "p1_t_hr_confirm", ""),
        ("p1_t_hr_confirm", "p1_t_apply", "Подтверждён"),
        ("p1_t_apply", "p1_t_notify", ""),
        ("p1_t_notify", "p1_g_split", ""),
        ("p1_g_split", "p1_t_return", ""),
        ("p1_g_split", "p1_t_fin", ""),
        ("p1_t_return", "p1_g_join", ""),
        ("p1_t_fin", "p1_g_join", ""),
        ("p1_g_join", "p1_e_ok", ""),
    ],
}

# ---------------- Процесс 2. Использование Остатка ----------------
P2 = {
    "id": "P2", "name": "2. Использование Остатка (новый тип заявки в БП «Отпуск»)",
    "lanes": [
        ("EMP", "Сотрудник"),
        ("MGR", "Непосредственный руководитель"),
        ("DEP", "Руководитель департамента / ТОП"),
        ("HR", "ДЧР"),
        ("SYS", "Система 1Ф"),
    ],
    "nodes": [
        ("p2_s_emp", "startEvent", "Есть Остаток, нужен отдых", "EMP", 0),
        ("p2_s_timer", "timerStart", "За 30 дней до конца года Остаток не использован", "SYS", 0),
        ("p2_t_remind", "serviceTask", "Уведомить сотрудника и руководителя", "SYS", 1),
        ("p2_t_new", "userTask", "Новая заявка в БП «Отпуск», тип «Остаток» (≥ 7 раб. дн.): дата начала", "EMP", 2),
        ("p2_t_calc", "serviceTask", "Подставить 7 дн., рассчитать окончание и выход с учётом праздников", "SYS", 3),
        ("p2_g_block", "exclusiveGateway", "Блокировки пройдены?", "SYS", 4),
        ("p2_t_reason", "serviceTask", "Показать причину: сверх Остатка, дубль, пересечение", "SYS", 5),
        ("p2_t_mgr", "userTask", "Согласовать период (1 раб. день)", "MGR", 5),
        ("p2_g_mgr", "exclusiveGateway", "Согласовано?", "MGR", 6),
        ("p2_t_alt", "userTask", "Указать причину и предложить другую дату", "MGR", 7),
        ("p2_t_dep", "userTask", "Окончательное решение (1 раб. день)", "DEP", 7),
        ("p2_g_dep", "exclusiveGateway", "Согласовано?", "DEP", 8),
        ("p2_t_order", "serviceTask", "Сформировать Приказ на использование Остатка", "SYS", 9),
        ("p2_t_hr", "userTask", "Проверить и «Подтвердить» Приказ", "HR", 10),
        ("p2_t_reserve", "serviceTask", "Зарезервировать дни; уведомление сотруднику", "SYS", 11),
        ("p2_t_rest", "userTask", "Отдых по Остатку единым периодом", "EMP", 12),
        ("p2_t_close", "serviceTask", "После окончания: закрыть запись, Остаток = 0, Help Center", "SYS", 13),
        ("p2_e_ok", "endEvent", "Остаток использован", "SYS", 14),
    ],
    "flows": [
        ("p2_s_emp", "p2_t_new", ""),
        ("p2_s_timer", "p2_t_remind", ""),
        ("p2_t_remind", "p2_t_new", ""),
        ("p2_t_new", "p2_t_calc", ""),
        ("p2_t_calc", "p2_g_block", ""),
        ("p2_g_block", "p2_t_reason", "Нет"),
        ("p2_t_reason", "p2_t_new", "Исправить"),
        ("p2_g_block", "p2_t_mgr", "Да", {"exit": "top"}),
        ("p2_t_mgr", "p2_g_mgr", ""),
        ("p2_g_mgr", "p2_t_alt", "Нет"),
        ("p2_t_alt", "p2_t_new", "Новая дата"),
        ("p2_g_mgr", "p2_t_dep", "Да", {"exit": "bottom"}),
        ("p2_t_dep", "p2_g_dep", ""),
        ("p2_g_dep", "p2_t_alt", "Нет", {"exit": "top"}),
        ("p2_g_dep", "p2_t_order", "Да"),
        ("p2_t_order", "p2_t_hr", ""),
        ("p2_t_hr", "p2_t_reserve", "Подтверждён"),
        ("p2_t_reserve", "p2_t_rest", ""),
        ("p2_t_rest", "p2_t_close", ""),
        ("p2_t_close", "p2_e_ok", ""),
    ],
}


OPTS = {}


def layout(proc, y_top):
    lanes = proc["lanes"]
    lane_y = {lid: y_top + i * LANE_H for i, (lid, _) in enumerate(lanes)}
    max_col = max(n[4] for n in proc["nodes"])
    width = X0 - 60 + (max_col + 1) * COL_W + 40
    pos = {}
    for node in proc["nodes"]:
        nid, typ, name, lane, col = node[:5]
        opt = node[5] if len(node) > 5 else {}
        w, h = SIZES[typ]
        cx = X0 + col * COL_W + TASK_W / 2
        cy = lane_y[lane] + LANE_H / 2 + opt.get("dy", 0)
        pos[nid] = (cx - w / 2, cy - h / 2, w, h, lane, col, typ)
        OPTS[nid] = opt
    return lane_y, width, pos


def waypoints(src, dst, lane_y, exit=None):
    sx, sy, sw, sh, sl, sc, _ = src
    tx, ty, tw, th, tl, tc, _ = dst
    scx, scy = sx + sw / 2, sy + sh / 2
    tcx, tcy = tx + tw / 2, ty + th / 2
    if exit in ("top", "bottom"):
        ey = sy if exit == "top" else sy + sh
        ex = tx if tcx > scx else tx + tw
        return [(scx, ey), (scx, tcy), (ex, tcy)]
    if tc > sc:
        if abs(scy - tcy) < 1:
            return [(sx + sw, scy), (tx, tcy)]
        if sc + 1 == tc or tc - sc <= 1:
            mx = tx - 22
            return [(sx + sw, scy), (mx, scy), (mx, tcy), (tx, tcy)]
        # выходим вниз/вверх из источника и идём к цели
        down = tcy > scy
        sy_edge = sy + sh if down else sy
        return [(scx, sy_edge), (scx, tcy), (tx, tcy)]
    if tc == sc:
        down = tcy > scy
        return [(scx, sy + sh if down else sy), (tcx, ty if down else ty + th)]
    # обратная связь: снизу, по нижнему краю более низкой дорожки
    low = max(lane_y[sl], lane_y[tl]) + LANE_H - 12
    return [(scx, sy + sh), (scx, low), (tcx, low), (tcx, ty + th)]


def build():
    procs = [P1, P2]
    sem, di_shapes, di_edges, participants = [], [], [], []
    y = 40
    for proc in procs:
        lane_y, width, pos = layout(proc, y)
        pool_h = len(proc["lanes"]) * LANE_H
        pid = proc["id"]
        participants.append(f'<bpmn:participant id="Part_{pid}" name="{escape(proc["name"])}" processRef="{pid}" />')
        di_shapes.append(f'<bpmndi:BPMNShape id="Part_{pid}_di" bpmnElement="Part_{pid}" isHorizontal="true"><dc:Bounds x="60" y="{y}" width="{width + POOL_LABEL_W}" height="{pool_h}" /></bpmndi:BPMNShape>')
        out = [f'<bpmn:process id="{pid}" isExecutable="false">', f'<bpmn:laneSet id="LS_{pid}">']
        for lid, lname in proc["lanes"]:
            refs = "".join(f"<bpmn:flowNodeRef>{n[0]}</bpmn:flowNodeRef>" for n in proc["nodes"] if n[3] == lid)
            out.append(f'<bpmn:lane id="{pid}_{lid}" name="{escape(lname)}">{refs}</bpmn:lane>')
            di_shapes.append(f'<bpmndi:BPMNShape id="{pid}_{lid}_di" bpmnElement="{pid}_{lid}" isHorizontal="true"><dc:Bounds x="{60 + POOL_LABEL_W}" y="{lane_y[lid]}" width="{width}" height="{LANE_H}" /></bpmndi:BPMNShape>')
        out.append("</bpmn:laneSet>")
        inc = {n[0]: [] for n in proc["nodes"]}
        outg = {n[0]: [] for n in proc["nodes"]}
        for i, fl in enumerate(proc["flows"]):
            a, b = fl[0], fl[1]
            fid = f"{pid}_f{i}"
            outg[a].append(fid); inc[b].append(fid)
        for node in proc["nodes"]:
            nid, typ, name, lane, col = node[:5]
            tag = {"timerStart": "startEvent", "messageStart": "startEvent"}.get(typ, typ)
            body = "".join(f"<bpmn:incoming>{f}</bpmn:incoming>" for f in inc[nid]) + "".join(f"<bpmn:outgoing>{f}</bpmn:outgoing>" for f in outg[nid])
            if typ == "timerStart":
                body += f'<bpmn:timerEventDefinition id="{nid}_td" />'
            out.append(f'<bpmn:{tag} id="{nid}" name="{escape(name)}">{body}</bpmn:{tag}>')
            x, yy, w, h, *_ = pos[nid]
            label = ""
            if typ in ("startEvent", "endEvent", "timerStart", "exclusiveGateway") and name:
                if OPTS.get(nid, {}).get("label") == "right":
                    label = f'<bpmndi:BPMNLabel><dc:Bounds x="{x + w + 6}" y="{yy + 2}" width="110" height="34" /></bpmndi:BPMNLabel>'
                else:
                    label = f'<bpmndi:BPMNLabel><dc:Bounds x="{x + w/2 - 55}" y="{yy + h + 4}" width="110" height="40" /></bpmndi:BPMNLabel>'
            marker = ' isMarkerVisible="true"' if typ == "exclusiveGateway" else ""
            di_shapes.append(f'<bpmndi:BPMNShape id="{nid}_di" bpmnElement="{nid}"{marker}><dc:Bounds x="{x}" y="{yy}" width="{w}" height="{h}" />{label}</bpmndi:BPMNShape>')
        for i, fl in enumerate(proc["flows"]):
            a, b, name = fl[:3]
            fo = fl[3] if len(fl) > 3 else {}
            fid = f"{pid}_f{i}"
            nm = f' name="{escape(name)}"' if name else ""
            out.append(f'<bpmn:sequenceFlow id="{fid}" sourceRef="{a}" targetRef="{b}"{nm} />')
            wps = waypoints(pos[a], pos[b], lane_y, fo.get("exit"))
            wp = "".join(f'<di:waypoint x="{px:.0f}" y="{py:.0f}" />' for px, py in wps)
            lab = ""
            if name:
                (x1, y1), (x2, y2) = wps[0], wps[1]
                if x1 == x2:  # первый участок вертикальный
                    lx, ly = x1 + 6, (y1 + 4 if y2 > y1 else y1 - 32)
                else:
                    lx, ly = x1 + 4, (y1 + 4 if fo.get("lab") == "below" else y1 - 26)
                lab = f'<bpmndi:BPMNLabel><dc:Bounds x="{lx:.0f}" y="{ly:.0f}" width="90" height="28" /></bpmndi:BPMNLabel>'
            di_edges.append(f'<bpmndi:BPMNEdge id="{fid}_di" bpmnElement="{fid}">{wp}{lab}</bpmndi:BPMNEdge>')
        out.append("</bpmn:process>")
        sem.append("\n".join(out))
        y += pool_h + 60
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Defs_dosrochny" targetNamespace="http://koinotinav.tj/bpmn" exporter="Claude (Рон)" exporterVersion="1.0">
<bpmn:collaboration id="Collab_dosrochny">
{chr(10).join(participants)}
</bpmn:collaboration>
{chr(10).join(sem)}
<bpmndi:BPMNDiagram id="Diagram_dosrochny"><bpmndi:BPMNPlane id="Plane_dosrochny" bpmnElement="Collab_dosrochny">
{chr(10).join(di_shapes)}
{chr(10).join(di_edges)}
</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>
'''
    out_path = Path(__file__).with_name("dosrochny-vyhod.bpmn")
    out_path.write_text(xml, encoding="utf-8")
    print("written", out_path)


if __name__ == "__main__":
    build()

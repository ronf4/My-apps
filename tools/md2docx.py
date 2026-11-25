import re, sys
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

src, dst = sys.argv[1], sys.argv[2]
landscape = '--landscape' in sys.argv
import os
base = os.path.dirname(os.path.abspath(src))
lines = open(src, encoding='utf-8').read().splitlines()
d = Document()
sec = d.sections[0]
sec.left_margin = sec.right_margin = Cm(2); sec.top_margin = sec.bottom_margin = Cm(1.8)
if landscape:
    from docx.enum.section import WD_ORIENT
    sec.orientation = WD_ORIENT.LANDSCAPE
    sec.page_width, sec.page_height = sec.page_height, sec.page_width
    sec.left_margin = sec.right_margin = Cm(1.5)
from docx.shared import Emu
TEXT_W = sec.page_width - sec.left_margin - sec.right_margin
FONT = 'Times New Roman'
def set_font(style, size=None, bold=None, color_black=False):
    style.font.name = FONT
    rpr = style.element.get_or_add_rPr()
    rf = rpr.find(qn('w:rFonts'))
    if rf is None:
        rf = OxmlElement('w:rFonts'); rpr.append(rf)
    for k in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'):
        rf.set(qn(k), FONT)
    for k in ('w:asciiTheme', 'w:hAnsiTheme', 'w:eastAsiaTheme', 'w:cstheme'):
        if rf.get(qn(k)) is not None: del rf.attrib[qn(k)]
    if size: style.font.size = Pt(size)
    if bold is not None: style.font.bold = bold
    if color_black: style.font.color.rgb = RGBColor(0, 0, 0)
set_font(d.styles['Normal'], 12)
# шрифт по умолчанию для всего документа и всех стилей
_dd = d.styles.element.find(qn('w:docDefaults'))
_rf = _dd.find(qn('w:rPrDefault')).find(qn('w:rPr')).find(qn('w:rFonts'))
for k in list(_rf.attrib): del _rf.attrib[k]
for k in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'): _rf.set(qn(k), FONT)
for _rf2 in d.styles.element.iter(qn('w:rFonts')):
    for k in list(_rf2.attrib): del _rf2.attrib[k]
    for k in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'): _rf2.set(qn(k), FONT)
for name, size in (('Title', 20), ('Heading 1', 15), ('Heading 2', 13), ('Heading 3', 12)):
    set_font(d.styles[name], size, True, True)
for name in ('List Bullet', 'List Bullet 2', 'List Number', 'Table Grid'):
    try: set_font(d.styles[name])
    except KeyError: pass

def add_runs(p, text):
    parts = re.split(r'(\*\*[^*]+\*\*|`[^`]+`)', text)
    for part in parts:
        if not part: continue
        if part.startswith('**'): r = p.add_run(part[2:-2]); r.bold = True
        elif part.startswith('`'): r = p.add_run(part[1:-1]); r.italic = True
        else: p.add_run(part)

def shade(cell, color):
    tcPr = cell._tc.get_or_add_tcPr(); s = OxmlElement('w:shd')
    s.set(qn('w:val'), 'clear'); s.set(qn('w:color'), 'auto'); s.set(qn('w:fill'), color); tcPr.append(s)

i = 0
while i < len(lines):
    l = lines[i]
    if l.startswith('# '):
        h = d.add_heading(l[2:], 0)
    elif l.startswith('## '): d.add_heading(l[3:], 1)
    elif l.startswith('### '): d.add_heading(l[4:], 2)
    elif re.match(r'^!\[[^\]]*\]\(([^)]+)\)', l):
        path = re.match(r'^!\[[^\]]*\]\(([^)]+)\)', l).group(1)
        d.add_picture(os.path.join(base, path), width=TEXT_W)
        d.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    elif l.startswith('|'):
        rows = []
        while i < len(lines) and lines[i].startswith('|'):
            cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r':?-+:?', c) for c in cells): rows.append(cells)
            i += 1
        no_head = not any(rows[0])
        if no_head: rows = rows[1:]
        t = d.add_table(rows=len(rows), cols=len(rows[0])); t.style = 'Table Grid'
        for r, row in enumerate(rows):
            for c, val in enumerate(row):
                cell = t.cell(r, c); cell.text = ''
                p = cell.paragraphs[0]; add_runs(p, val)
                for run in p.runs: run.font.size = Pt(10.5)
                if r == 0 and not no_head:
                    for run in p.runs: run.bold = True
                    shade(cell, 'D9E2F3')
        d.add_paragraph()
        continue
    elif re.match(r'^\s*[-*] ', l):
        lvl = (len(l) - len(l.lstrip())) // 2
        p = d.add_paragraph(style='List Bullet 2' if lvl else 'List Bullet'); add_runs(p, l.strip()[2:])
    elif re.match(r'^\d+\. ', l):
        p = d.add_paragraph(style='List Number'); add_runs(p, re.sub(r'^\d+\. ', '', l))
    elif l.strip():
        # join wrapped lines
        buf = l
        while i + 1 < len(lines) and lines[i+1].strip() and not re.match(r'^(#|\||\s*[-*] |\d+\. )', lines[i+1]):
            i += 1; buf += ' ' + lines[i].strip()
        add_runs(d.add_paragraph(), buf)
    i += 1
d.save(dst)
print('ok', dst)

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
st = d.styles['Normal']; st.font.name = 'Calibri'; st.font.size = Pt(11)
st.element.rPr.rFonts.set(qn('w:eastAsia'), 'Calibri')

def add_runs(p, text):
    parts = re.split(r'(\*\*[^*]+\*\*|`[^`]+`)', text)
    for part in parts:
        if not part: continue
        if part.startswith('**'): r = p.add_run(part[2:-2]); r.bold = True
        elif part.startswith('`'): r = p.add_run(part[1:-1]); r.font.name = 'Consolas'; r.font.size = Pt(10)
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
        t = d.add_table(rows=len(rows), cols=len(rows[0])); t.style = 'Table Grid'
        for r, row in enumerate(rows):
            for c, val in enumerate(row):
                cell = t.cell(r, c); cell.text = ''
                p = cell.paragraphs[0]; add_runs(p, val)
                for run in p.runs: run.font.size = Pt(9.5)
                if r == 0:
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

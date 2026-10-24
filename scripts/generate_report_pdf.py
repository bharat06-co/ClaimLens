"""Optional: build a printable, honest report from docs/PROJECT_REPORT.md.
Needs Python packages `reportlab` and `mistune`. The PDF is also included.
"""
from __future__ import annotations
import html
from pathlib import Path
import mistune
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether, Preformatted, HRFlowable
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'docs/PROJECT_REPORT.md'
TARGET=ROOT/'docs/PROJECT_REPORT.pdf'
FONT_PATH=Path('/usr/share/fonts/truetype/dejavu')
if (FONT_PATH/'DejaVuSans.ttf').exists():
 pdfmetrics.registerFont(TTFont('DV',str(FONT_PATH/'DejaVuSans.ttf')))
 pdfmetrics.registerFont(TTFont('DV-Bold',str(FONT_PATH/'DejaVuSans-Bold.ttf')))
 FONT='DV'; FONT_B='DV-Bold'
else:
 FONT='Helvetica'; FONT_B='Helvetica-Bold'

NAVY=colors.HexColor('#183047'); BLUE=colors.HexColor('#235E7B'); MINT=colors.HexColor('#DDF3D6')
PAGE_W,PAGE_H=landscape(A4)
style={
 'title':ParagraphStyle('title',fontName=FONT_B,fontSize=31,leading=38,textColor=NAVY,spaceAfter=18),
 'subtitle':ParagraphStyle('subtitle',fontName=FONT_B,fontSize=14,leading=21,textColor=BLUE,spaceAfter=14),
 'h1':ParagraphStyle('h1',fontName=FONT_B,fontSize=17,leading=24,textColor=NAVY,spaceBefore=8,spaceAfter=5,keepWithNext=True),
 'h2':ParagraphStyle('h2',fontName=FONT_B,fontSize=12.2,leading=17,textColor=BLUE,spaceBefore=8,spaceAfter=5,keepWithNext=True),
 'base':ParagraphStyle('base',fontName=FONT,fontSize=9.1,leading=12.95,textColor=NAVY,spaceAfter=6),
 'small':ParagraphStyle('small',fontName=FONT,fontSize=7.8,leading=10.9,textColor=NAVY,spaceAfter=4),
 'th':ParagraphStyle('th',fontName=FONT_B,fontSize=7.4,leading=10.7,textColor=NAVY),
 'bullet':ParagraphStyle('bullet',fontName=FONT,fontSize=8.9,leading=13.0,leftIndent=18,firstLineIndent=-10,spaceAfter=4),
 'code':ParagraphStyle('code',fontName=FONT,fontSize=8,leading=12,textColor=BLUE,spaceAfter=6),
}

def fmt(items):
 out=''
 for node in items or []:
  k=node['type']
  if k=='text':out+=html.escape(node['raw'])
  elif k=='softbreak':out+=' '
  elif k=='linebreak':out+='<br/>'
  elif k=='strong':out+='<b>'+fmt(node.get('children'))+'</b>'
  elif k=='emphasis':out+='<i>'+fmt(node.get('children'))+'</i>'
  elif k=='codespan':out+='<font color="#235E7B">'+html.escape(node['raw'])+'</font>'
  elif k=='link':out+=fmt(node.get('children'))
  elif k=='image':out+=html.escape(node.get('attrs',{}).get('url','image'))
  else:out+=fmt(node.get('children'))
 return out

def render(nodes,story):
 for node in nodes:
  kind=node['type']
  if kind=='heading':
   level=node.get('attrs',{}).get('level',2)
   text=fmt(node.get('children'))
   if level==1:story.append(Paragraph(text,style['title']))
   elif level==2:story.append(Paragraph(text,style['subtitle'] if text.startswith('DBMS ') else style['h1']))
   else:story.append(Paragraph(text,style['h2']))
  elif kind=='paragraph':
   images=[x for x in node.get('children',[]) if x['type']=='image']
   if images:
    for img in images:
     filename=img.get('attrs',{}).get('url','')
     f=(SOURCE.parent/filename).resolve()
     if f.exists():
      im=Image(str(f));im.drawWidth=PAGE_W-110;im.drawHeight=im.imageHeight*im.drawWidth/im.imageWidth
      if im.drawHeight>PAGE_H*.56:
       im.drawHeight=PAGE_H*.56;im.drawWidth=im.imageWidth*im.drawHeight/im.imageHeight
      story.append(im);story.append(Spacer(1,12))
   else:story.append(Paragraph(fmt(node['children']),style['base']))
  elif kind=='list':
   for i,item in enumerate(node['children']):
    content=' '.join(fmt(x.get('children')) for x in item.get('children',[]))
    marker=str(i+1)+'.' if node.get('attrs',{}).get('ordered') else '•'
    story.append(Paragraph(html.escape(marker)+'  '+content,style['bullet']))
   story.append(Spacer(1,5))
  elif kind=='table':
   head=node['children'][0]['children']
   body=node['children'][1]['children'] if len(node['children'])>1 else []
   rows=[[Paragraph(fmt(c['children']),style['th']) for c in head]]
   for tr in body:
    rows.append([Paragraph(fmt(c['children']),style['small']) for c in tr['children']])
   cols=len(head)
   widths=[(PAGE_W-100)/cols]*cols
   if cols==4:widths=[(PAGE_W-100)*x for x in (.08,.38,.33,.21)]
   elif cols==2:widths=[(PAGE_W-100)*.30,(PAGE_W-100)*.70]
   t=Table(rows,colWidths=widths,repeatRows=1,hAlign='LEFT',splitByRow=1)
   t.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0),MINT),('GRID',(0,0),(-1,-1),0.4,colors.HexColor('#CBD7DC')),
    ('VALIGN',(0,0),(-1,-1),'TOP'),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F5F9FA')]),
    ('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
   ]));story.append(t);story.append(Spacer(1,14))
  elif kind=='block_code':
   code=node['raw']
   # Keep diagrams available as markdown source; link to diagram from the PDF instead.
   if 'flowchart' in code:
    story.append(Paragraph('System flow: Customer / Officer → Next.js API and role authentication → PostgreSQL relational data and pgvector search → Officer decision and audit/repair.',style['base']))
   else:
    for line in code.strip().splitlines()[:12]:story.append(Paragraph(html.escape(line),style['code']))
  elif kind=='thematic_break':story.append(HRFlowable(width='100%',thickness=1,color=colors.HexColor('#CCDCE4'),spaceBefore=14,spaceAfter=14))

def footer(cv:canvas.Canvas,doc):
 cv.saveState();cv.setStrokeColor(colors.HexColor('#CBD7DC'));cv.line(50,35,PAGE_W-50,35)
 cv.setFont(FONT,7.5);cv.setFillColor(BLUE)
 cv.drawString(51,23,'CLAIMLENS  |  DBMS Level 3 · Project Report')
 cv.drawRightString(PAGE_W-51,23,f'Page {doc.page}')
 cv.restoreState()

nodes=mistune.create_markdown(renderer='ast',plugins=['table'])(SOURCE.read_text(encoding='utf-8'))
story=[];render(nodes,story)
doc=SimpleDocTemplate(str(TARGET),pagesize=landscape(A4),leftMargin=50,rightMargin=50,topMargin=35,bottomMargin=44,title='CLAIMLENS — DBMS Level 3 Project Report',author='CLAIMLENS student project team')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(TARGET, TARGET.stat().st_size)

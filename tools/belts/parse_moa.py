# 从农业农村部原始公告解析出逐条名单 -> moa.txt  (kind|year|province|place|industry|src)
import re, html, os, sys
D = '/workspace/belt-src/moa'; H = os.path.dirname(os.path.abspath(__file__))
PROV = ['北京','天津','河北','山西','内蒙古','辽宁','吉林','黑龙江','上海','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','广西','海南','重庆','四川','贵州','云南','西藏','陕西','甘肃','青海','宁夏','新疆']
def prov_of(s):
    for p in PROV:
        if s.startswith(p): return p
    if s.startswith(('兵团','新疆生产建设兵团')): return '新疆'
    if s.startswith(('北大荒','黑龙江农垦')): return '黑龙江'
    return ''
def strip_prov(s):
    return re.sub(r'^(北京市|天津市|上海市|重庆市|内蒙古自治区|广西壮族自治区|西藏自治区|宁夏回族自治区|新疆维吾尔自治区|新疆生产建设兵团|[^省]{2,3}省)', '', s)
out = []
def emit(kind, y, p, place, ind, src):
    place = re.sub(r'\s+', '', place); ind = re.sub(r'\s+', '', ind)
    if p and place: out.append('|'.join([kind, str(y), p, place, ind, src]))
# 强镇 2018-2020 表格
t = open(f'{D}/qz1820.html', encoding='utf-8', errors='ignore').read()
for r in re.findall(r'<tr.*?</tr>', t, re.S):
    c = [html.unescape(re.sub('<.*?>', '', x)).strip() for x in re.findall(r'<td.*?</td>', r, re.S)]
    if len(c) >= 5 and c[4].isdigit() and prov_of(c[1]) :
        for town in re.split('[、，,]', c[2]):
            emit('强镇', c[4], prov_of(c[1]), town, '', f'农业农村部 财政部{c[4]}年农业产业强镇示范建设名单')
# 2021/2023 融合项目通知
for y in (2021, 2023):
    L = [re.sub(r'^\d+\s*[．.、]\s*','',l.strip()) for l in open(f'{D}/y{y}.html.txt', encoding='utf-8') if l.strip()]
    txt = '\n'.join(L)
    sec = re.split(r'年(?:国家现代农业产业园创建|优势特色产业集群建设|农业)\s*(?:产业\s*)?(?:强镇创建)?名单', txt)
    # 找出最后一次出现的三个附件标题位置
    i1 = txt.rfind('现代农业产业园创建名单'); i2 = txt.rfind('优势特色产业集群建设名单'); i3 = max(txt.rfind('强镇创建名单'), 0)
    yuan = txt[i1:i2]; jq = txt[i2:i3]; qz = txt[i3:]
    for m in re.findall(r'^(\S+?现代农业产业园)$', yuan, re.M):
        if prov_of(m): emit('产业园', y, prov_of(m), strip_prov(m).replace('现代农业产业园', ''), '现代农业产业园', f'农业农村部 财政部{y}年国家现代农业产业园创建名单')
    for m in re.findall(r'^(\S+?产业集群)$', jq, re.M):
        if prov_of(m): emit('集群', y, prov_of(m), prov_of(m), strip_prov(m).replace('产业集群', ''), f'农业农村部 财政部{y}年优势特色产业集群建设名单')
    qz = re.sub(r'\n：', '：', qz.replace('\n：', '：'))
    for m in re.finditer(r'^(\S{2,12}?(?:省|市|自治区|兵团))\s*[：:]\s*\n?([^\n]*)', qz, re.M):
        p = prov_of(m.group(1))
        for town in re.split('[、，,；;]', m.group(2).rstrip('。')):
            if re.search(r'(镇|乡|街道|苏木|团场|农场|团|场)$', town.strip()): emit('强镇', y, p, town, '', f'农业农村部 财政部{y}年农业产业强镇创建名单')
# 一村一品 第11批 + 十亿元镇/亿元村
T0 = [l.strip() for l in open(f'{D}/yc11.txt', encoding='utf-8')]
T1 = []
for l in T0:
    if not l or l.startswith('—'): continue
    if T1 and not prov_of(l) and not l.startswith(('附件','2021','第十')) and prov_of(T1[-1]) and not re.search(r'(\)|村|镇|乡|街道|场)$', T1[-1]): T1[-1] += l
    else: T1.append(l)
T = '\n'.join(T1)
a2 = T.rfind('2021 年全国乡村特色产业十亿元镇名单'); a3 = T.rfind('2021 年全国乡村特色产业亿元村名单')
for m in re.finditer(r'^(\S+?)\(\s*(.+?)\)\s*$', T[:a2], re.M):
    s = m.group(1)
    if prov_of(s): emit('一村一品', 2021, prov_of(s), strip_prov(s), m.group(2), '农业农村部第十一批全国“一村一品”示范村镇名单（2021）')
for part, kind, src in ((T[a2:a3], '十亿元镇', '2021年全国乡村特色产业十亿元镇名单'), (T[a3:], '亿元村', '2021年全国乡村特色产业亿元村名单')):
    for s in re.findall(r'^(\S+?(?:镇|乡|村|街道|社区|嘎查|场))$', part, re.M):
        if prov_of(s): emit(kind, 2021, prov_of(s), strip_prov(s), '', '农业农村部' + src)
open(f'{H}/moa.txt', 'w', encoding='utf8').write('\n'.join(out) + '\n')
from collections import Counter
print(len(out), Counter((l.split('|')[0], l.split('|')[1]) for l in out))

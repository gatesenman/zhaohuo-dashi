# 生成 src/belts.json：工信部中小企业特色产业集群(2022-2025) + 农业农村部优势特色产业集群(2020-2023) + 消费品/1688/淘宝村产业带
import json, re, os
H = os.path.dirname(os.path.abspath(__file__)); R = os.path.join(H, '..', '..')
PROV = ['北京','天津','河北','山西','内蒙古','辽宁','吉林','黑龙江','上海','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','广西','海南','重庆','四川','贵州','云南','西藏','陕西','甘肃','青海','宁夏','新疆']
CBD = {'宁波':'浙江','厦门':'福建','青岛':'山东','深圳':'广东','大连':'辽宁'}
MUNI = {'北京','天津','上海','重庆'}
UNIT = r'[\u4e00-\u9fa5]{1,6}?(?:市|县|区|镇|街道|办事处)'
def parse_miit(name):
    s = name.replace('产业集群', '').replace('集群', '')
    prov = city = county = ''
    if s.startswith('新疆生产建设兵团'): prov, s = '新疆', s[len('新疆生产建设兵团'):]
    else:
        for c, p in CBD.items():
            if s.startswith(c + '市') or s.startswith(c): prov, city = p, c; s = s[len(c) + (1 if s.startswith(c + '市') else 0):]; break
        else:
            m = re.match(r'(北京|天津|上海|重庆)市', s)
            if m: prov = city = m.group(1); s = s[m.end():]
            else:
                m = re.match(r'(.+?)(省|自治区|壮族自治区|回族自治区|维吾尔自治区)', s)
                prov = next(p for p in PROV if s.startswith(p)); s = s[m.end():]
    if s.startswith('津市市'): u1, s = '津市市', s[3:]
    else:
        m = re.match(UNIT, s); u1 = m.group(0); s = s[m.end():]
    u2 = ''
    if u1.endswith('市') and not city:
        m = re.match(UNIT, s)
        if m and len(m.group(0)) <= 5 and not m.group(0).startswith('丘陵'): u2 = m.group(0); s = s[m.end():]
    if city:  # 直辖市/计划单列市：u1 即区县
        county = u1
    elif u2: city, county = u1.rstrip('市'), u2
    else:
        county = u1
    return prov, city, county, s
def sites_for(ind, place):
    r = []
    rules = [('女装|服装|童装|男装|毛衫|羊毛衫|牛仔|休闲服|泳装|内衣|针织|汉服|演出服|羽绒', ['vvic', 'zwd17', 'wsy']),
             ('女装', ['3e3e']), ('鞋', ['cnxieku', 'go2']), ('箱包|皮具|皮革', ['bao66']),
             ('家纺|毛巾|面料|纺织|丝绸|布|蚕|化纤|纤维|无纺布|羊绒|毛纺', ['zhaojiafang', 'texindex']),
             ('小商品|饰品|玩具|日用|百货|工艺|礼品|文具|伞|打火机|假发|制刷|刷', ['yiwugo']),
             ('电子|元器件|芯片|半导体|连接器|传感器|显示|集成电路|电容|线路板|印制电路|光电|射频|3C|手机', ['szlcsc', 'ickey', 'hqchip', 'hqew']),
             ('五金|工具|轴承|紧固件|标准件|泵|阀|机床|密封|锁|法兰|刀|丝网|量具|卷尺|电机|电器|电气|电缆|电线|模具|锻|铸造|机械|装备|设备|机器人|仪器|零部件|配件|汽配|起重|农机|汽车|车|电梯|压缩机|变压器|绝缘子|油缸|气动|元件|输配电|配电|锻件|管道|管网|叉车|机具|钻采|井口|风电|光伏|储能|电池', ['ehsy', 'zkh']),
             ('钢|铝|合金|金属|钛|铜|镍|稀土|钒|镁|特冶|硬质', ['mysteel']),
             ('化工|塑料|氟|有机硅|尼龙|树脂|橡胶|高分子|涂料|烯烃|磷|盐|碳酸钙|原料药|材料', ['chemnet']),
             ('蔬菜|果|苹果|梨|柑橘|橘|橙|柚|荔枝|芒果|李|猕猴桃|葡萄|枣|核桃|茶|菇|木耳|米|麦|稻|豆|花生|谷子|高粱|玉米|马铃薯|薯|油菜|向日葵|葵花|蒜|辣椒|椒|中药|药材|三七|人参|怀药|亳药|花卉|鲜切花|枸杞|牛|羊|猪|鸡|鹅|蛋|禽|奶|乳|鱼|虾|小龙虾|牦牛|蜂|榨菜|泡菜|食品|干果|咖啡|橡胶|糖|蔗|青稞|棉花|马|菌|笋|竹|花椒|百合|虫草|松茸|火锅|螺蛳粉|小吃', ['cnhnb', 'ymt'])]
    for pat, ids in rules:
        if re.search(pat, ind): r += [i for i in ids if i not in r]
    if re.search('义乌', place): r = ['yiwugo', 'iyicaibao'] + [i for i in r if i not in ('yiwugo', 'iyicaibao')]
    if re.search('四季青|余杭', place): r = ['hznzcn'] + [i for i in r if i != 'hznzcn']
    if re.search('叠石桥|志浩|南通', place): r = ['zhaojiafang'] + [i for i in r if i != 'zhaojiafang']
    if re.search('晋江|莆田|温州|温岭', place) and '鞋' in ind: r = ['cnxieku'] + [i for i in r if i != 'cnxieku']
    return r[:6]
CATS = [('服装', '女装|服装|童装|男装|毛衫|羊毛衫|牛仔|休闲服|泳装|内衣|针织|汉服|演出服|羽绒|皮草|领带|纽扣|拉链|刺绣|毛织|裘皮|苗绣'), ('鞋包', '鞋|箱包|皮具|皮革'),
        ('纺织家纺', '家纺|毛巾|面料|纺织|丝绸|布|化纤|纤维|无纺布|羊绒|毛纺|丝网|绳网|袜'), ('小商品工艺', '小商品|饰品|玩具|日用|百货|工艺|礼品|文具|伞|打火机|假发|刷|笔|珠宝|黄金|珍珠|玉|翡翠|水晶|陶|瓷|紫砂|乐器|吉他|眼镜|钟表|烟花|画|宣纸|漆|银器|石雕|红木|假睫毛|风筝|体育|唐三彩|宝石|衣架|银饰|电商|进口'),
        ('机械五金', '五金|工具|轴承|紧固件|标准件|泵|阀|机床|密封|法兰|刀|量具|卷尺|电机|模具|锻|铸造|机械|装备|设备|机器人|仪器|零部件|配件|汽配|起重|农机|汽车|车|电梯|压缩机|油缸|气动|元件|管道|叉车|钻采|风电|光伏|航空|船|汽摩|轮胎|再制造|轨道|无人机|机电|磨床|暖通|刺绣机|应急|氢能|管网'),
        ('家具家居', '家具|家居|椅|地板|木|板材|卫浴|水暖|灯|厨|家电|集成灶|锁|木门|胶合板|照明'), ('电子电气', '电子|元器件|芯片|半导体|连接器|传感器|显示|集成电路|电容|线路板|电路|光电|射频|3C|手机|电器|电气|电缆|电线|输配电|配电|变压器|绝缘子|通信|光纤|电池|储能|能源电子|信息|软件|数据|密码|卫星|北斗|网络|智能终端|互联网|物联网|线缆|感知|控制系统|智控|系统集成|数字|智慧城市'),
        ('材料化工', '钢|铝|合金|金属|钛|铜|镍|稀土|钒|镁|特冶|硬质|化工|塑料|氟|有机硅|尼龙|树脂|橡胶|高分子|涂料|烯烃|磷|盐|碳酸钙|材料|玻璃|包装|纸|印刷|化学品|橡塑|外加剂|废弃资源|板带材|煤|油气'),
        ('食品农产', '蔬菜|果|苹果|梨|柑橘|橘|橙|柚|荔枝|芒果|李|猕猴桃|葡萄|枣|核桃|茶|菇|木耳|米|麦|稻|豆|花生|谷子|高粱|玉米|马铃薯|薯|油菜|向日葵|葵花|蒜|辣椒|椒|牛|羊|猪|鸡|鹅|蛋|禽|奶|乳|鱼|虾|牦牛|蜂|榨菜|泡菜|食品|干果|咖啡|蔗|糖|青稞|棉花|马|菌|笋|竹|百合|虫草|松茸|火锅|螺蛳粉|小吃|酒|海产|花卉|鲜切花|花木|种子|薰衣草|陈皮|橡胶|面粉|芥菜|林蛙|红肠|黄花|农产品|柠檬|蚕桑|瓜菜|香料'),
        ('医药健康', '药|医|生物|基因|人参|三七|中药|怀药|亳药|化妆品|枸杞|艾草|化橘红|检测|酶|生命科学')]
def cat_of(ind):
    for c, pat in CATS:
        if re.search(pat, ind): return c
    return '其他'
out = []; seen = set()
def add(o):
    k = (o['province'], o['county'] or o['city'], o['industry'])
    if k in seen: return
    seen.add(k); o['id'] = f"b{len(out)+1:04d}"; out.append(o)
# 1) 消费品/批发产业带（与采购最相关，排前）
for l in open(os.path.join(H, 'consumer.txt'), encoding='utf8'):
    l = l.strip()
    if not l: continue
    p, c, t, ind, mk = l.split('|')
    add(dict(name=t if t != c else c, province=p, city=c, county=t if t != c else '', industry=ind, market=mk, sites=sites_for(ind, c + t + mk), kind='批发/电商产业带', src='1688产业带/淘宝村/专业市场'))
# 2) 工信部
for l in open(os.path.join(H, 'miit.txt'), encoding='utf8'):
    y, n = l.strip().split('|'); p, c, t, ind = parse_miit(n)
    nm = t if t.endswith(('新区','镇','街道','办事处')) or len(t) <= 2 else t[:-1]
    add(dict(name=nm, province=p, city=c or nm, county=t, industry=ind, market=f'国家级中小企业特色产业集群（{y}）', sites=sites_for(ind, c + t), kind='制造业集群', src=f'工信部{y}年度中小企业特色产业集群'))
# 3) 农业农村部
for l in open(os.path.join(H, 'agri.txt'), encoding='utf8'):
    y, p, ind = l.strip().split('|')
    nm = re.sub(r'^(兵团|北大荒|农垦)', lambda m: m.group(1), ind)
    add(dict(name=f'{p}·{ind}', province=p, city='', county='', industry=ind, market=f'优势特色产业集群（{y}）', sites=sites_for(ind, p), kind='农业集群', src=f'农业农村部 财政部{y}年优势特色产业集群'))
# 4) 工信部 国家先进制造业集群 (2022 45个 + 2024 35个)
for l in open(os.path.join(H, 'am.txt'), encoding='utf8'):
    if not l.strip(): continue
    y, n, p, c, ind = l.strip().split('|')
    add(dict(name=n.replace('集群', ''), province=p, city=c, county='', industry=ind, market=f'国家先进制造业集群（{y}）', sites=sites_for(ind, c), kind='制造业集群', src=f'工信部{y}年国家先进制造业集群名单（牵头城市为名单首列地区）'))
# 5) 农业农村部 强镇/产业园/集群(2021,2023)/一村一品/十亿元镇/亿元村
AGY = {l.split('|')[0] for l in open(os.path.join(H, 'agri.txt'), encoding='utf8') if l.strip()}
KN = {'强镇':'农业产业强镇','产业园':'国家现代农业产业园','集群':'优势特色产业集群','一村一品':'一村一品示范村镇','十亿元镇':'乡村特色产业十亿元镇','亿元村':'乡村特色产业亿元村'}
def split_place(pl):
    m = re.match(r'^(?:(.{2,6}?(?:市|州|盟|地区)))?(.{1,8}?(?:区|县|市|旗))?(.*)$', pl)
    return (m.group(1) or '').rstrip('市'), m.group(2) or '', m.group(3) or ''
for l in open(os.path.join(H, 'moa.txt'), encoding='utf8'):
    if not l.strip(): continue
    k, y, p, pl, ind, src = l.strip().split('|')
    if k == '集群' and y in AGY: continue  # v3.5 已从同一通知录入（agri.txt），避免重复
    if k == '集群':
        add(dict(name=f'{p}·{ind}', province=p, city='', county='', industry=ind, market=f'优势特色产业集群（{y}）', sites=sites_for(ind, p), kind='农业集群', src=src)); continue
    c, t, rest = split_place(pl)
    ind2 = ind or KN[k]
    add(dict(name=pl, province=p, city=c, county=t or rest, industry=ind2, market=f'{KN[k]}（{y}）', sites=sites_for(ind2, p + pl), kind='农业集群', src=src))
MK = {'十三行','四季青','华强北','沙河','五爱','七浦路','汉正街','朝天门','芦淞','荷花池','斗南','新发地','潘家园','一德路','站西','中大布匹','康复路','花果园','水贝','大浪','白云','番禺','天山','城关','城东','兴庆','道里','兰山','二七','鹿城','建安','青山湖','珠山','渝中','龙岗','武侯','东坡','翠屏','江阳','思茅','兴宁','万秀','鱼峰','海城','龙华','吉阳','甘井子','鲅鱼圈','赛罕','东胜','松山','海拉尔','朝阳','五常','爱辉','丰台','西城','北辰','黄浦','静安','嘉定','奉贤','闵行','宿豫','邗江','武进','潮安','潮南','揭东','阳东','梅县','涵江','秀屿','同安','龙文','长乐','兴宁','安定','武都','甘州','临河','锡林浩特','前郭','龙山','南台'}
for o in out:
    o['city'] = o['city'] or ''
    if o['kind'] == '农业集群': o['kw'] = '' if not o['county'] else (o['county'][:-1] if len(o['county']) >= 3 and o['county'][-1] in '县区旗' else o['county'])
    elif o['kind'] == '制造业集群': o['kw'] = o['city'] if o['county'].endswith(('区', '街道', '办事处')) or o['city'] in ('北京','天津','上海','重庆') else o['name']
    else:
        t = o['county']
        o['kw'] = o['city'] if not t or t in MK else (t[:2] if len(t) >= 4 else t)
    o['cat'] = cat_of(o['industry'])
json.dump(out, open(os.path.join(R, 'src', 'belts.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
from collections import Counter
print(len(out)); print(Counter(o['kind'] for o in out)); print(sorted(Counter(o['province'] for o in out).items(), key=lambda x: -x[1]))

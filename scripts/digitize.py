"""Reproducible, approximate digitisation of the user's A2 scan.

GCP positions are manually read on the 2000-pixel-wide preview; no administrative
polygons are used to manufacture linguistic boundaries. Outputs are exploratory.
"""
from pathlib import Path
import json, hashlib
import numpy as np
import cv2
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist' / 'data'
ATLAS = ROOT / 'dist' / 'atlas'
OUT.mkdir(parents=True, exist_ok=True)
ATLAS.mkdir(parents=True, exist_ok=True)

# name, source x/y (preview, width=2000), longitude/latitude (approx. city centre)
GCPS = [
 ('北京',1405,599,116.4074,39.9042),('天津',1437,622,117.2000,39.1333),
 ('哈尔滨',1651,331,126.6424,45.7560),('长春',1627,408,125.3235,43.8171),
 ('沈阳',1595,496,123.4315,41.8057),('大连',1567,617,121.6147,38.9140),
 ('济南',1444,725,117.1201,36.6512),('郑州',1342,799,113.6254,34.7466),
 ('西安',1196,832,108.9398,34.3416),('兰州',1030,770,103.8343,36.0611),
 ('西宁',968,745,101.7782,36.6171),('银川',1113,671,106.2309,38.4872),
 ('太原',1302,687,112.5489,37.8706),('大同',1314,603,113.3001,40.0768),
 ('呼和浩特',1263,576,111.7492,40.8426),
 ('成都',1038,974,104.0665,30.5723),('重庆',1119,1017,106.5516,29.5630),
 ('昆明',989,1189,102.7123,25.0406),('贵阳',1128,1129,106.6302,26.6470),
 ('南宁',1188,1272,108.3669,22.8170),('海口',1264,1381,110.1983,20.0440),
 ('广州',1362,1251,113.2644,23.1291),('香港',1399,1285,114.1694,22.3193),
 ('长沙',1343,1057,112.9388,28.2282),('武汉',1378,959,114.3054,30.5931),
 ('南昌',1441,1033,115.8582,28.6829),('杭州',1568,956,120.1551,30.2741),
 ('上海',1608,911,121.4737,31.2304),('南京',1523,892,118.7969,32.0603),
 ('合肥',1469,902,117.2272,31.8206),('福州',1563,1117,119.2965,26.0745),
 ('厦门',1527,1178,118.0894,24.4798),('温州',1600,1045,120.6994,27.9943),
 ('台北',1644,1152,121.5654,25.0330),('高雄',1613,1248,120.3014,22.6273),
 ('乌鲁木齐',587,428,87.6168,43.8256),('喀什',227,513,75.9898,39.4677),
 ('库尔勒',532,504,86.1746,41.7269),('伊宁',425,389,81.3241,43.9168),
 ('哈密',748,489,93.5151,42.8185),
]

def design(p):
    p=np.asarray(p,dtype=float)/1000
    x,y=p[:,0],p[:,1]
    return np.array([np.ones(len(x)),x,y,x*x,x*y,y*y]).T

xy=np.array([[v[1],v[2]] for v in GCPS],float)
ll=np.array([[v[3],v[4]] for v in GCPS],float)
coef=np.linalg.lstsq(design(xy),ll,rcond=None)[0]
def geo(p): return design(p) @ coef
def km_error(a,b):
    d=(a-b)*np.array([111.32*np.cos(np.deg2rad(b[:,1])),np.full(len(b),111.32)]).T
    return np.sqrt((d*d).sum(axis=1))
fit_errors=km_error(geo(xy),ll)
loo=[]
for i in range(len(xy)):
    keep=np.arange(len(xy))!=i
    c=np.linalg.lstsq(design(xy[keep]),ll[keep],rcond=None)[0]
    loo.append(float(km_error(design(xy[i:i+1])@c,ll[i:i+1])[0]))

im=np.array(Image.open(ROOT/'reference/A2.JPG').convert('RGB'))
h,w=im.shape[:2]
im=cv2.resize(im,(2000,round(h*2000/w)),interpolation=cv2.INTER_AREA)
h,w=im.shape[:2]
lab=cv2.cvtColor(im,cv2.COLOR_RGB2LAB).astype(float)
hsv=cv2.cvtColor(im,cv2.COLOR_RGB2HSV)
# Printed colour samples from actual map or legend. Spatial bounds only suppress
# legends and visibly impossible colour confusion; the shape comes from pixels.
classes=[
 ('官话',(189,235,173),(40,60,1960,1380)),
 ('晋语',(250,192,119),(1060,500,1425,820)),
 ('赣语',(125,194,173),(1280,900,1520,1210)),
 ('徽语',(176,212,62),(1440,910,1540,1030)),
 ('吴语',(241,199,219),(1450,860,1660,1110)),
 ('湘语',(239,125,89),(1180,1000,1385,1245)),
 ('客家话',(243,143,145),(1090,1030,1650,1350)),
 ('粤语',(108,142,91),(1110,1140,1460,1370)),
 ('平话',(255,201,90),(1100,1170,1250,1320)),
 ('闽语',(244,233,56),(1190,1020,1700,1450)),
]
valid=np.zeros((h,w),np.uint8); valid[60:1450,40:1960]=1
valid[60:409,789:1290]=0
valid[1105:,:757]=0
valid[1180:,1730:]=0
# Desaturated paper, sea and ink cannot be colour evidence.
valid[(hsv[:,:,1]<38)|(hsv[:,:,2]<95)|((hsv[:,:,0]>85)&(hsv[:,:,0]<120))]=0
dist=[]
for name,rgb,bounds in classes:
    c=cv2.cvtColor(np.array([[rgb]],np.uint8),cv2.COLOR_RGB2LAB)[0,0].astype(float)
    d=np.sqrt(((lab-c)**2).sum(axis=2))
    x1,y1,x2,y2=bounds
    allowed=np.zeros((h,w),bool); allowed[y1:y2,x1:x2]=True
    d[~allowed]=1000
    dist.append(d)
dist=np.stack(dist)
labels=dist.argmin(axis=0)
best=dist.min(axis=0)
features=[]
preview=np.full_like(im,250)
counts={}
for i,(name,rgb,bounds) in enumerate(classes):
    mask=((labels==i)&(best<38)&(valid>0)).astype(np.uint8)*255
    # Close small text/river interruptions while preserving larger uncoloured islands.
    mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
    mask=cv2.morphologyEx(mask,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
    mask[valid==0]=0
    contours,hierarchy=cv2.findContours(mask,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
    polys=[]
    if hierarchy is None: continue
    hierarchy=hierarchy[0]
    for j,contour in enumerate(contours):
        if hierarchy[j][3]!=-1 or cv2.contourArea(contour)<50: continue
        contour=cv2.approxPolyDP(contour,1.3,True).reshape(-1,2)
        if len(contour)<3: continue
        def ring(c,outer):
            coords=geo(c)
            area=np.sum(coords[:,0]*np.roll(coords[:,1],-1)-np.roll(coords[:,0],-1)*coords[:,1])
            if (area>0)!=outer: coords=coords[::-1]
            a=np.round(coords,5).tolist(); a.append(a[0]); return a
        rings=[ring(contour,True)]
        child=hierarchy[j][2]
        while child!=-1:
            inner=contours[child]
            if cv2.contourArea(inner)>100:
                inner=cv2.approxPolyDP(inner,1.3,True).reshape(-1,2)
                if len(inner)>2: rings.append(ring(inner,False))
            child=hierarchy[child][0]
        polys.append(rings)
        cv2.fillPoly(preview,[contour.astype(np.int32)],rgb)
    counts[name]=len(polys)
    features.append({'type':'Feature','properties':{'family':name,'source':'A2','method':'scan-color-segmentation; second-order polynomial georeferencing','uncertainty':'approximate; unreviewed local boundaries','polygonCount':len(polys)},'geometry':{'type':'MultiPolygon','coordinates':polys}})

(OUT/'dialects.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
Image.fromarray(preview).save(ROOT/'reference/segmentation-preview.png')

# Representative spoken varieties. Coordinates are modern approximate city-centre
# anchors, NOT extraction of survey-point coordinates or whole-city boundaries.
# cluster deliberately stops at a supported subdivision; it is not a measured
# intelligibility equivalence class. Old atlas terminology is retained.
ROWS='''
beijing|北京|116.4074|39.9042|官话|北京官话|北京官话|B2|北京话
tianjin|天津|117.2000|39.1333|官话|冀鲁官话|冀鲁官话|B2|天津话
shijiazhuang|石家庄|114.5149|38.0428|官话|冀鲁官话|冀鲁官话|B2|石家庄城区话
baoding|保定|115.4648|38.8740|官话|冀鲁官话|冀鲁官话|B2|保定话
jinan|济南|117.1201|36.6512|官话|冀鲁官话|冀鲁官话|B3|济南话
qingdao|青岛|120.3826|36.0671|官话|胶辽官话|胶辽官话|B3|青岛话
yantai|烟台|121.4479|37.4638|官话|胶辽官话|胶辽官话|B3|烟台话
dalian|大连|121.6147|38.9140|官话|胶辽官话|胶辽官话|B1|大连话
shenyang|沈阳|123.4315|41.8057|官话|东北官话|东北官话|B1|沈阳话
changchun|长春|125.3235|43.8171|官话|东北官话|东北官话|B1|长春话
harbin|哈尔滨|126.6424|45.7560|官话|东北官话|东北官话|B1|哈尔滨话
qiqihar|齐齐哈尔|123.9182|47.3543|官话|东北官话|东北官话|B1|齐齐哈尔话
zhengzhou|郑州|113.6254|34.7466|官话|中原官话|中原官话|B3|郑州话
luoyang|洛阳|112.4540|34.6197|官话|中原官话|中原官话|B3|洛阳话
kaifeng|开封|114.3076|34.7972|官话|中原官话|中原官话|B3|开封话
xian|西安|108.9398|34.3416|官话|中原官话|中原官话|B4|西安话
baoji|宝鸡|107.2373|34.3619|官话|中原官话|中原官话|B4|宝鸡话
lanzhou|兰州|103.8343|36.0611|官话|兰银官话|兰银官话|B4|兰州话
yinchuan|银川|106.2309|38.4872|官话|兰银官话|兰银官话|B4|银川话
urumqi|乌鲁木齐|87.6168|43.8256|官话|兰银官话|兰银官话|B5|乌鲁木齐汉语方言
chengdu|成都|104.0665|30.5723|官话|西南官话|成渝片|B6|成都话
chongqing|重庆|106.5516|29.5630|官话|西南官话|成渝片|B6|重庆城区话
guiyang|贵阳|106.6302|26.6470|官话|西南官话|昆贵片|B6|贵阳话
kunming|昆明|102.8329|24.8801|官话|西南官话|昆贵片|B6|昆明话
wuhan|汉口|114.2700|30.6000|官话|西南官话|武天片|B6|汉口话
guilin|桂林|110.2902|25.2736|官话|西南官话|桂柳片|B6|桂林官话
liuzhou|柳州|109.4281|24.3264|官话|西南官话|桂柳片|B6|柳州官话
nanjing|南京|118.7969|32.0603|官话|江淮官话|洪巢片|B3|南京城区话
yangzhou|扬州|119.4127|32.3942|官话|江淮官话|洪巢片|B3|扬州话
hefei|合肥|117.2272|31.8206|官话|江淮官话|洪巢片|B3|合肥城区话
nantong|南通|120.8943|31.9802|官话|江淮官话|泰如片|B3|南通城区话
taiyuan|太原|112.5489|37.8706|晋语|晋语|并州片|B7|太原话
datong|大同|113.3001|40.0768|晋语|晋语|大包片|B7|大同话
hohhot|呼和浩特|111.7492|40.8426|晋语|晋语|大包片|B7|呼和浩特汉语方言
changzhi|长治|113.1163|36.1954|晋语|晋语|上党片|B7|长治话
shanghai|上海|121.4737|31.2304|吴语|吴语|太湖片|B9|上海市区话
suzhou|苏州|120.5853|31.2989|吴语|吴语|太湖片|B9|苏州话
wuxi|无锡|120.3119|31.4912|吴语|吴语|太湖片|B9|无锡话
changzhou|常州|119.9741|31.8112|吴语|吴语|太湖片|B9|常州话
hangzhou|杭州|120.1551|30.2741|吴语|吴语|太湖片|B9|杭州城区话
jiaxing|嘉兴|120.7555|30.7461|吴语|吴语|太湖片|B9|嘉兴话
shaoxing|绍兴|120.5802|30.0303|吴语|吴语|太湖片|B9|绍兴话
ningbo|宁波|121.5503|29.8746|吴语|吴语|太湖片|B9|宁波话
taizhou-zj|台州|121.4208|28.6564|吴语|吴语|台州片|B9|椒江话
jinhua|金华|119.6474|29.0792|吴语|吴语|婺州片|B9|金华话
lishui|丽水|119.9229|28.4672|吴语|吴语|处衢片|B9|丽水话
wenzhou|温州|120.6994|27.9943|吴语|吴语|瓯江片|B9|温州话
shexian|歙县|118.4153|29.8610|徽语|徽语|绩歙片|B10|歙县徽语
xiuning|休宁|118.1936|29.7845|徽语|徽语|休黟片|B10|休宁话
nanchang|南昌|115.8582|28.6829|赣语|赣语|昌靖片|B11|南昌话
yichun|宜春|114.4168|27.8162|赣语|赣语|宜浏片|B11|宜春话
jian|吉安|114.9929|27.1130|赣语|赣语|吉茶片|B11|吉安话
fuzhou-jx|抚州|116.3582|27.9492|赣语|赣语|抚广片|B11|抚州话
changsha|长沙|112.9388|28.2282|湘语|湘语|长益片|B11|长沙话
xiangtan|湘潭|112.9441|27.8297|湘语|湘语|长益片|B11|湘潭话
loudi|娄底|111.9945|27.6973|湘语|湘语|娄邵片|B11|娄底话
shaoyang|邵阳|111.4679|27.2389|湘语|湘语|娄邵片|B11|邵阳话
guangzhou|广州|113.2644|23.1291|粤语|粤语|广府片|B13|广州话
foshan|佛山|113.1214|23.0215|粤语|粤语|广府片|B13|佛山话
hongkong|香港|114.1694|22.3193|粤语|粤语|广府片|B13|香港粤语
macau|澳门|113.5439|22.1987|粤语|粤语|广府片|B13|澳门粤语
taishan|台山|112.7941|22.2519|粤语|粤语|四邑片|B13|台山话
wuzhou|梧州|111.2791|23.4769|粤语|粤语|粤语|B14|梧州粤语
yulin|玉林|110.1647|22.6364|粤语|粤语|勾漏片|B14|玉林白话
meixian|梅县|116.0820|24.2850|客家话|客家话|粤台片|B15|梅县客家话
heyuan|河源|114.7004|23.7437|客家话|客家话|客家话|B15|河源客家话
changting|长汀|116.3576|25.8335|客家话|客家话|汀州片|B15|长汀客家话
hsinchu|新竹|120.9647|24.8138|客家话|客家话|粤台片|B15|新竹客家话代表点
nanning-pinghua|南宁·平话|108.3669|22.8170|平话|平话|桂南平话|B14|南宁周边桂南平话代表点
fuzhou|福州|119.2965|26.0745|闽语|闽东区|侯官片|B12|福州话
ningde|宁德|119.5479|26.6656|闽语|闽东区|福宁片|B12|宁德话
putian|莆田|119.0077|25.4540|闽语|莆仙区|莆仙区|B12|莆田话
xiamen|厦门|118.0894|24.4798|闽语|闽南区|泉漳片|B12|厦门话
quanzhou|泉州|118.6759|24.8741|闽语|闽南区|泉漳片|B12|泉州话
zhangzhou|漳州|117.6471|24.5130|闽语|闽南区|泉漳片|B12|漳州话
chaozhou|潮州|116.6226|23.6567|闽语|闽南区|潮汕片|B12|潮州话
shantou|汕头|116.6819|23.3541|闽语|闽南区|潮汕片|B12|汕头话
taipei|台北|121.5654|25.0330|闽语|闽南区|泉漳片|B12|台北闽南语代表点
tainan|台南|120.2270|22.9999|闽语|闽南区|泉漳片|B12|台南闽南语代表点
jianou|建瓯|118.3047|27.0227|闽语|闽北区|闽北区|B12|建瓯话
yongan|永安|117.3652|25.9419|闽语|闽中区|闽中区|B12|永安话
shaowu|邵武|117.4925|27.3403|闽语|邵将区|邵将区|B12|邵武话
haikou|海口|110.1983|20.0440|闽语|琼文区|府城片|B12|海口海南话
wenchang|文昌|110.7977|19.5433|闽语|琼文区|文昌片|B12|文昌话
'''
cities=[]
for row in ROWS.strip().splitlines():
    cid,name,lon,lat,family,branch,cluster,source,variety=row.split('|')
    c={'id':cid,'name':name,'coordinates':[float(lon),float(lat)],'family':family,'branch':branch,'cluster':cluster,'source':source,'variety':variety,'note':'代表所列本地方言；不代表全市居民、城区全部语言或个人语言能力。坐标为城市近似定位。','classificationConfidence':'atlas-reading; approximate representative point'}
    if cluster==branch: c['cluster']=None
    gcp=next((g for g in GCPS if g[0]==name),None)
    if gcp: c['sourcePixel']={'source':'A2','x':gcp[1],'y':gcp[2],'width':2000,'height':h}
    if cid=='nanning-pinghua': c['note']='桂南平话分布在南宁周边，本点不代表南宁城区白话；本市还通行粤语、壮语及其他语言。'
    if cid in ['taipei','tainan','hsinchu']: c['note']='只比较所列传统地方语言；台湾各地同时存在闽南语、客家话、原住民族语言和普通话等。'
    cities.append(c)
(OUT/'cities.json').write_text(json.dumps(cities,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'cities.geojson').write_text(json.dumps({'type':'FeatureCollection','features':[{'type':'Feature','properties':{k:v for k,v in c.items() if k!='coordinates'},'geometry':{'type':'Point','coordinates':c['coordinates']}} for c in cities]},ensure_ascii=False,separators=(',',':')),encoding='utf-8')

# Clearly visible red triangle symbols, manually picked on the enlarged Sichuan
# crop (original preview box [990,885,1180,1080], enlargement 6×). These are the
# A2 legend's 客家话居民点, NOT the red stars in mixed Southwestern Mandarin/土话
# hatching and NOT town labels. Names of actual settlements are not asserted.
# Partial transcription, deliberately selected for unambiguous symbol visibility.
SETTLEMENT_CROP_PIXELS=[
 (781,158),(765,197),(820,197),(866,181),(917,149),(954,135),
 (954,176),(949,228),(889,228),(845,237),(814,272),(769,269),
 (794,309),(852,300),(868,348),(819,347),
 (538,245),(503,276),(552,290),(524,322),(577,324),(549,361),
 (503,365),(548,414),(964,529),(1015,542),(973,574),(916,579),
 (953,607),(912,624),(381,340),(336,353),(298,392),(367,394),
 (335,429),(261,430),(407,431),(374,460),(273,485),(340,496),
 (230,540),(271,554),(311,598),(360,615),(554,598),(618,600),
 (574,641),(516,674),(601,682),(488,726),(548,708),(432,725),
 (374,762),(433,770),(544,799),(630,793),(483,817),(539,850),
 (641,834),(495,873),(425,884),(373,879),(331,869),(305,904),
 (639,951),(621,995),
]
settlement_xy=np.array([[990+x/6,885+y/6] for x,y in SETTLEMENT_CROP_PIXELS])
settlement_ll=geo(settlement_xy)
settlement_features=[]
for i,(pixel,coord) in enumerate(zip(settlement_xy,settlement_ll),1):
    settlement_features.append({'type':'Feature','properties':{
        'id':f'hakka-settlement-{i:03d}',
        'name':f'原图客家话居民点 {i:02d}',
        'family':'客家话','markerKind':'客家话居民点','source':'A2',
        'sourcePixel':{'x':round(float(pixel[0]),2),'y':round(float(pixel[1]),2),'width':2000,'height':h},
        'method':'manual transcription of visible red triangle symbol; same polynomial georeferencing as A2 polygons',
        'confidence':'symbol manually verified; approximate geographic location',
        'note':'四川盆地原图红三角符号，未释读具体聚落名；仅表明居民点，不能用作城市代表方言或连续分布面。该层为局部选录，不是全国完整名录。',
    },'geometry':{'type':'Point','coordinates':np.round(coord,5).tolist()}})
(OUT/'settlements.geojson').write_text(json.dumps({'type':'FeatureCollection','metadata':{'source':'A2','scope':'四川盆地清晰红三角符号的局部人工选录','complete':False,'count':len(settlement_features),'symbol':'red triangle: 客家话居民点'},'features':settlement_features},ensure_ascii=False,indent=2),encoding='utf-8')

titles={'A2':'中国汉语方言图','B1':'官话之一：东北地区','B2':'官话之二：北京、天津、河北、山东西部','B3':'官话之三：河南、山东、皖北、苏北','B4':'官话之四：陕西、甘肃、青海、宁夏','B5':'官话之五：新疆','B6':'官话之六：西南地区、湖北西部','B7':'晋语：山西及附近地区','B8':'东南地区的汉语方言','B9':'吴语：浙江、上海、苏南','B10':'安徽南部汉语方言','B11':'江西省与湖南省的汉语方言','B12':'闽语：福建、台湾、粤东、海南','B13':'广东省的汉语方言','B14':'广西壮族自治区汉语方言','B15':'客家话'}
manifest=[]
for ident,title in titles.items():
    src=ROOT/'reference'/f'{ident}.JPG'
    aw,ah=Image.open(src).size
    manifest.append({'id':ident,'title':title,'available':False,'expectedFilename':f'{ident}.JPG','width':aw,'height':ah})
(ATLAS/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
metadata={'version':'0.1','source':'User-supplied 东方语言学《中国语言地图集》.zip / A2.JPG and B1–B15','date':'2026-11-15','sourceSha256':hashlib.sha256((ROOT/'reference/A2.JPG').read_bytes()).hexdigest(),'sourceDimensions':[3073,2292],'workingDimensions':[2000,h],'registration':{'method':'global second-order polynomial; manually identified city-centre control points','gcpCount':len(GCPS),'trainingRMSEkm':round(float(np.sqrt(np.mean(fit_errors**2))),2),'leaveOneOutRMSEkm':round(float(np.sqrt(np.mean(np.array(loo)**2))),2),'leaveOneOutMedianKm':round(float(np.median(loo)),2),'leaveOneOutMaxKm':round(max(loo),2),'coefficientOrder':['1','x/1000','y/1000','(x/1000)^2','xy/1000000','(y/1000)^2'],'coefficients':coef.tolist(),'gcps':[{'name':g[0],'pixel':[g[1],g[2]],'coordinates':[g[3],g[4]],'leaveOneOutErrorKm':round(e,2)} for g,e in zip(GCPS,loo)]},'segmentation':{'method':'RGB→CIELAB nearest sampled print colour, broad spatial rejection masks, threshold 38 in OpenCV LAB units, 5px close/3px open, contour simplification 1.3px','families':counts,'minimumContourAreaPixels':50,'quality':'exploratory automatic extraction; not fully manually corrected'},'cityCount':len(cities),'scope':'Main broad Han Chinese dialect colour areas; historical atlas classifications; representative spoken-variety points. Minority languages not scored. Blank areas are unknown, not zero.','limitations':['Colour classification may confuse mixed-language hatching, labels, folds and faint printing.','White enclaves and small islands may be lost; minimum component area 50 working pixels.','GCP coordinates anchor modern city centres, not the original survey sites; registration is approximate.','LOOCV error measures georeferencing only, not dialect-boundary accuracy or classification accuracy.','A broad dialect colour never implies every inhabitant speaks it.','No empirical mutual intelligibility percentage is present in these files.','The same cluster is a linguistic grouping, not a guarantee of understanding.']}
metadata['settlements']={'count':len(settlement_features),'source':'A2','method':'manually verified red triangle symbols, pixel positions georeferenced with same polynomial','scope':'partial Sichuan Basin transcription; not exhaustive','complete':False,'names':'Anonymous source symbol IDs; no village names inferred','file':'settlements.geojson'}
(OUT/'metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'cities':len(cities),'polygons':counts,'registration':{k:v for k,v in metadata['registration'].items() if k not in ['gcps','coefficients','coefficientOrder']}},ensure_ascii=False,indent=2))

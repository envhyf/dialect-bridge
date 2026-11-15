"""Repair A2 segmentation and evaluate a projection-aware registration.

Usage: python scripts/refine-overview.py --source /private/path/A2.JPG
Only derived geometry/diagnostics are published. The source remains local.
The fitted LCC is a registration candidate, NOT an assertion of the atlas CRS.
"""
from pathlib import Path
import argparse, json, hashlib
import numpy as np
import cv2
from PIL import Image
from scipy.optimize import least_squares
from pyproj import Transformer
from shapely.geometry import Polygon, mapping
from shapely import make_valid

ROOT=Path(__file__).resolve().parents[1]

def close_print_gaps(mask):
    # Do not re-apply the ink/paper rejection mask AFTER closing: that was the
    # previous bug, re-cutting repaired letters and narrow river interruptions.
    return cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))

def fit_projection(xy,ll):
    def transformer(p):
        return Transformer.from_crs('EPSG:4326',f'+proj=lcc +lat_1={p[0]} +lat_2={p[1]} +lat_0=0 +lon_0=105 +datum=WGS84 +units=m',always_xy=True)
    def residual(p):
        t=transformer(p);m=np.column_stack(t.transform(ll[:,0],ll[:,1]))/1e6
        a=np.c_[m,np.ones(len(m))];c=np.linalg.lstsq(a,xy,rcond=None)[0]
        return (a@c-xy).ravel()
    p=least_squares(residual,[25,47],bounds=([5,30],[39,65])).x
    t=transformer(p);m=np.column_stack(t.transform(ll[:,0],ll[:,1]))/1e6
    c=np.linalg.lstsq(np.c_[m,np.ones(len(m))],xy,rcond=None)[0]
    return t,c,p

def transform_pixels(xy,t,c):
    m=(np.asarray(xy)-c[2])@np.linalg.inv(c[:2])*1e6
    return np.column_stack(t.transform(m[:,0],m[:,1],direction='INVERSE'))

def errors(a,b):
    return np.linalg.norm((a-b)*np.c_[111.32*np.cos(np.deg2rad(b[:,1])),np.ones(len(b))*111.32],axis=1)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);args=ap.parse_args()
    source=Path(args.source);out=ROOT/'dist/data';qa=ROOT/'qa';qa.mkdir(exist_ok=True)
    meta=json.loads((out/'metadata.json').read_text('utf8'))
    gcps=meta['registration']['gcps'];xy=np.array([g['pixel'] for g in gcps]);ll=np.array([g['coordinates'] for g in gcps])
    t,c,params=fit_projection(xy,ll);fiterr=errors(transform_pixels(xy,t,c),ll);loo=[]
    for i in range(len(xy)):
        keep=np.arange(len(xy))!=i;ti,ci,_=fit_projection(xy[keep],ll[keep])
        loo.append(float(errors(transform_pixels(xy[i:i+1],ti,ci),ll[i:i+1])[0]))
    def geo(p):return transform_pixels(p,t,c)
    im=np.array(Image.open(source).convert('RGB'));h,w=im.shape[:2]
    im=cv2.resize(im,(2000,round(h*2000/w)),interpolation=cv2.INTER_AREA);h,w=im.shape[:2]
    lab=cv2.cvtColor(im,cv2.COLOR_RGB2LAB).astype(float);hsv=cv2.cvtColor(im,cv2.COLOR_RGB2HSV)
    classes=[('官话',(189,235,173),(40,60,1960,1380)),('晋语',(250,192,119),(1060,500,1425,820)),('赣语',(125,194,173),(1280,900,1520,1210)),('徽语',(176,212,62),(1440,910,1540,1030)),('吴语',(241,199,219),(1450,860,1660,1110)),('湘语',(239,125,89),(1180,1000,1385,1245)),('客家话',(243,143,145),(1090,1030,1650,1350)),('粤语',(108,142,91),(1110,1140,1460,1370)),('平话',(255,201,90),(1100,1170,1250,1320)),('闽语',(244,233,56),(1190,1020,1700,1450))]
    extent=np.zeros((h,w),np.uint8);extent[60:1450,40:1960]=1;extent[60:409,789:1290]=0;extent[1105:,:757]=0;extent[1180:,1730:]=0
    valid=extent.copy();valid[(hsv[:,:,1]<38)|(hsv[:,:,2]<95)|((hsv[:,:,0]>85)&(hsv[:,:,0]<120))]=0
    distances=[]
    for name,rgb,bounds in classes:
        color=cv2.cvtColor(np.array([[rgb]],np.uint8),cv2.COLOR_RGB2LAB)[0,0].astype(float)
        d=np.linalg.norm(lab-color,axis=2);x1,y1,x2,y2=bounds
        allowed=np.zeros((h,w),bool);allowed[y1:y2,x1:x2]=True;d[~allowed]=1000;distances.append(d)
    ds=np.stack(distances);labels=ds.argmin(axis=0);best=ds.min(axis=0)
    features=[];preview=np.full_like(im,250);counts={};holes=0
    for i,(name,rgb,bounds) in enumerate(classes):
        mask=close_print_gaps(((labels==i)&(best<38)&(valid>0)).astype(np.uint8)*255)
        # Keep other confidently classified colours; morphological bridging may
        # not paint over a neighbouring dialect. Crop frames/legends stay excluded.
        mask[(extent==0)|((labels!=i)&(best<25)&(valid>0))]=0
        contours,hierarchy=cv2.findContours(mask,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
        polys=[]
        if hierarchy is None:continue
        hierarchy=hierarchy[0]
        for j,contour in enumerate(contours):
            if hierarchy[j][3]!=-1 or cv2.contourArea(contour)<50:continue
            outer=cv2.approxPolyDP(contour,.6,True).reshape(-1,2)
            if len(outer)<3:continue
            inner=[];child=hierarchy[j][2]
            while child!=-1:
                if cv2.contourArea(contours[child])>100:
                    ring=cv2.approxPolyDP(contours[child],.6,True).reshape(-1,2)
                    if len(ring)>2:inner.append(geo(ring));holes+=1
                child=hierarchy[child][0]
            poly=make_valid(Polygon(geo(outer),inner))
            def collect(g):
                if g.geom_type=='Polygon' and not g.is_empty:polys.append(mapping(g)['coordinates'])
                elif hasattr(g,'geoms'):
                    for part in g.geoms:collect(part)
            collect(poly)
            cv2.drawContours(preview,[outer.astype(np.int32)],0,rgb,-1)
        counts[name]=len(polys)
        features.append({'type':'Feature','properties':{'id':'family-'+str(i),'name':name,'family':name,'level':'大区','source':'A2','method':'source colour segmentation with print-gap closing; affine fitted LCC registration','reviewStatus':'approximate-automatic','uncertainty':'Overview only; no inferred subdivision. Uncoloured enclaves retained where resolved.','polygonCount':len(polys)},'geometry':{'type':'MultiPolygon','coordinates':polys}})
    (out/'dialects.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':')),encoding='utf8')
    Image.fromarray(preview).save(qa/'overview-segmentation.png')
    for g,e in zip(gcps,loo):g['leaveOneOutErrorKm']=round(e,2)
    meta['version']='0.3';meta['registration']={'method':'affine in fitted Lambert conformal conic space; candidate registration, original CRS unknown','gcpCount':len(gcps),'trainingRMSEkm':round(float(np.sqrt(np.mean(fiterr**2))),2),'leaveOneOutRMSEkm':round(float(np.sqrt(np.mean(np.array(loo)**2))),2),'leaveOneOutMedianKm':round(float(np.median(loo)),2),'leaveOneOutMaxKm':round(max(loo),2),'projection':t.target_crs.to_proj4(),'affineProjectedMillionMetresToPixels':c.tolist(),'gcps':gcps,'previousPolynomialLOOCVRMSEkm':21.94}
    meta['segmentation'].update({'method':'Nearest sampled LAB colour; 5px close without re-cutting print/river pixels; retain resolved holes >100px; simplify .6px; make_valid geometry','families':counts,'interiorRings':holes,'quality':'Overview fallback; fine sheet traces take priority. Not a precise modern boundary survey.'})
    meta['sourceSha256']=hashlib.sha256(source.read_bytes()).hexdigest()
    meta['settlements']['method']='manually verified red triangle symbols; same fitted LCC registration as A2 overview'
    (out/'metadata.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf8')
    settlements=json.loads((out/'settlements.geojson').read_text('utf8'))
    for f in settlements['features']:
        p=f['properties']['sourcePixel'];f['geometry']['coordinates']=np.round(geo([[p['x'],p['y']]])[0],5).tolist()
        f['properties']['method']='manual source triangle; same fitted LCC registration as A2 overview'
    (out/'settlements.geojson').write_text(json.dumps(settlements,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'registration':meta['registration']['leaveOneOutRMSEkm'],'parts':counts,'retainedHoles':holes}))

if __name__=='__main__':main()

"""B11 Xiang source-colour outlines and manually reread internal texture lines.

Work in the atlas's 1800 x 1336 reference pixel frame, never administrative space.
The source scan remains private. Internal cuts follow printed dashed boundaries.
"""
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from shapely.geometry import Polygon, LineString, Point, mapping
from shapely.ops import unary_union, split
from shapely import make_valid

ROOT=Path(__file__).resolve().parents[1]
def crop_line(text,x,y,scale):
    return [(x+float(p.split(',')[0])/scale,y+float(p.split(',')[1])/scale) for p in text.split()]

def parts(g):
    if g.geom_type=='Polygon': return [g]
    return [p for child in getattr(g,'geoms',[]) for p in parts(child)]

def refined_shapes():
    image=Image.open(ROOT.parent/'dialect-atlas/reference/B11.JPG').convert('RGB').resize((1800,1336))
    h,s,v=cv2.split(cv2.cvtColor(np.array(image),cv2.COLOR_RGB2HSV))
    mask=((h>=19)&(h<=37)&(s>95)&(v>190)).astype('uint8')*255
    mask[:370]=0;mask[1170:]=0;mask[:,:100]=0;mask[:,800:]=0
    mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((7,7),np.uint8))
    contours,hierarchy=cv2.findContours(mask,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
    shapes=[]
    for i,c in enumerate(contours):
        if hierarchy[0,i,3]>=0 or cv2.contourArea(c)<200:continue
        outer=cv2.approxPolyDP(c,.8,True).reshape(-1,2)
        holes=[];child=hierarchy[0,i,2]
        while child>=0:
            if cv2.contourArea(contours[child])>=120:holes.append(cv2.approxPolyDP(contours[child],.8,True).reshape(-1,2))
            child=hierarchy[0,child,0]
        shapes+=parts(make_valid(Polygon(outer,holes)))
    cuts=[
      # Long shared Changyi/Loushao dashed interface, NOT Zishui river.
      crop_line('360,-30 330,82 312,107 298,126 280,154 266,181 247,211 231,241 225,252 239,260 251,251 261,258 259,276 272,286 284,295 273,303 265,309 266,316 291,321 310,322 326,326 337,320 345,323 347,336 354,340 372,333 389,321 402,323 424,337 447,358 465,376 480,383 498,379 522,366 546,354 566,352 586,358 602,353 608,341 605,326 612,315 624,310 640,317 647,327 647,337 635,351 626,368 626,379 637,389 653,395 668,409 674,432 680,454 681,474 674,487 675,507 675,519 659,520 640,512 629,517 616,530 612,543 620,554 635,565 641,577 631,594 626,610 613,621 600,620 582,611 571,612 560,625 544,644 534,654 523,647 511,638 501,634 497,647 501,660 487,672 474,684 465,685 457,673 451,651 442,632 431,617 414,603 391,590 377,581 370,568 367,557 353,550 342,546 343,526 342,512 335,503 318,511 304,513 295,502 291,491 279,485 265,497 254,510 241,507 230,516 222,528 201,533 194,529 185,544 178,563 165,585 151,606 141,622 145,633 163,638 182,645 201,651 216,654 232,644 250,637 267,639 281,646 285,657 279,670 265,679 261,692 267,703 288,714 309,723 319,737 322,745 334,750 348,745 366,747 383,752 396,766 403,788 408,797 419,787 430,793 444,811 460,821 482,827 499,838 516,842 537,847 545,852 542,872 536,893 533,908 538,923 553,938 574,952 640,1060',360,530,2.5),
      # Jixu/Loushao east interface, ending in the Ganyu colour footprint.
      crop_line('620,75 598,119 580,132 566,146 551,165 566,188 573,212 575,239 575,254 585,263 600,265 605,277 597,292 604,303 616,309 625,300 636,281 648,272 659,276 669,291 664,309 651,330 636,347 617,363 597,374 578,378 567,393 566,412 576,426 589,438 606,450 630,480',130,540,2.5),
      # Jixu/Changyi boundary above Hongjiang.
      crop_line('480,500 459,535 445,550 433,563 425,576 440,580 454,584 463,596 466,609 485,635',130,540,2.5),
      # The western Loushao strip below the Jixu dotted area.
      crop_line('130,270 165,278 186,288 207,297 231,301 257,301 281,304 292,311 300,329 281,341 257,343 242,351 232,360 230,378 220,399',130,540,2.5),
    ]
    # Two boundary segments terminate on the same genuine Gan enclave.
    # Join them through that non-Xiang hole before splitting the yellow surface.
    cuts=[cuts[0],[(430,550)]+cuts[1]+list(reversed(cuts[2]))+[(300,740)],cuts[3],
          [(290,870),(280,884),(278,901),(269,913),(254,924),(245,934),(237,948),(220,962)]]
    for cut in cuts:
        shapes=[p for g in shapes for p in parts(split(g,LineString(cut)))]
    return image, [g for g in shapes if g.area>150]

def update_regions(regions):
    """Assign only components whose printed texture was independently checked."""
    _,shapes=refined_shapes()
    seeds={'xiang-changyi':[(600,450),(676.5,407.5),(680,660),(204,845)],
           'xiang-loushao':[(442,850),(182,693)],'xiang-jixu':[(240,632)]}
    assigned={key:[] for key in seeds}
    for g in shapes:
        labels=[key for key,points in seeds.items() if any(g.contains(Point(p)) for p in points)]
        assert len(labels)==1,('Unreviewed B11 component',g.area,g.bounds,labels)
        assigned[labels[0]].append(g)
    # The Gan Dongsui enclave uses exactly the same source-pixel ring on both
    # sides, preserving the real enclave without independent tracing slivers.
    footprint=unary_union(shapes)
    holes=[Polygon(h) for p in parts(footprint) for h in p.interiors]
    dongsui=[g for g in holes if g.contains(Point(320,830))]
    assert len(dongsui)==1 and 10000<dongsui[0].area<16000
    assigned['gan-dongsui']=dongsui
    for r in regions:
        if r['id'] not in assigned:continue
        gs=sorted(assigned[r['id']],key=lambda g:-g.area)
        r['refinedSourceParts']=[{'outer':list(g.exterior.coords),'holes':[list(h.coords) for h in g.interiors]} for g in gs]
        r['points']=list(gs[0].exterior.coords)[:-1]
        r['holes']=[list(h.coords)[:-1] for h in gs[0].interiors]
        r['extraParts']=[list(g.exterior.coords)[:-1] for g in gs[1:]]
        r['evidenceNote']='2026-11-18 复核 B11 原图填色与片界纹理：外缘按黄色色面提取，长益/娄邵/吉溆共用逐段重描的虚线片界；河道不作片界。洞绥片与湘语使用同一内嵌边线。7像素闭运算修复印刷文字/细河线，保留面积≥120工作像素的真实内孔；0.8工作像素轮廓概化。没有按行政边界裁切。'
    return assigned

if __name__=='__main__':
    import importlib.util,json
    spec=importlib.util.spec_from_file_location('wg',ROOT/'scripts/regions_wu_gan.py');wg=importlib.util.module_from_spec(spec);spec.loader.exec_module(wg)
    assigned=update_regions(wg.REGIONS)
    image,_=refined_shapes()
    from PIL import ImageDraw
    d=ImageDraw.Draw(image)
    fs=[]
    for i,(label,g) in enumerate((label,g) for label,gs in assigned.items() for g in gs):
        p=g.representative_point(); print(i,round(g.area),list(p.coords)[0],label)
        d.line(list(g.exterior.coords),fill={'xiang-loushao':'red','xiang-changyi':'blue','xiang-jixu':'purple','gan-dongsui':'green'}[label],width=2);d.text((p.x,p.y),str(i),fill='black',stroke_width=1,stroke_fill='white')
        fs.append({'type':'Feature','properties':{'id':label,'component':i},'geometry':mapping(g)})
    image.crop((70,390,780,1170)).resize((1065,1170)).save(ROOT/'qa/b11-refined-check.jpg')
    (ROOT/'qa/xiang-pixel.json').write_text(json.dumps(fs))

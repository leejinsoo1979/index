"""Build web-sized derivatives from each supplied site; originals are never modified."""
import json,re,hashlib,shutil,sys
from pathlib import Path
from PIL import Image, ImageOps
ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else Path.home()/'Documents/인테리어쇼_포트폴리오'
DEST=Path('public/portfolios/interior-show');DEST.mkdir(parents=True,exist_ok=True)
PROJECTS=[
 ('대장동 62PY','daejang-62',[48,13,24,38,28,46,64,52,58,4,41,44,67,56,10,14]),
 ('대치 45PY','daechi-45',[18,1,10,22,34,30,16,28,46,41,42,53,49,20,37,8]),
 ('서래마을  70PY','seorae-70',[10,2,4,6,8,11,12,14,15,17,18,19,20,21]),
 ('서초 53PY','seocho-53',[28,8,10,16,24,31,33,37,41,44,47,48,50,51,22,34]),
 ('성북 52PY','seongbuk-52',[36,1,13,21,32,34,37,41,44,50,53,56,59,60,62,9]),
 ('용인 68PY','yongin-68',[34,1,10,18,20,24,28,30,33,35,40,42,45,47,3,49]),
 ('이촌 32PY','ichon-32',[23,1,8,11,17,21,27,30,31,32,36,38,41,44,49,50]),
 ('잠실 50PY','jamsil-50',[17,1,8,14,19,22,24,27,30,37,38,40,53,56,57,59]),
 ('청담 57PY','cheongdam-57',[38,1,13,16,26,28,33,34,37,43,47,51,53,57,62,63]),
 ('프린테크 사옥','printech-office',[1,3,5,8,10,13,18,22,24,26,30,32,34,38,41,47]),
 ('하남 35PY','hanam-35',[40,1,7,11,12,19,23,28,33,35,41,49,50,55,56,58]),
 ('하남 45PY','hanam-45',[1]),
 ('한남 33PY','hannam-33',[27,1,8,11,13,16,20,25,30,32,36,38,39,40,42]),
]
manifest=[]
for folder,slug,selection in PROJECTS:
 source=ROOT/folder;target=DEST/slug;target.mkdir(exist_ok=True)
 md=(source/'현장정보.md').read_text();url=re.search(r'^source: "(.*?)"',md,re.M).group(1)
 photos=[];seen=set()
 for number in selection:
  f=source/f'{number:02d}.jpg';digest=hashlib.sha256(f.read_bytes()).hexdigest()
  if digest in seen: continue
  seen.add(digest)
  with Image.open(f) as raw:
   image=ImageOps.exif_transpose(raw).convert('RGB');original=list(image.size);image.thumbnail((2400,2400),Image.Resampling.LANCZOS)
   dest=target/f.name;image.save(dest,'JPEG',quality=86,optimize=True,progressive=True,**({'icc_profile':raw.info['icc_profile']} if raw.info.get('icc_profile') else {}))
   photos.append({'file':f.name,'src':f'/portfolios/interior-show/{slug}/{f.name}','width':image.width,'height':image.height,'sourceSize':original,'sourceSha256':digest,'bytes':dest.stat().st_size})
 project={'slug':slug,'name':re.sub(r' +',' ',folder),'folder':folder,'source':url,'availablePhotos':len(list(source.glob('*.jpg'))),'photos':photos}
 manifest.append(project);print(slug,len(photos),round(sum(x['bytes'] for x in photos)/1e6,2),'MB')
brand=DEST/'brand';brand.mkdir(exist_ok=True)
for name in ('primary','reverse'):shutil.copyfile(ROOT/'로고'/f'INSHOW_logo_{name}.svg',brand/f'{name}.svg')
(DEST/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
(DEST/'README.txt').write_text('User-supplied INSHOW site portfolio photographs and logos. Each project folder remains a separate book.\nWeb derivatives: EXIF orientation applied, longest side <=2400 px, JPEG quality 86. Original files unchanged.\nNo generated photographs. Captions describe visible photographs; unverified scraped material specifications are not asserted.\n')
print('TOTAL',len(manifest),'sites',sum(len(p['photos']) for p in manifest),'selected photos')

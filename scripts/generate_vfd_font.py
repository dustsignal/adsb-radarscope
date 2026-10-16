# ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
# Original 5x7 dot-matrix glyphs. GPL-3.0-or-later, like the parent project.
# Run with Python + fontTools to regenerate the bundled offline face.
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

rows = {
'A':'0e 11 11 1f 11 11 11','B':'1e 11 11 1e 11 11 1e','C':'0f 10 10 10 10 10 0f',
'D':'1e 11 11 11 11 11 1e','E':'1f 10 10 1e 10 10 1f','F':'1f 10 10 1e 10 10 10',
'G':'0e 11 10 17 11 11 0e','H':'11 11 11 1f 11 11 11','I':'1f 04 04 04 04 04 1f',
'J':'07 02 02 02 12 12 0c','K':'11 12 14 18 14 12 11','L':'10 10 10 10 10 10 1f',
'M':'11 1b 15 15 11 11 11','N':'11 19 15 13 11 11 11','O':'0e 11 11 11 11 11 0e',
'P':'1e 11 11 1e 10 10 10','Q':'0e 11 11 11 15 12 0d','R':'1e 11 11 1e 14 12 11',
'S':'0f 10 10 0e 01 01 1e','T':'1f 04 04 04 04 04 04','U':'11 11 11 11 11 11 0e',
'V':'11 11 11 11 11 0a 04','W':'11 11 11 15 15 15 0a','X':'11 11 0a 04 0a 11 11',
'Y':'11 11 0a 04 04 04 04','Z':'1f 01 02 04 08 10 1f',
'0':'0e 11 13 15 19 11 0e','1':'04 0c 04 04 04 04 0e','2':'0e 11 01 02 04 08 1f',
'3':'1e 01 01 0e 01 01 1e','4':'02 06 0a 12 1f 02 02','5':'1f 10 10 1e 01 01 1e',
'6':'0e 10 10 1e 11 11 0e','7':'1f 01 02 04 08 08 08','8':'0e 11 11 0e 11 11 0e','9':'0e 11 11 0f 01 01 0e',
' ':'00 00 00 00 00 00 00',':':'00 04 04 00 04 04 00','.':'00 00 00 00 00 04 04',
'-':'00 00 00 1f 00 00 00','/':'01 01 02 04 08 10 10','+':'00 04 04 1f 04 04 00',
'?':'0e 11 01 02 04 00 04','(':'02 04 08 08 08 04 02',')':'08 04 02 02 02 04 08',
'°':'0c 12 12 0c 00 00 00','•':'00 00 0e 0e 0e 00 00','_':'00 00 00 00 00 00 1f',
}
font=FontBuilder(1000,isTTF=True)
font.setupGlyphOrder(['.notdef']+[f'u{ord(c):04X}' for c in rows])
cmap={ord(c):f'u{ord(c):04X}' for c in rows}
for c in 'abcdefghijklmnopqrstuvwxyz': cmap[ord(c)]=cmap[ord(c.upper())]
font.setupCharacterMap(cmap)
glyphs={}; metrics={}
for name,encoded in [('.notdef',rows['?'])]+[(f'u{ord(c):04X}',r) for c,r in rows.items()]:
    pen=TTGlyphPen(None)
    for y,row in enumerate(encoded.split()):
        for x,lit in enumerate(f'{int(row,16):05b}'):
            if lit=='1':
                left=50+x*100; bottom=100+(6-y)*100
                pen.moveTo((left,bottom)); pen.lineTo((left,bottom+78)); pen.lineTo((left+78,bottom+78)); pen.lineTo((left+78,bottom)); pen.closePath()
    glyphs[name]=pen.glyph(); metrics[name]=(600,50)
font.setupGlyf(glyphs); font.setupHorizontalMetrics(metrics); font.setupHorizontalHeader(ascent=850,descent=-150)
font.setupNameTable({'familyName':'Radar VFD','styleName':'Regular','uniqueFontIdentifier':'RadarVFD-1.0','fullName':'Radar VFD Regular','psName':'RadarVFD-Regular','version':'Version 1.0','copyright':'Original glyphs for ADSB Radarscope. GPL-3.0-or-later.'})
font.setupOS2(sTypoAscender=850,sTypoDescender=-150,usWinAscent=850,usWinDescent=150); font.setupPost(); font.setupMaxp()
font.font.flavor='woff'
font.save(str(Path(__file__).resolve().parents[1]/'src/assets/radar-vfd.woff'))

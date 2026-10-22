"""Gera public/index.html (bibliotecas locais) e public/GPlanSiS-Sheets-offline.html (tudo embutido).
Uso: python3 src/build.py   (a partir da raiz do pacote)"""
import os
R=os.path.dirname(os.path.abspath(__file__));ROOT=os.path.dirname(R);P=os.path.join(ROOT,'public')
rd=lambda f:open(os.path.join(R,f),encoding='utf-8').read()
MODS=['a_util.js','b_formula.js','c_model.js','d_grid.js','e_interact.js','f_icons.js','g_ui.js','h_dialogs.js','i_app.js','j_bi_engine.js','k_bi_vis.js','l_bi_ui.js','m_ai.js','n_demo.js','p_server.js','q_cfg.js','r_bi_adv.js','s_docs.js','t_pwa.js','o_boot.js']
css=rd('0_head.html').replace('<title>GPlanSiS|Sheets</title>','<title>GPlanSiS|Sheets</title>\n<link rel="icon" href="favicon.svg" type="image/svg+xml">')+rd('1_bi.css')+rd('1b_srv.css');body=rd('2_body.html')
js=("'use strict';\n"+"\n".join(rd(f).replace("'use strict';","") for f in MODS)).replace('</script','<\\/script')
V=lambda f:open(os.path.join(P,'vendor',f),encoding='utf-8').read().replace('</script','<\\/script')
idx=css+body+'<script src="vendor/echarts-5.5.1.min.js"></script>\n<script src="vendor/xlsx-0.20.3.full.min.js"></script>\n<script>\n'+js+'\n</script>\n</body>\n</html>\n'
off=css+body+'<script>\n'+V('echarts-5.5.1.min.js')+'\n</script>\n<script>\n'+V('xlsx-0.20.3.full.min.js')+'\n</script>\n<script>\n'+js+'\n</script>\n</body>\n</html>\n'
import re,hashlib
off=re.sub(r'<!--pwa-->.*?<!--/pwa-->\n?','',off,flags=re.S)  # o arquivo offline abre como file:, sem manifesto
idx=idx.replace('<!--pwa-->','').replace('<!--/pwa-->','')
open(os.path.join(P,'index.html'),'w',encoding='utf-8').write(idx);open(os.path.join(P,'GPlanSiS-Sheets-offline.html'),'w',encoding='utf-8').write(off)
# service worker: VERSION do servidor + resumo do shell, para trocar o cache a cada publicação
ver=re.search(r'^VERSION = "([^"]+)"',open(os.path.join(ROOT,'server','app.py'),encoding='utf-8').read(),re.M).group(1)
h=hashlib.sha256(idx.encode()+b''.join(open(os.path.join(P,f),'rb').read() for f in ('manifest.webmanifest','favicon.svg'))).hexdigest()[:10]
open(os.path.join(P,'sw.js'),'w',encoding='utf-8').write(rd('sw.js').replace('__VERSION__',ver+'-'+h))
print('index.html',len(idx),'bytes · offline',len(off),'bytes · sw',ver+'-'+h)

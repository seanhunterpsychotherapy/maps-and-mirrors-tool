"""Build a disposable browser fixture; never change the production HTML.

Usage: python tests/build-browser-fixture.py OUTPUT_DIRECTORY
Serve the repository's parent directory and open OUTPUT_DIRECTORY/harness.html.
The output directory must be a sibling of the repository.
"""
from pathlib import Path
import re,sys
repo=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1]).resolve();out.mkdir(parents=True,exist_ok=True)
source=(repo/'index.html').read_text(encoding='utf-8')
source=re.sub(r'<script data-goatcounter=.*?</script>','',source,flags=re.S)
seed='''<script>
window.qaErrors=[];window.qaEvents=[];
addEventListener('error',e=>qaErrors.push(e.message || ('resource: '+(e.target.src||e.target.href||''))),true);
addEventListener('unhandledrejection',e=>qaErrors.push(String(e.reason)));
if(!sessionStorage.getItem('qa_keep_history'))sessionStorage.removeItem('mm_route_history_v1');
sessionStorage.removeItem('mm_st_paths_chips');
sessionStorage.setItem('mm_last',new URLSearchParams(location.search).get('last')||'body');
sessionStorage.setItem('qa_unrelated','KEEP_SESSION');
localStorage.setItem('qa_unrelated','KEEP_LOCAL');
window.qaBottle=JSON.stringify([{ts:'2000-01-01T00:00:00.000Z',letter:'SYNTHETIC_PRIVATE_SENTINEL',shift:'',helped:'',remember:'',inReplyTo:null}]);
localStorage.setItem('mm_bottles',qaBottle);
window.qaToolbox=JSON.stringify([{p:'body',c:'card-body-temperature-shift',t:'Temperature Shift'}]);
localStorage.setItem('mm_toolbox',qaToolbox);
localStorage.setItem('mm_logs',JSON.stringify([{pageId:'body',result:null,timestamp:'2000-01-01T00:00:00.000Z'}]));
window.qaInitialHistoryLength=history.length;
window.goatcounter={count:e=>qaEvents.push(e),no_onload:true};
if(new URLSearchParams(location.search).has('blocked')){
 Storage.prototype.getItem=function(){throw new Error('Synthetic storage unavailable')};
 Storage.prototype.setItem=function(){throw new Error('Synthetic storage unavailable')};
 Storage.prototype.removeItem=function(){throw new Error('Synthetic storage unavailable')};
}
</script>'''
source=source.replace('<head>','<head><base href="/'+repo.name+'/">',1)
source=source.replace('<script src="routes.js">',seed+'<script src="routes.js">',1)
(out/'frame.html').write_text(source,encoding='utf-8')
(out/'harness.html').write_text('''<!doctype html><meta charset="utf-8"><title>Deep-link browser QA</title>
<style>body{font:15px system-ui}iframe{width:100%;height:650px;border:1px solid #bbb}pre{white-space:pre-wrap}</style>
<h1>Deep-link browser QA</h1><button id="run">Run contract and history tests</button>
<button id="mobile">Run 390px route tests</button><pre id="results">Ready</pre><div id="frame"></div>
<script src="/'''+repo.name+'''/routes.js"></script><script src="/'''+repo.name+'''/tests/browser-tests.js"></script>''',encoding='utf-8')
print(out/'harness.html')

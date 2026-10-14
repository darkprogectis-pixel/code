#!/usr/bin/env bash
# Observacao SOMENTE GET da janela autorizada :3611 (patch snapshot). Uma linha a cada 20 s; para no CLOSE ou no fim.
# Uso: bash watch-homolog-fix.sh <minutos> <arquivo-saida>
MIN="${1:-30}"; OUT="${2:-/dev/stdout}"; END=$(( $(date +%s) + MIN * 60 ))
line() { node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const s=JSON.parse(d);const p=s.position||{};
console.log(new Date().toISOString(),JSON.stringify({side:s.side,gc:p.gc&&[p.gc.entry,p.gc.stop,p.gc.pnlUsd],si:p.si&&[p.si.entry,p.si.stop,p.si.pnlUsd],
marks:s.marks,pnl:s.pnl,snap:s.snapshot&&[s.snapshot.source,s.snapshot.ageMs,s.snapshot.stale],anchor:s.anchor,hist:(s.history||[]).length}))}catch(e){console.log(new Date().toISOString(),"ERR",d.slice(0,200))}})'; }
while [ "$(date +%s)" -lt "$END" ]; do
  R="$(curl -s -m 8 http://127.0.0.1:3611/gcsi/sim)"; echo "$R" | line >>"$OUT"
  echo "$R" | grep -q '"side":"FLAT"' && echo "$R" | grep -q '"history":\[{' && { echo "CLOSE detectado" >>"$OUT"; break; }
  sleep 20
done
{ echo "== fim $(date -u +%FT%TZ)"; echo "== :3611 /gcsi/events"; curl -s -m 8 http://127.0.0.1:3611/gcsi/events | cut -c1-1500; echo
  echo "== :3611 /gcsi/history"; curl -s -m 8 http://127.0.0.1:3611/gcsi/history | cut -c1-1500; echo
  echo "== :3611 /sim/events (ES/NQ)"; curl -s -m 8 http://127.0.0.1:3611/sim/events | cut -c1-300; echo
  echo "== :3600 /gcsi/sim (producao)"; curl -s -m 8 http://127.0.0.1:3600/gcsi/sim; echo; } >>"$OUT"

#!/usr/bin/env bash
# GC/SI = ES/NQ — deploy controlado do BFF (aot-bff.js + aot-gcsi-sim.js novo) e reinicio do :3600. Rodar pelo OPERADOR
# (o classificador do Auto Mode nega deploy de producao ao agente). Mesmo metodo do gcsi/apply/apply-bff.sh.
# Uso: bash apply-bff-eqv.sh           -> conferencias + pre-checagem (nada muda)
#      bash apply-bff-eqv.sh --apply   -> backup + copia + reinicio + validacao (rollback automatico em falha)
#      bash apply-bff-eqv.sh --rollback-> restaura o aot-bff.js anterior, remove aot-gcsi-sim.js, reinicia
# A simulacao GC/SI so roda com AOT_GCSI_SIM=on no ambiente do BFF (padrao off). Nunca toca /sim/events nem ordens.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
AOT="${AOT_DIR:-C:/Users/ADM/.claude/aot}"
CAND="$HERE/../candidate"
BACKUP="$AOT/_backups/gcsi-eqv-20261014"
PRE=5df4ae5cf77ec1f55524c90cf00f28a6e7d144fe625dc35f1d3c7661682ba1ee
NEW=65a7645965d186ab6b84f5145b03eea07521375ff5161ec3f9bdbcbbfbf592ae
SIMNEW=42d0c8fd590db22d97a3c318f44cd33be2325a8fb66e0d42d49d1c57c0c513d4
PRECHECK="$HERE/../../gcsi/apply/precheck-gcsi.cjs"
h() { sha256sum "$1" | cut -c1-64; }
pid3600() { netstat -ano | grep -E ':3600\s' | grep LISTEN | awk '{print $5}' | head -1; }
restart() { local P; P="$(pid3600)"; [ -n "$P" ] && taskkill //PID "$P" //F >/dev/null; for _ in $(seq 1 75); do sleep 2; curl -s -m 3 http://127.0.0.1:3600/health | grep -q '"ok":true' && return 0; done; return 1; }
rollback() { cp "$BACKUP/aot-bff.js" "$AOT/aot-bff.js"; rm -f "$AOT/aot-gcsi-sim.js"; restart; echo "ROLLBACK: aot-bff.js=$(h "$AOT/aot-bff.js")"; }

[ "$(h "$CAND/aot-bff.js")" = "$NEW" ] && [ "$(h "$CAND/aot-gcsi-sim.js")" = "$SIMNEW" ] || { echo "ABORTADO: candidato difere do aprovado."; exit 1; }
if [ "${1:-}" = "--rollback" ]; then [ -f "$BACKUP/aot-bff.js" ] || { echo "sem backup"; exit 1; }; rollback; exit 0; fi
CUR="$(h "$AOT/aot-bff.js")"
[ "$CUR" = "$PRE" ] || [ "$CUR" = "$NEW" ] || { echo "ABORTADO: aot-bff.js em producao ($CUR) nao e a preimagem nem o candidato (alteracao concorrente, ex. Codex-JEV). Nada alterado."; exit 1; }
node "$PRECHECK" || { echo "ABORTADO: janela NAO comprovadamente segura (posicao/operacao aberta). Nada alterado."; exit 1; }
[ "${1:-}" = "--apply" ] || { echo "Pre-checagem OK. Nada foi alterado (use --apply)."; exit 0; }

mkdir -p "$BACKUP"; [ -f "$BACKUP/aot-bff.js" ] || cp "$AOT/aot-bff.js" "$BACKUP/aot-bff.js"
[ "$(h "$BACKUP/aot-bff.js")" = "$PRE" ] || { echo "ABORTADO: backup diferente da preimagem."; exit 1; }
cp "$CAND/aot-gcsi-sim.js" "$AOT/aot-gcsi-sim.js"; cp "$CAND/aot-bff.js" "$AOT/aot-bff.js"
[ "$(h "$AOT/aot-bff.js")" = "$NEW" ] || { echo "FALHA de hash"; cp "$BACKUP/aot-bff.js" "$AOT/aot-bff.js"; rm -f "$AOT/aot-gcsi-sim.js"; exit 1; }
node "$PRECHECK" || { echo "ABORTADO antes do reinicio: restaurando."; cp "$BACKUP/aot-bff.js" "$AOT/aot-bff.js"; rm -f "$AOT/aot-gcsi-sim.js"; exit 1; }
restart || { echo "health falhou"; rollback; exit 1; }
node -e "
fetch('http://127.0.0.1:3600/state',{signal:AbortSignal.timeout(15000)}).then(r=>r.json()).then(s=>{
  const g=s.flowGcSi&&s.flowGcSi.gate; const ok=!!(s.gate&&s.flowRussell&&g&&typeof g.phase==='string'&&g.forceStep&&!s.flowGcSi._err);
  console.log(JSON.stringify({esNqGate:!!s.gate,flowRussell:!!s.flowRussell,gcsiState:g&&g.state,phase:g&&g.phase,forceStep:g&&g.forceStep,simGcSi:s.simGcSi?'on':'off'}));
  process.exit(ok?0:1)}).catch(e=>{console.error(e.message);process.exit(1)})" && { echo "APLICADO. FLOW GC·SI com forca (anchorGcSi) no BFF de producao."; exit 0; }
echo "== validacao falhou: rollback =="; rollback; exit 1

#!/usr/bin/env bash
# GC/SI — deploy controlado do patch SNAPSHOT /gcsi/sim no BFF de producao :3600. Rodar pelo OPERADOR, com autorizacao
# especifica (o Auto Mode nega deploy de producao ao agente). Mesmo metodo do gcsi-eqv/apply/apply-bff-eqv.sh.
# Troca SO o aot-bff.js (65a76459 -> 3ec88e91, JEV DIFF A 0,90). Motor aot-gcsi-sim.js/aot-sim.js NAO e tocado;
# AOT_GCSI_SIM continua off (a variavel vem do ambiente do BFF; o script nao a define nem a altera).
# Uso: bash apply-bff-snapshot.sh            -> conferencias + pre-checagem (nada muda)
#      bash apply-bff-snapshot.sh --apply    -> backup + copia + reinicio + verificacao (rollback automatico em falha)
#      bash apply-bff-snapshot.sh --rollback -> restaura o aot-bff.js 65a76459 do backup e reinicia
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
AOT="${AOT_DIR:-C:/Users/ADM/.claude/aot}"
CAND="$HERE/candidate/aot-bff.js"
BACKUP="$AOT/_backups/gcsi-snapshot-20261014"
PRE=65a7645965d186ab6b84f5145b03eea07521375ff5161ec3f9bdbcbbfbf592ae
NEW=3ec88e91445e4778211b6830d8027c33de1c48acc9b7d5871b97fd8e12de5b3e
SIM=42d0c8fd590db22d97a3c318f44cd33be2325a8fb66e0d42d49d1c57c0c513d4
PRECHECK="$HERE/../../gcsi/apply/precheck-gcsi.cjs"
h() { sha256sum "$1" | cut -c1-64; }
pid3600() { netstat -ano | grep -E ':3600\s' | grep LISTEN | awk '{print $5}' | head -1; }
restart() { local P; P="$(pid3600)"; [ -n "$P" ] && taskkill //PID "$P" //F >/dev/null; for _ in $(seq 1 75); do sleep 2; curl -s -m 3 http://127.0.0.1:3600/health | grep -q '"ok":true' && return 0; done; return 1; }
rollback() { cp "$BACKUP/aot-bff.js" "$AOT/aot-bff.js"; restart; echo "ROLLBACK: aot-bff.js=$(h "$AOT/aot-bff.js" | cut -c1-16) (esperado ${PRE:0:16})"; }
verify() { node -e "
const get=p=>fetch('http://127.0.0.1:3600'+p,{signal:AbortSignal.timeout(15000)}).then(r=>r.json());
Promise.all([get('/state'),get('/gcsi/sim'),get('/health')]).then(([s,g,hh])=>{
  const gg=s.flowGcSi&&s.flowGcSi.gate;
  const r={health:hh.ok===true,esNqGate:!!(s.gate&&s.gate.state),flowRussell:!!s.flowRussell,hiro:!!(s.hiroOpra&&s.hiroOpra.ok!==undefined),
    gcsiPhase:gg&&gg.phase,forceStep:gg&&gg.forceStep&&gg.forceStep.status,gcsiSimProd:g.enabled,simGcSiInState:!!s.simGcSi};
  console.log(JSON.stringify(r));
  process.exitCode=(r.health&&r.esNqGate&&r.flowRussell&&r.hiro&&typeof r.gcsiPhase==='string'&&!s.flowGcSi._err&&g.enabled===false&&!r.simGcSiInState?0:1)
}).catch(e=>{console.error(e.message);process.exitCode=1})"; }

# 1. artefatos aprovados
[ "$(h "$CAND")" = "$NEW" ] || { echo "ABORTADO: candidato difere do aprovado (3ec88e91)."; exit 1; }
[ "$(h "$AOT/aot-gcsi-sim.js")" = "$SIM" ] || { echo "ABORTADO: aot-gcsi-sim.js de producao difere de 42d0c8fd (motor alterado por outra frente). Nada alterado."; exit 1; }
if [ "${1:-}" = "--rollback" ]; then
  [ "$(h "$BACKUP/aot-bff.js" 2>/dev/null)" = "$PRE" ] || { echo "sem backup valido em $BACKUP"; exit 1; }
  rollback; exit 0
fi
# 2. preimagem / alteracao concorrente
CUR="$(h "$AOT/aot-bff.js")"
[ "$CUR" = "$NEW" ] && { echo "JA APLICADO (aot-bff.js = ${NEW:0:16}). Nada alterado."; verify; exit $?; }
[ "$CUR" = "$PRE" ] || { echo "CONFLITO: aot-bff.js em producao ($CUR) nao e a preimagem aprovada ${PRE:0:16} (alteracao concorrente). Nada alterado."; exit 1; }
# 3. pre-checagem de seguranca (sem posicao sim ES/NQ aberta, sem operacao nativa aberta/pendente)
node "$PRECHECK" || { echo "ABORTADO: janela NAO comprovadamente segura (posicao/operacao aberta). Nada alterado."; exit 1; }
[ "${1:-}" = "--apply" ] || { echo "Pre-checagem OK. Nada foi alterado (use --apply)."; exit 0; }

# 4. backup (preimagem conferida)
mkdir -p "$BACKUP"; [ -f "$BACKUP/aot-bff.js" ] || cp "$AOT/aot-bff.js" "$BACKUP/aot-bff.js"
[ "$(h "$BACKUP/aot-bff.js")" = "$PRE" ] || { echo "ABORTADO: backup diferente da preimagem."; exit 1; }
# 5. copia com reconferencia imediata (corrida com outra frente)
[ "$(h "$AOT/aot-bff.js")" = "$PRE" ] || { echo "CONFLITO: aot-bff.js mudou durante a execucao. Nada alterado."; exit 1; }
cp "$CAND" "$AOT/aot-bff.js"
[ "$(h "$AOT/aot-bff.js")" = "$NEW" ] || { echo "FALHA de hash: restaurando"; cp "$BACKUP/aot-bff.js" "$AOT/aot-bff.js"; exit 1; }
node "$PRECHECK" || { echo "ABORTADO antes do reinicio: restaurando."; cp "$BACKUP/aot-bff.js" "$AOT/aot-bff.js"; exit 1; }
# 6. reinicio + verificacao pos-instalacao (health, ES/NQ, Russell, HIRO, FLOW GC/SI, AOT_GCSI_SIM=off)
restart || { echo "health falhou"; rollback; exit 1; }
verify && { echo "APLICADO: aot-bff.js=${NEW:0:16}; motor ${SIM:0:16} intocado; AOT_GCSI_SIM=off."; exit 0; }
echo "== verificacao falhou: rollback =="; rollback; exit 1

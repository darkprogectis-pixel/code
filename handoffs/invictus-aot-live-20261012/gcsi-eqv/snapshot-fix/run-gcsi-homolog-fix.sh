#!/usr/bin/env bash
# GC/SI — homologacao do patch SNAPSHOT /gcsi/sim na INSTANCIA DE TESTE :3611 (nao e deploy; producao :3600 intocada).
# Igual ao run-gcsi-homolog.sh, mas depois de copiar o codigo de producao (SHA conferido) sobrepoe SO o aot-bff.js
# candidato (SHA conferido). Estado/historico GC/SI de $H/history-gcsi sao preservados entre janelas.
# Uso: bash run-gcsi-homolog-fix.sh --start | --status | --stop | --rollback (stop + volta o aot-bff.js do $H ao de producao)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
AOT="${AOT_DIR:-C:/Users/ADM/.claude/aot}"
H="${HOMOLOG_DIR:-C:/Users/ADM/.claude/aot-gcsi-homolog}"
PORT=3611
BFFPROD=65a7645965d186ab6b84f5145b03eea07521375ff5161ec3f9bdbcbbfbf592ae
BFFCAND=3ec88e91445e4778211b6830d8027c33de1c48acc9b7d5871b97fd8e12de5b3e
SIMNEW=42d0c8fd590db22d97a3c318f44cd33be2325a8fb66e0d42d49d1c57c0c513d4
h() { sha256sum "$1" | cut -c1-64; }
pidof_port() { netstat -ano | grep -E "127.0.0.1:$1\s" | grep LISTEN | awk '{print $5}' | head -1; }
stop() { local P; P="$(pidof_port $PORT)"; [ -n "$P" ] && taskkill //PID "$P" //F >/dev/null && echo "parado PID $P"; return 0; }

case "${1:-}" in
  --start)
    [ -z "$(pidof_port $PORT)" ] || { echo "ABORTADO: :$PORT ja em uso."; exit 1; }
    [ "$(h "$AOT/aot-bff.js")" = "$BFFPROD" ] && [ "$(h "$AOT/aot-gcsi-sim.js")" = "$SIMNEW" ] || { echo "ABORTADO: codigo de producao difere do aprovado."; exit 1; }
    [ "$(h "$HERE/candidate/aot-bff.js")" = "$BFFCAND" ] || { echo "ABORTADO: candidato difere do aprovado."; exit 1; }
    mkdir -p "$H/logs" "$H/history-gcsi" "$H/empty-exec" "$H/empty-robo"
    cp "$AOT"/*.js "$AOT"/*.cjs "$AOT/package.json" "$H/"; cp -r "$AOT/public" "$H/"
    cp "$HERE/candidate/aot-bff.js" "$H/aot-bff.js"
    [ "$(h "$H/aot-bff.js")" = "$BFFCAND" ] && [ "$(h "$H/aot-gcsi-sim.js")" = "$SIMNEW" ] || { echo "ABORTADO: copia difere."; exit 1; }
    ( cd "$H" && AOT_PORT=$PORT AOT_BIND=127.0.0.1 AOT_SIM=off AOT_GCSI_SIM=on AOT_GCSI_SIM_DIR="$H/history-gcsi" \
      AOT_EXEC_DIR="$H/empty-exec" AOT_ROBO_DIR="$H/empty-robo" AOT_HEALTH_DIR="$H/history/health" AOT_LVLMIG_DIR="$H/history/levels" \
      nohup node aot-bff.js >"$H/logs/stdout.log" 2>&1 & )
    for _ in $(seq 1 60); do sleep 2; curl -s -m 3 "http://127.0.0.1:$PORT/health" | grep -q '"ok":true' && { echo "HOMOLOG-FIX ON :$PORT dir=$H bff=${BFFCAND:0:16}"; exit 0; }; done
    echo "health falhou"; stop; exit 1 ;;
  --status) curl -s -m 8 "http://127.0.0.1:$PORT/gcsi/sim" | cut -c1-900; echo ;;
  --stop) stop ;;
  --rollback) stop; sleep 2; [ -f "$H/aot-bff.js" ] && cp "$AOT/aot-bff.js" "$H/aot-bff.js" && echo "aot-bff.js do $H = producao ($(h "$H/aot-bff.js" | cut -c1-16))" ;;
  *) echo "uso: --start | --status | --stop | --rollback"; exit 2 ;;
esac

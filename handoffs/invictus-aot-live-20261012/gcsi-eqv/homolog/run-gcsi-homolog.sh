#!/usr/bin/env bash
# GC/SI — homologacao do simulador + historico exclusivo numa INSTANCIA BFF DE TESTE separada (nao e deploy).
# Copia so o CODIGO ja aprovado de producao (SHA conferido) para um diretorio proprio, sobe em :3611 com
# AOT_GCSI_SIM=on e AOT_SIM=off. Le a ponte :5151 so por GET (igual ao BFF de producao). Nao toca :3600, NT8,
# executor INVICTUS, /sim/events de producao nem contas: o simulador GC/SI e interno (orders:'NONE', sem conta).
# Uso: bash run-gcsi-homolog.sh --start | --status | --stop | --rollback (stop + apaga o diretorio de teste)
set -uo pipefail
AOT="${AOT_DIR:-C:/Users/ADM/.claude/aot}"
H="${HOMOLOG_DIR:-C:/Users/ADM/.claude/aot-gcsi-homolog}"   # irmao do aot/ => as .env canonicas resolvem igual
PORT=3611
BFFNEW=65a7645965d186ab6b84f5145b03eea07521375ff5161ec3f9bdbcbbfbf592ae
SIMNEW=42d0c8fd590db22d97a3c318f44cd33be2325a8fb66e0d42d49d1c57c0c513d4
h() { sha256sum "$1" | cut -c1-64; }
pidof_port() { netstat -ano | grep -E "127.0.0.1:$1\s" | grep LISTEN | awk '{print $5}' | head -1; }
stop() { local P; P="$(pidof_port $PORT)"; [ -n "$P" ] && taskkill //PID "$P" //F >/dev/null && echo "parado PID $P"; return 0; }

case "${1:-}" in
  --start)
    [ -z "$(pidof_port $PORT)" ] || { echo "ABORTADO: :$PORT ja em uso."; exit 1; }
    [ "$(h "$AOT/aot-bff.js")" = "$BFFNEW" ] && [ "$(h "$AOT/aot-gcsi-sim.js")" = "$SIMNEW" ] || { echo "ABORTADO: codigo de producao difere do aprovado."; exit 1; }
    mkdir -p "$H/logs" "$H/history-gcsi" "$H/empty-exec" "$H/empty-robo"
    cp "$AOT"/*.js "$AOT"/*.cjs "$AOT/package.json" "$H/"; cp -r "$AOT/public" "$H/"
    [ "$(h "$H/aot-bff.js")" = "$BFFNEW" ] && [ "$(h "$H/aot-gcsi-sim.js")" = "$SIMNEW" ] || { echo "ABORTADO: copia difere."; exit 1; }
    ( cd "$H" && AOT_PORT=$PORT AOT_BIND=127.0.0.1 AOT_SIM=off AOT_GCSI_SIM=on AOT_GCSI_SIM_DIR="$H/history-gcsi" \
      AOT_EXEC_DIR="$H/empty-exec" AOT_ROBO_DIR="$H/empty-robo" AOT_HEALTH_DIR="$H/history/health" AOT_LVLMIG_DIR="$H/history/levels" \
      nohup node aot-bff.js >"$H/logs/stdout.log" 2>&1 & )
    for _ in $(seq 1 60); do sleep 2; curl -s -m 3 "http://127.0.0.1:$PORT/health" | grep -q '"ok":true' && { echo "HOMOLOG ON :$PORT dir=$H"; exit 0; }; done
    echo "health falhou"; stop; exit 1 ;;
  --status) curl -s -m 8 "http://127.0.0.1:$PORT/gcsi/sim" | cut -c1-600; echo ;;
  --stop) stop ;;
  --rollback) stop; sleep 2; rm -rf "$H" && echo "removido $H" ;;
  *) echo "uso: --start | --status | --stop | --rollback"; exit 2 ;;
esac

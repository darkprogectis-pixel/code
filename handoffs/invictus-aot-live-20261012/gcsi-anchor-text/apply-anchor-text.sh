#!/usr/bin/env bash
# Corrige SO o texto de consequencia do card ANCORA GC.SI em public/index.html e public/auto.html (JEV DIFF gcsi-anchor-text).
# O BFF serve public/ com fs.readFile a cada requisicao (aot-bff.js serveStatic) => SEM reinicio do :3600, sem tocar aot-bff.js/motor.
#   bash apply-anchor-text.sh            -> checagem (nada alterado)
#   bash apply-anchor-text.sh --apply    -> backup + copia com conferencia de SHA (OPERADOR, autorizacao especifica)
#   bash apply-anchor-text.sh --rollback -> restaura os 2 arquivos do backup
#   AOT_DIR=<sandbox> e BFF_URL=<url> trocam o alvo (testes).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
AOT="${AOT_DIR:-C:/Users/ADM/.claude/aot}"; PUB="$AOT/public"; BACKUP="$AOT/_backups/gcsi-anchor-text-20261014"
BFF="${BFF_URL:-http://127.0.0.1:3600}"
declare -A PRE=( [index.html]=b6ac8094fde081433207323a04e6af7f74092cef2e74e70988459e6f0c084a01 [auto.html]=5e8441eba84419e483c0cbb7b6e4e6788af04a8fbdba4b8ce59a2ecf50d1a0c2 )
declare -A NEW=( [index.html]=e7819fd1840fd11d6246c914b33d41660a44fbb63f781a5197a0e370ebdd7a81 [auto.html]=d48601314beddd1745754fe8fba4d7c8ae1d467fbf2bca9ec573eca08d6b2bf0 )
h() { sha256sum "$1" | cut -c1-64; }
restore() { cp "$BACKUP/index.html" "$PUB/index.html"; cp "$BACKUP/auto.html" "$PUB/auto.html"; }
if [ "${1:-}" = "--rollback" ]; then
  for f in index.html auto.html; do [ "$(h "$BACKUP/$f" 2>/dev/null)" = "${PRE[$f]}" ] || { echo "sem backup valido de $f em $BACKUP"; exit 1; }; done
  restore; for f in index.html auto.html; do echo "ROLLBACK: $f=$(h "$PUB/$f" | cut -c1-16)"; done; exit 0
fi
for f in index.html auto.html; do [ "$(h "$HERE/candidate/$f")" = "${NEW[$f]}" ] || { echo "ABORTADO: candidato $f difere do aprovado."; exit 1; }; done
ALL_NEW=1
for f in index.html auto.html; do
  C="$(h "$PUB/$f")"; [ "$C" = "${NEW[$f]}" ] && continue; ALL_NEW=0
  [ "$C" = "${PRE[$f]}" ] || { echo "CONFLITO: $f em producao (${C:0:16}) nao e a preimagem aprovada. Nada alterado."; exit 1; }
done
[ $ALL_NEW = 1 ] && { echo "JA APLICADO. Nada alterado."; exit 0; }
[ "${1:-}" = "--apply" ] || { echo "CHECAGEM OK: preimagens conferidas; nada alterado (use --apply)."; exit 0; }
mkdir -p "$BACKUP"
for f in index.html auto.html; do
  [ -f "$BACKUP/$f" ] || cp "$PUB/$f" "$BACKUP/$f"
  [ "$(h "$BACKUP/$f")" = "${PRE[$f]}" ] || { echo "ABORTADO: backup de $f diferente da preimagem."; exit 1; }
done
for f in index.html auto.html; do
  cp "$HERE/candidate/$f" "$PUB/$f"
  [ "$(h "$PUB/$f")" = "${NEW[$f]}" ] || { echo "FALHA de hash em $f: restaurando ambos"; restore; exit 1; }
done
curl -s -m 10 "$BFF/" | grep -q "radar 4/4 atendido" && curl -s -m 10 "$BFF/auto.html" | grep -q "radar 4/4 atendido" \
  || { echo "FALHA: $BFF nao serve o candidato; restaurando"; restore; exit 1; }
echo "APLICADO: index.html=${NEW[index.html]:0:16} auto.html=${NEW[auto.html]:0:16}; aot-bff.js e motor intocados; sem reinicio."

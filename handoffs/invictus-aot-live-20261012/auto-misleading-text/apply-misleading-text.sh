#!/usr/bin/env bash
# Corrige SO 2 mensagens enganosas: #trigNote (auto.html) e selo v2.confluence (auto.html+index.html) em public/index.html e public/auto.html (JEV DIFF auto-misleading-text).
# O BFF serve public/ com fs.readFile a cada requisicao (aot-bff.js serveStatic) => SEM reinicio do :3600, sem tocar aot-bff.js/motor.
#   bash apply-anchor-text.sh            -> checagem (nada alterado)
#   bash apply-anchor-text.sh --apply    -> backup + copia com conferencia de SHA (OPERADOR, autorizacao especifica)
#   bash apply-anchor-text.sh --rollback -> restaura os 2 arquivos do backup
#   AOT_DIR=<sandbox> e BFF_URL=<url> trocam o alvo (testes).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
AOT="${AOT_DIR:-C:/Users/ADM/.claude/aot}"; PUB="$AOT/public"; BACKUP="$AOT/_backups/auto-misleading-text-20261014"
BFF="${BFF_URL:-http://127.0.0.1:3600}"
declare -A PRE=( [index.html]=4d5cb19651d098ebea2161c9988b358e94b3c9b6807f4e905248ffc2e898c439 [auto.html]=a2c342db2a8fd932a5171a69fb370a8a929439f7d49f5f4c45239a524e9bf6c0 )
declare -A NEW=( [index.html]=e3f1e0383d43dfd9de558b7faa1b121f109a67994209ac18837d3cd2d6c9d66f [auto.html]=c26286a944b3ee99f25e130037dd4bae48d3c113f798c623dbbb7e1bc196e80f )
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
curl -s -m 10 "$BFF/" | grep -q "Confluência de tape (informativa)" && curl -s -m 10 "$BFF/auto.html" | grep -q "Confluência de tape (informativa)" \
  || { echo "FALHA: $BFF nao serve o candidato; restaurando"; restore; exit 1; }
echo "APLICADO: index.html=${NEW[index.html]:0:16} auto.html=${NEW[auto.html]:0:16}; aot-bff.js e motor intocados; sem reinicio."

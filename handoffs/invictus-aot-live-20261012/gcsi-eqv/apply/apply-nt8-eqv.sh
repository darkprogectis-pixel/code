#!/usr/bin/env bash
# GC/SI = ES/NQ — instala no NT8 os 2 .cs aprovados (JEV DIFF A req_01a13add7635705ebd0106b75b80ef76, JEV FINAL A
# req_01a13ade19cc7a0ba65a765f98915b3c): backup + SHA256 + copia. Rodar pelo OPERADOR.
# NAO compila: depois, NinjaScript Editor -> F5 (uma vez). Nao toca ordens, contas nem estrategias.
# Uso: bash apply-nt8-eqv.sh            (so confere, nada muda)
#      bash apply-nt8-eqv.sh --apply    (backup + copia dos 2 arquivos)
#      bash apply-nt8-eqv.sh --rollback (restaura o ultimo backup .bak-gcsi-eqv-*; depois F5)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CUSTOM="$(cygpath -u "$USERPROFILE")/Documents/NinjaTrader 8/bin/Custom"
declare -A DST=( [AlfaOmegaBridge.cs]="$CUSTOM/AddOns/AlfaOmegaBridge.cs" [AlfaOmegaSharedState.cs]="$CUSTOM/Indicators/TTW_DarkProjects/AlfaOmegaSharedState.cs" )
declare -A PRE=( [AlfaOmegaBridge.cs]=a3e72a70e3ec1ed645b3f03238c51db60aab0ab3030909118f4378ac4f37175c [AlfaOmegaSharedState.cs]=49c43777481cb5ddd1a220c67219a43a0ae58b814f43d4ede44241812183c30a )
declare -A NEW=( [AlfaOmegaBridge.cs]=82baaad80dbd07e911aa392adb57cd3775a998616ee9355bfd8cde0d1c2c4776 [AlfaOmegaSharedState.cs]=4efea237dd9c65e70685b87b4620dc1b3f01b4df9e5391b2105552c946ee8b97 )
sha() { sha256sum "$1" | cut -d' ' -f1; }
for f in AlfaOmegaBridge.cs AlfaOmegaSharedState.cs; do
  [ "$(sha "$HERE/../candidate/$f")" = "${NEW[$f]}" ] || { echo "ABORTADO: candidato $f difere do aprovado"; exit 2; }
  cur="$(sha "${DST[$f]}")"; echo "$f instalado=$cur"
  if [ "${1:-}" != "--rollback" ]; then
    [ "$cur" = "${PRE[$f]}" ] || [ "$cur" = "${NEW[$f]}" ] || { echo "ABORTADO: $f no NT8 nao e a preimagem nem o candidato (alteracao concorrente?)"; exit 2; }
  fi
done
case "${1:-}" in
  --apply)
    TS="$(date +%Y%m%d-%H%M%S)"
    for f in AlfaOmegaBridge.cs AlfaOmegaSharedState.cs; do
      d="${DST[$f]}"; mkdir -p "$HERE/backup-$TS"; cp "$d" "$HERE/backup-$TS/$f"   # backup FORA do bin\Custom (NT8 compila todo .cs da pasta)
      cp "$HERE/../candidate/$f" "$d"
      [ "$(sha "$d")" = "${NEW[$f]}" ] || { echo "FALHA de hash em $f: restaurando"; cp "$HERE/backup-$TS/$f" "$d"; exit 1; }
    done
    echo "COPIADO (backup em apply/backup-$TS). PROXIMO: NinjaScript Editor -> F5 (uma vez); depois conferir :5151/state.anchorGcSi.source == AoGate.GcSi";;
  --rollback)
    B="$(ls -d "$HERE"/backup-* 2>/dev/null | sort | tail -1)"; [ -n "$B" ] || { echo "sem backup"; exit 2; }
    for f in AlfaOmegaBridge.cs AlfaOmegaSharedState.cs; do cp "$B/$f" "${DST[$f]}"; echo "$f restaurado=$(sha "${DST[$f]}")"; done
    echo "RESTAURADO de $B. PROXIMO: F5 (uma vez).";;
  *) echo "Conferencia OK. Nada foi alterado (use --apply).";;
esac

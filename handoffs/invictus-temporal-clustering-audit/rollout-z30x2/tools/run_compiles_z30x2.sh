#!/bin/sh
# Compila os imports Z30X2 das familias: instalacao limpa + upgrade sobre cada base historica de cliente (mesmos cenarios do P-GCAP).
# Sandbox = stock NT8 limpo + fontes em ordem (import simulado) -> compile2_ob.ps1 (Roslyn do bin OFICIAL extraido). Nada toca o NT8.
T="$(cd "$(dirname "$0")" && pwd)"; R="$(dirname "$T")"; B="$R/build"; O="$R/tests"; mkdir -p "$O"
STOCK=/c/Users/ADM/AppData/Local/Temp/claude/C--Users-ADM-Claude-JEV-code/0bed206c-d33c-4d1e-9224-85b79447cd15/scratchpad/up/stock
SB="$1"; KEEP="$2"; D=/c/Users/ADM/Desktop; W=/c/Users/ADM/Downloads
run() { n="$1"; shift; rm -rf "$SB/$n"; mkdir -p "$SB/$n"; cp -r "$STOCK/." "$SB/$n/"
  for s in "$@"; do powershell -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$T/sim_import.ps1")" -Zip "$(cygpath -w "$s")" -Bin "$(cygpath -w "$SB/$n")" >/dev/null; done
  powershell -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$T/compile2_ob.ps1")" -Tree "$(cygpath -w "$SB/$n")" -Out "$(cygpath -w "$O/compile_$n.json")" | tail -1 | sed "s/^/$n /"
  case " $KEEP " in *" $n "*) ;; *) rm -rf "$SB/$n";; esac; }
run F1_clean "$B/AlfaOmega_F1_INVICTUS_Z30X2_import.zip"
run F1_over_P10 "$D/ALFA_OMEGA_PILOTO_LUFDUTRA_FULL_STANDALONE.zip" "$B/AlfaOmega_F1_INVICTUS_Z30X2_import.zip"
run F1_over_RANYERE "$D/ALFA_OMEGA_PILOTO_RANYERE_MENDONCA.zip" "$D/ALFA_OMEGA_RANYERE_INVICTUS_STANDALONE.zip" "$B/AlfaOmega_F1_INVICTUS_Z30X2_import.zip"
run F1_over_6cae "$W/ALFA_OMEGA_PILOTO_JOAO_HS_FULL_20260921.zip" "$B/AlfaOmega_F1_INVICTUS_Z30X2_import.zip"
run F1_over_PGCAP "$R/../../press-recalibration-20261007/build/AlfaOmega_F1_INVICTUS_PGCAP_import.zip" "$B/AlfaOmega_F1_INVICTUS_Z30X2_import.zip"
run F2_clean "$B/AlfaOmega_F2_INVICTUS_Z30X2_import.zip"
run F2_over_eed0 "$W/ALFA_OMEGA_PILOTO_NELSON_CASCO.zip" "$B/AlfaOmega_F2_INVICTUS_Z30X2_import.zip"
run F3_clean "$B/AlfaOmega_F3_INVICTUS_Z30X2_import.zip"
run F3_over_be06 "$D/ALFA_OMEGA_PILOTO_WJAVERTJR_FIX_MIRROR.zip" "$B/AlfaOmega_F3_INVICTUS_Z30X2_import.zip"
run F3_over_6cae "$D/ALFA_OMEGA_PILOTO_WJAVERTJR.zip" "$B/AlfaOmega_F3_INVICTUS_Z30X2_import.zip"
run F4_clean "$B/AlfaOmega_F4_INVICTUS_Z30X2_import.zip"
run F4_over_5d32 "$W/ALFA_OMEGA_AUTHV2_PILOTO_20260918.zip" "$B/AlfaOmega_F4_INVICTUS_Z30X2_import.zip"
run F4_over_13be_5d32 "$W/Telegram Desktop/AlfaOmega_suite_import_FIXED.zip" "$W/ALFA_OMEGA_AUTHV2_PILOTO_20260918.zip" "$B/AlfaOmega_F4_INVICTUS_Z30X2_import.zip"
run CANON_clean "$B/AlfaOmega_INVICTUS_Native_Z30X2_import.zip"
echo DONE

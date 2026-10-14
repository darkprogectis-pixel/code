# JEV FINAL — 2 mensagens enganosas ES/NQ (loop jf-20261014184645-c631c8)

## Objetivo
Corrigir só apresentação:
- `auto.html` #trigNote: "abrindo posição" só com 4/4 ∧ LONG|SHORT, sem afirmar ordem;
- selo `v2.confluence` em auto.html + index.html: com gate≠OPEN, "Confluência de tape (informativa) — Gate fechado, sem autorização de operação".
Contrato BFF existente; produção intocada até aprovação manual.

## Resultado
- Staging `handoffs/invictus-aot-live-20261012/auto-misleading-text/`: base = produção atual; candidate; diff; `apply-misleading-text.sh`; tests.
- SHA: auto `a2c342db…` → `c26286a944b3ee99…`; index `4d5cb196…` → `e3f1e0383d43dfd9…`.
- Diff: auto 2 trechos (−1/+2 cada), index 1 trecho (−1/+2). Usa `a.strength`, `aw` e `st.gate.state`, já publicados.
- JEV DIFF A 0.86 `req_01a13bbd0bbb78ee90349296722ab34f`; modify_file `jd_mv8gov2i1ebbec` (`req_01a13bbd5a317d57bae4365509128964`), gate_open=true, minimal_edit 1.0.

## Testes (recheck do CLI all_pass)
- `misleading-text-T1-T6` 47/47:
  - T1: 4/4+NEUTRO sem "abrindo posição"; a base reproduz o defeito.
  - T2: 4/4+LONG/SHORT com "não é confirmação de ordem".
  - T3: gate CLOSED/OFFLINE/ausente + confluência mostra a frase informativa, sem CONFIRMADA/MAXIMA, sem cor, com direção.
  - T4: gate OPEN idêntico.
  - T5: stale/ausente/v1/err/posição aberta idênticos.
  - T6: diff restrito; cards ÂNCORA/GC·SI/Russell preservados.
- `misleading-apply-script-sandbox` 7/7: S1–S6 sandbox; P1 produção só checagem.

## Riscos
- Baixo: só texto/classe CSS de dois elementos informativos.
- Gate, motor, BFF, executor, estratégias, stops, contas e ordens intocados. Não interfere em posições abertas.
- Deploy pendente de aprovação manual do operador (o auto mode nega deploy).

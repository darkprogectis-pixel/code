# JEV DIFF — verify() do apply-bff-snapshot.sh (process.exit -> process.exitCode)

## Causa provada
Incidente 14/10 17:22Z (commit e255e27): verify imprimiu todas as condições true, mas o Node v26.4.0 abortou em `process.exit` com handles do fetch fechando (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, src\winsync.c:94), exit != 0, rollback automático. Reproduzido: verify ORIGINAL extraído do script, 5x contra :3600 (só GET) = 5/5 exit 0xC0000409 com a assertion.

## Diff completo (só staging)
```diff
--- a/apply-bff-snapshot.sh
+++ b/apply-bff-snapshot.sh
@@ -26,8 +26,8 @@
   const r={health:hh.ok===true,esNqGate:!!(s.gate&&s.gate.state),flowRussell:!!s.flowRussell,hiro:!!(s.hiroOpra&&s.hiroOpra.ok!==undefined),
     gcsiPhase:gg&&gg.phase,forceStep:gg&&gg.forceStep&&gg.forceStep.status,gcsiSimProd:g.enabled,simGcSiInState:!!s.simGcSi};
   console.log(JSON.stringify(r));
-  process.exit(r.health&&r.esNqGate&&r.flowRussell&&r.hiro&&typeof r.gcsiPhase==='string'&&!s.flowGcSi._err&&g.enabled===false&&!r.simGcSiInState?0:1)
-}).catch(e=>{console.error(e.message);process.exit(1)})"; }
+  process.exitCode=(r.health&&r.esNqGate&&r.flowRussell&&r.hiro&&typeof r.gcsiPhase==='string'&&!s.flowGcSi._err&&g.enabled===false&&!r.simGcSiInState?0:1)
+}).catch(e=>{console.error(e.message);process.exitCode=1})"; }
 
 # 1. artefatos aprovados
 [ "$(h "$CAND")" = "$NEW" ] || { echo "ABORTADO: candidato difere do aprovado (3ec88e91)."; exit 1; }
```

## Testes (13/13)
```
INFO original x5: exits=3221226505,3221226505,3221226505,3221226505,3221226505 crashes=5
PASS V01 corrigido x10 contra :3600 (todas as condições true) => exit 0, sem assertion libuv
PASS V02 saída JSON da verificação preservada
PASS V03 health ok:false => exit != 0, sem assertion
PASS V04 /gcsi/sim enabled:true (sim ligado) => exit != 0, sem assertion
PASS V05 flowRussell ausente => exit != 0, sem assertion
PASS V06 gate ES/NQ ausente => exit != 0, sem assertion
PASS V07 flowGcSi._err => exit != 0, sem assertion
PASS V08 simGcSi presente no /state => exit != 0, sem assertion
PASS V09 HTTP 500 com corpo inválido => exit != 0, sem assertion
PASS V10 controle: servidor local com payload bom => exit 0
PASS V11 BFF fora do ar (porta fechada) => exit != 0 (catch), sem assertion
PASS V12 só as linhas 29-30 (verify) mudaram; precheck/backup/rollback/restart idênticos
PASS V13 nenhum process.exit( restante no script corrigido

13/13 PASS
```

## Garantias
- Só linhas 29-30 mudam; precheck, backup, cópia, reconferência, restart, rollback idênticos (V12).
- Falha real continua exit != 0: health false, sim ligado, Russell/gate ausentes, flowGcSi._err, simGcSi presente, HTTP 500, BFF fora do ar (V03-V11). fetch limitado por AbortSignal.timeout(15000), sem processo pendurado.
- Patch 3ec88e91, motor 42d0c8fd e produção 65a76459 intocados. --apply NÃO executado; futura instalação exige nova autorização do operador.
- JEV modify_file jd_mv8dwn3r7f71ae gate_open 0,93.

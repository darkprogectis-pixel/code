// P1S Press 2026-10-02 — monta o pacote de instalacao (NAO instala). Staging -> payload + SHA256 + manifesto.
// Live: SOMENTE LEITURA (sha256 dos arquivos que seriam substituidos). Loop jf-20261002133345-50a6d7.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SYNC = __dirname;
const LIVE = 'C:/Users/ADM/Documents/NinjaTrader 8/bin/Custom';
const AOTLIVE = 'C:/Users/ADM/.claude/aot';
const PKG = path.join(SYNC, 'install-package-20261002-press');
const sha = f => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch { return null; } };

const itens = [
  ...['AlfaOmegaRobo.cs', 'AlfaOmegaRoboFechamento.cs', 'AlfaOmegaRoboSaida.cs', 'AlfaOmegaRoboEventoAot.cs']
    .map(f => ({ grupo: 'AddOns', src: path.join(SYNC, 'staging/AddOns', f), rel: 'AddOns/' + f, dest: LIVE + '/AddOns/' + f })),
  ...['AoPressSessao.cs', 'AoTapeEngine.cs', 'AoMarketDataPublisher.cs', 'AoControlCenter.cs', 'AlfaOmegaFlowOne.cs']
    .map(f => ({ grupo: 'Indicators', src: path.join(SYNC, 'staging/Indicators/TTW_DarkProjects', f), rel: 'Indicators/TTW_DarkProjects/' + f, dest: LIVE + '/Indicators/TTW_DarkProjects/' + f })),
  ...['aot-sim.js', 'aot-bff.js']
    .map(f => ({ grupo: 'aot', src: path.join(SYNC, 'aot', f), rel: 'aot/' + f, dest: AOTLIVE + '/' + f })),
];
const inalterados = ['AddOns/AlfaOmegaRoboMotor.cs', 'AddOns/AlfaOmegaRoboAudit.cs', 'AddOns/AlfaOmegaRoboPositions.cs', 'AddOns/AO_HistoryClient.cs', 'AddOns/AO_HistoryWindow.cs', 'AddOns/AlfaOmegaSharedState.cs']
  .map(r => ({ rel: r, live: sha(LIVE + '/' + r) }));

if (fs.existsSync(PKG)) { console.error('PKG ja existe: ' + PKG + ' (nao sobrescrever)'); process.exit(2); }
let fail = 0;
for (const it of itens) {
  const out = path.join(PKG, 'payload', it.rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(it.src, out);                    // byte a byte (sem normalizar CRLF/LF)
  it.sha = sha(it.src); it.shaPkg = sha(out); it.live = sha(it.dest);
  if (it.sha !== it.shaPkg) { fail++; console.log('FAIL copia ' + it.rel); }
}
fs.writeFileSync(path.join(PKG, 'SHA256_PAYLOAD.txt'), itens.map(i => i.sha + '  payload/' + i.rel).join('\n') + '\n');

const tab = g => itens.filter(i => i.grupo === g).map(i => `| ${path.basename(i.rel)} | ${i.sha} | ${i.live || 'NOVO (nao existe no live)'} |`).join('\n');
const md = `# PACOTE DE INSTALACAO — AOT INVICTUS + P1S Press de SESSAO COMPLETA — NAO INSTALADO

Gerado em ${new Date().toISOString()} pelo /jev-finish loop \`jf-20261002133345-50a6d7\` (sessao add035a6), por \`make_package_press.js\`.
Montar o pacote = copiar staging -> payload + SHA256. NADA foi copiado para o live, sem F5, sem restart do BFF, sem ordens.
Substitui \`%LOCALAPPDATA%\\InvictusJevCode\\fix-backups\\close-divergence-20261001\\install-package-20261002\\\` (Robo fe048080 / Fech d8354407 — OBSOLETO, so historico).
Local: dentro de \`conf-tests\\sync\\\` (unica area de escrita autorizada pelo operador nesta ordem; a proposta citava %LOCALAPPDATA%).
JEV DIFF da politica P1S: A 0.67 \`req_01a0fcea7ae375088d882537094259b4\` (proposta \`handoffs/PROPOSAL_PRESS_SESSAO_COMPLETA_20261002.md\`).

## Payload (${itens.length} arquivos)

### NT8 AddOns — destino \`C:\\Users\\ADM\\Documents\\NinjaTrader 8\\bin\\Custom\\AddOns\\\`
| arquivo | SHA256 esperado no destino | SHA256 live atual (substituido) |
|---|---|---|
${tab('AddOns')}

### NT8 Indicators (P1S) — destino \`C:\\Users\\ADM\\Documents\\NinjaTrader 8\\bin\\Custom\\Indicators\\TTW_DarkProjects\\\`
| arquivo | SHA256 esperado no destino | SHA256 live atual (substituido) |
|---|---|---|
${tab('Indicators')}

AoPressSessao.cs e NOVO e e dependencia do FlowOne e do AoTapeEngine: os 5 arquivos de Indicators vao JUNTOS (senao o F5 nao compila).
AddOns + Indicators compilam no MESMO assembly do NT8 => UM unico F5 do operador para os 9 .cs.
Copiar byte a byte (Copy-Item). A Saida tem CRLF+LF misto: NAO normalizar.

### AOT (Node) — destino \`C:\\Users\\ADM\\.claude\\aot\\\`
| arquivo | SHA256 esperado | SHA256 live atual |
|---|---|---|
${tab('aot')}

Ficam inalterados (NAO copiar; conferir SHA antes e depois):
${inalterados.map(i => `- ${i.rel} ${i.live ? i.live.slice(0, 16) + '…' : '(ausente)'}`).join('\n')}
(AoGate.DefaultMinForce = 0.03 e EsNqMinForce INALTERADOS — SharedState nao faz parte do pacote.)

## Comportamento novo (P1S) — LER antes do F5
- Press publicado (Press_ES/NQ no barramento, FlowOne e AoTapeEngine) = cumDelta/sessVolume SO se a virada de sessao foi vista AO VIVO e sem buraco de tape em tempo real > 300 s; senao **0** => o passo 4 do AoGate.EsNq (|Press| >= 0.03) falha => gate FECHA por forca (fail-safe).
- **Consequencia direta do F5/restart no meio da sessao: ZERO aberturas do AOT ate a proxima virada de sessao ao vivo (22:00Z no horario de verao dos EUA = 18:00 ET).** Painel: "Press: aguardando virada de sessao ao vivo". E intencional (proposta §2/§6).
- Formula, reset, minForce, me/mvi, painel hibrido, DoubleConf e footprint do FlowOne: INALTERADOS.
- Riscos residuais (proposta §6): desconexao < 300 s nao detectada; feriado/sessao fina com gap > 300 s invalida a sessao; diluicao intra-sessao mantida (fora do escopo).

## Ordem de ativacao
1. 9 .cs (AddOns + Indicators) + F5 do operador + validacao runtime Sim101.
2. Depois os 2 .js + restart do BFF.
(C# sozinho e JS sozinho seguem seguros, como no pacote anterior; X13 provou paridade do JS sem registros exec.)

## Backup do live (antes da copia)
1. Criar \`fix-backups\\close-divergence-20261001\\install-<timestamp>\\live-before\\\` (AddOns\\, Indicators\\TTW_DarkProjects\\, aot\\).
2. Copiar para ela os 4 .cs AddOns + os 4 .cs de Indicators existentes + Motor + Audit + os 2 .js.
3. Conferir os SHAs da coluna "live atual". Se algum divergir => PARAR.

## Pre-condicoes (todas obrigatorias)
1. Broker FLAT em TODAS as contas habilitadas do robo: 0 posicoes e 0 ordens AO|… ativas.
2. Robo PLAY = STOP, motor FLAT, AOT sem trade canonico aberto.
3. \`motor-execucoes.json\` sem pernas vivas e fills orfaos vazios.
4. Fora da janela 17:55–18:05 ET e fora de evento de mercado. Preferir F5 ANTES das 18:00 ET para que a virada de sessao seguinte seja vista ao vivo (senao o Press fica 0 ate a virada do dia seguinte).
5. Ordem explicita do operador para copia + F5 + restart do BFF. O F5 e do operador.
6. Pre-condicoes da parte U do handoff canonico continuam valendo.

## CHECKLIST PRE-F5 / FECHAR NT8 (G13, permanente)
1. Motor FLAT, ou toda perna aberta com stop+take ativos.
2. Nunca dar F5 com EXIT_PENDING ou flatten em curso.
3. Depois do F5: audit \`boot_protection_check\` = ok e \`state\\robo-alertas.json\` vazio.
4. Sim101 com o NT8 fechado ou sem feed: o stop nao dispara (residual aceito).

## Validacao runtime pos-F5 (Sim101)
- Plano RT1–RT7 + boot_protection_check/connection_status (pacote anterior).
- P1S: antes da virada => \`:5151/state\` es.press = nq.press = 0 e painel "aguardando virada"; o \`why\` do gate = "forca fraca". Depois da virada ao vivo => press != 0 e aviso some. Opcional: comparar com outra maquina que tambem viu a virada (mesmo feed => mesmo Press).

## Rollback
- C#: robo STOP => broker FLAT => copiar de volta os 8 .cs de \`live-before\\\` e APAGAR \`Indicators\\TTW_DarkProjects\\AoPressSessao.cs\` => conferir SHAs => F5 (operador).
- JS: copiar de volta aot-sim.js e aot-bff.js => reiniciar o BFF.

## Testes que validaram este payload (loop jf-20261002133345-50a6d7)
build_sync 0 erros · test_press (C# 65/65 incl. controles negativos + PR5 28/28) · press_wiring 28/28 · test_equity 34/34 · test_wiring 12/12 · test_real_flow 39/39 · test_exec C#+JS 14/14 · test_race C#+T3 7/7 · run_sync 13/13.
`;
fs.writeFileSync(path.join(PKG, 'MANIFEST_INSTALL_NAO_EXECUTADO.md'), md);
for (const i of itens) console.log(`${i.sha.slice(0, 16)}  ${i.rel}  live=${i.live ? i.live.slice(0, 16) : 'NOVO'}`);
console.log(fail ? 'PACOTE: FAIL' : `PACOTE: OK ${itens.length} arquivos -> ${PKG}`);
process.exit(fail ? 1 : 0);

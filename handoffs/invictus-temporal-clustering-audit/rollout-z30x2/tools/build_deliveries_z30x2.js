// ROLLOUT Z30X2: monta, por cliente, a pasta de entrega a partir da entrega P-GCAP existente (mesma familia, mesmo login, mesma acao).
// import = copia byte a byte do import Z30X2 da familia · rollback = copia byte a byte do import P-GCAP que o cliente ja tem
// LEIA_PRIMEIRO preserva o bloco de login e a instrucao de instalacao do cliente; acrescenta o AVISO OPERACIONAL (orientacao humana, nao trava de software).
// Nunca grava senha. Nao sobrescreve pasta existente.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const R = path.join(__dirname, '..'), W = path.join(R, '..'), P = path.join(W, '..'), OLD = path.join(P, 'press-recalibration-20261007');
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const J = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const man = J(path.join(OLD, 'entregas', 'MANIFEST_ENTREGAS.json')); const fam = {}; for (const f of J(path.join(R, 'build', 'FAMILIAS_Z30X2.json'))) fam[f.familia] = f;
const AVISO = 'PACK TECNICAMENTE LIBERADO PARA CONTA REAL.\nPOR ORIENTACAO OPERACIONAL, NAO UTILIZAR CONTA REAL ATE A CONCLUSAO\nDA VALIDACAO LIVE E A LIBERACAO FINAL DO PROJETO INVICTUS.';
const OUT = path.join(R, 'entregas'); fs.mkdirSync(OUT, { recursive: true }); const res = [];
for (const m of man) {
  const cli = m.cliente, F = fam[m.familia]; if (!F) { console.log('FAMILIA AUSENTE', cli, m.familia); process.exit(1); }
  const dir = path.join(OUT, cli), stg = path.join(dir, '_conteudo_entrega'); if (fs.existsSync(dir)) { console.log('JA EXISTE (nao sobrescrever): ' + dir); process.exit(1); }
  fs.mkdirSync(stg, { recursive: true });
  const oldDir = path.join(OLD, 'entregas', cli), oldImp = path.join(oldDir, `ALFA_OMEGA_${cli}_INVICTUS_PGCAP_import.zip`);
  if (sha(oldImp) !== F.base_sha256) { console.log('BASE DO CLIENTE != BASE DA FAMILIA', cli); process.exit(1); }
  const imp = `ALFA_OMEGA_${cli}_INVICTUS_Z30X2_import.zip`, rb = `ALFA_OMEGA_${cli}_INVICTUS_PGCAP_ROLLBACK_import.zip`, cont = `ALFA_OMEGA_${cli}_INVICTUS_Z30X2_20261008_NAO_IMPORTAR.zip`;
  fs.copyFileSync(F.zip, path.join(stg, imp)); fs.copyFileSync(oldImp, path.join(stg, rb));
  const old = fs.readFileSync(path.join(oldDir, '_conteudo_entrega', 'LEIA_PRIMEIRO.txt'), 'utf8').replace(/\r\n/g, '\n');
  const login = (old.match(/\nLogin AlfaOmega:[\s\S]*?\n(?=COMO INSTALAR)/) || [''])[0].trim();
  const passo2 = (old.match(/\n2\. NinjaTrader 8[^\n]*\n([\s\S]*?)\n3\. Aguarde/) || ['', ''])[1];
  const base = (old.match(/\n- Indicadores AlfaOmega:[^\n]*\n/) || [''])[0].trim();
  if (!login) { console.log('BLOCO DE LOGIN NAO ENCONTRADO', cli); process.exit(1); }
  const leia = `ALFA OMEGA + INVICTUS (atualizado 08/10/2026 - forca do tape em janela de 30 min + correcao da camada de saida) - ${cli}
================================================================
>>> AVISO OPERACIONAL (orientacao; nao e trava do software)
${AVISO}

Arquivo para importar no NinjaTrader 8:  ${imp}
NAO importe o arquivo ${cont} (ele so transporta este pacote).
NAO importe o arquivo ${rb} (so serve para VOLTAR ao pacote anterior, se for orientado a isso).

${login}

COMO INSTALAR
1. Deixe o robo INVICTUS em STOP e SEM posicao aberta. Feche graficos/estrategias abertos que usem AlfaOmega.
2. NinjaTrader 8 > Tools > Import > NinjaScript Add-On... > escolha ${imp}.
${passo2 ? passo2 + '\n' : ''}   Se o NinjaTrader perguntar se deseja substituir arquivos existentes, responda SIM.
3. Aguarde a compilacao terminar (sem erros).
4. FECHE o NinjaTrader por completo e abra de novo (necessario para os graficos carregarem a versao nova).
5. Abra o AlfaOmega Control Center e entre com o SEU login e a SUA senha de sempre.
   O dispositivo (este PC) continua o mesmo: NAO apague a pasta %LOCALAPPDATA%\\AlfaOmega\\authv2.
6. O robo INVICTUS inicia PARADO (STOP). Ele so opera depois que voce configurar e ligar.
   Suas contas, ativos e configuracoes NAO sao alterados por este pacote.

O QUE TEM NESTE PACOTE
${base ? base + '\n' : ''}- INVICTUS com as correcoes P-RTH1 e P-GCAP (mantidas) + duas mudancas novas:
- FORCA_JANELA_30 (nova): a forca do tape passa a ser medida numa janela movel de 30 minutos, com o sinal igual a direcao.
  Antes a forca era acumulada desde a abertura da sessao e ficava concentrada logo apos a abertura, com longos periodos sem entrada.
- EXIT_LAYER_FIX X2 (nova): correcao da camada de saida. O fechamento de cada perna passa a ser confirmado pelo saldo da propria perna
  e pelo nome da ordem; o robo nunca envia um segundo fechamento sem prova de que o primeiro foi rejeitado ou cancelado, e nunca fecha
  mais do que a conta tem. Corrige o caso de saida em dobro (posicao invertida) apos saida seguida de reentrada.
  Comportamento a conhecer: se uma ordem de fechamento sumir sem deixar rastro, o robo NAO reenvia; ele gera alerta apos 60 s e a
  posicao precisa ser conferida por voce.
- 6 arquivos mudaram em relacao ao pacote P-GCAP de 07/10: AlfaOmegaSharedState.cs, AoTapeEngine.cs, AoMarketDataPublisher.cs,
  AlfaOmegaRobo.cs, AlfaOmegaRoboFechamento.cs, AlfaOmegaRoboSaida.cs. Todos os outros arquivos sao identicos byte a byte.
  Login, senha, dispositivo e licenca NAO mudam. Nao ha nenhum bloqueio de conta real no software.
- Nenhuma senha, nenhum arquivo de dispositivo, nenhum dado de outro cliente.

PARA VOLTAR AO PACOTE ANTERIOR (P-GCAP de 07/10)
Robo em STOP e sem posicao > Tools > Import > ${rb} > responder SIM > fechar e abrir o NinjaTrader.

SHA256 do import:   ${F.sha256}
SHA256 do rollback: ${F.base_sha256}
`;
  fs.writeFileSync(path.join(stg, 'LEIA_PRIMEIRO.txt'), leia.replace(/\n/g, '\r\n'));
  fs.writeFileSync(path.join(stg, 'AVISO_OPERACIONAL.txt'), (AVISO + '\n').replace(/\n/g, '\r\n'));
  fs.writeFileSync(path.join(stg, 'ENTRIES.json'), JSON.stringify({ familia: m.familia, base_pgcap_sha256: F.base_sha256, z30x2_sha256: F.sha256, entries: F.entries }, null, 1));
  const files = ['LEIA_PRIMEIRO.txt', 'AVISO_OPERACIONAL.txt', 'ENTRIES.json', imp, rb];
  fs.writeFileSync(path.join(stg, 'SHA256SUMS.txt'), files.map(n => sha(path.join(stg, n)) + '  ' + n).join('\r\n') + '\r\n');
  res.push({ cliente: cli, familia: m.familia, acao: m.acao, user_id: m.user_id, tem_login: !!m.login_authv2, import: imp, import_sha256: F.sha256, rollback: rb, rollback_sha256: F.base_sha256, conteiner: cont, dir, arquivos: files.concat('SHA256SUMS.txt') });
  console.log(cli, m.familia, 'import', F.sha256.slice(0, 10), 'rollback', F.base_sha256.slice(0, 10));
}
fs.writeFileSync(path.join(OUT, 'ENTREGAS_Z30X2.json'), JSON.stringify(res, null, 1));
console.log('entregas', res.length);

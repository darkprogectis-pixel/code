// Instalacao controlada no NT8: o payload no repo tem que bater com o manifesto SHA256, e os scripts
// que escrevem em bin\Custom exigem confirmacao explicita, NT8 fechado e backup VERIFIED.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const PAYLOAD = join(ROOT, 'nt8', 'AddOns', 'InvictusJevCode');
const INSTALL = join(ROOT, 'nt8', 'install');
const read = f => readFileSync(join(INSTALL, f), 'utf8');

test('N01 ijc-payload-manifest.json == SHA256 dos .cs do AddOn (rodar build-payload-manifest.mjs apos editar)', () => {
  const m = JSON.parse(read('ijc-payload-manifest.json'));
  const onDisk = readdirSync(PAYLOAD).filter(f => f.endsWith('.cs') && !(m.deferred_not_installed || []).includes(f)).sort();
  assert.deepEqual(m.files.map(f => f.name), onDisk);
  for (const f of m.files) {
    const buf = readFileSync(join(PAYLOAD, f.name));
    assert.equal(createHash('sha256').update(buf).digest('hex'), f.sha256, f.name);
    assert.equal(buf.length, f.size, f.name);
  }
  assert.equal(m.jev_can_send_order, false);
  assert.equal(m.order_path, 'HARD_DISABLED');
});

test('N02 scripts que escrevem no NT8 exigem -Confirm, NT8 fechado e backup verificado; demais sao somente leitura', () => {
  const inst = read('03-install.ps1'), rb = read('05-rollback.ps1');
  assert.match(inst, /\$Confirm -ne 'INSTALL-IJC'/);
  assert.match(rb, /\$Confirm -ne 'ROLLBACK-IJC'/);
  for (const s of [inst, rb]) {
    assert.match(s, /Test-IjcNt8Running/);
    assert.match(s, /Get-IjcBackup \$BackupId/);
    assert.match(s, /Test-IjcBackupIntact/);
  }
  assert.doesNotMatch(rb, /Remove-Item/);            // rollback move para quarentena, nunca apaga
  assert.doesNotMatch(inst, /Remove-Item/);
  for (const f of ['01-precheck.ps1', '04-verify.ps1']) {
    const s = read(f);
    assert.doesNotMatch(s, /Copy-Item|Move-Item|Remove-Item|WriteAllText|Set-Content|Out-File|New-Item/, f);
  }
  // nenhum script dispara compilacao/F5 nem abre o NinjaTrader
  for (const f of readdirSync(INSTALL).filter(f => f.endsWith('.ps1'))) {
    assert.doesNotMatch(read(f), /Start-Process|NinjaTrader\.exe|msbuild|dotnet\s+build/i, f);
  }
});

test('N03 backups ficam FORA de bin\\Custom e o conjunto inclui csproj + saidas do F5', () => {
  const c = read('Ijc-Nt8Common.ps1');
  assert.match(c, /LOCALAPPDATA 'InvictusJevCode\\install-backups'/);
  assert.match(c, /'NinjaTrader\.Custom\.dll', 'NinjaTrader\.Custom\.pdb', 'NinjaTrader\.Custom\.xml'/);
  assert.match(c, /\$rel\.Add\('NinjaTrader\.Custom\.csproj'\)/);
  assert.match(c, /Resource\.\*\.resx/);                       // assemblies satelite por cultura
  assert.match(c, /NinjaTrader\.Custom\.resources\.dll/);
});

test('N04 lote RTH: payload = 4 arquivos, boleta manual ADIADA (fica no repo, fora do payload), payload sem API de ordem', () => {
  const m = JSON.parse(read('ijc-payload-manifest.json'));
  assert.deepEqual(m.files.map(f => f.name), ['IjcAddOn.cs', 'IjcControlCenterWindow.cs', 'IjcExecutor.cs', 'IjcPure.cs']);
  assert.deepEqual(m.deferred_not_installed, ['IjcManualOrders.cs']);
  assert.equal(m.install_lot, 'RTH_TEST_READ_ONLY_NO_MANUAL_ORDER_EXECUTION');
  assert.ok(readdirSync(PAYLOAD).includes('IjcManualOrders.cs'));        // codigo da boleta preservado no repo
  const ORDER_API = /\.Submit\s*\(|\bCreateOrder\s*\(|\.Change\s*\(|\.Flatten\s*\(|\bEnter(Long|Short)\w*\s*\(|\bExit(Long|Short)\w*\s*\(/;
  const text = Object.fromEntries(m.files.map(f => [f.name, readFileSync(join(PAYLOAD, f.name), 'utf8')]));
  for (const [name, code] of Object.entries(text)) assert.doesNotMatch(code, ORDER_API, name);
  // sem IJC_MANUAL_ORDERS (NT8 nao define), a janela usa o controlador adiado; o real so e referenciado sob o simbolo
  assert.match(text['IjcControlCenterWindow.cs'], /#if IJC_MANUAL_ORDERS\s+private readonly IIjcManualOrders manual = new IjcManualOrderController\(\);\s+#else\s+private readonly IIjcManualOrders manual = new IjcManualOrdersDeferred\(\);/);
  assert.doesNotMatch(Object.values(text).join('\n'), /#define\s+IJC_MANUAL_ORDERS/);
  assert.match(text['IjcPure.cs'], /public string Click\(string side, IjcTicketDraft d\) \{ return "DEFERRED"; \}/);
  assert.match(text['IjcPure.cs'], /public bool Available \{ get \{ return false; \} \}/);
  // leitura de conta/PNL/posicao faz parte do payload (IjcExecutor.cs), nao da boleta
  assert.match(text['IjcExecutor.cs'], /public static class IjcAccounts/);
  // 1 <Compile> por arquivo do manifesto (Get-IjcCsprojEntries) => 4 entradas
  assert.match(read('Ijc-Nt8Common.ps1'), /\$p\.files \| ForEach-Object \{ '    <Compile Include="'/);
});

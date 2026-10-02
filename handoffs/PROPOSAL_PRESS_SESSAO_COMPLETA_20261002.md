# PROPOSTA DE DIFF — Press de SESSÃO COMPLETA (P1S) · loop jf-20261002133345-50a6d7 · 2026-10-02

Escopo: SOMENTE staging (`conf-tests\sync\staging\…`) + harness de teste em `conf-tests\sync\` + pacote em `%LOCALAPPDATA%\InvictusJevCode\fix-backups\…`. Live/NT8 `bin\Custom` NÃO é tocado. Sem F5, sem ordens, sem instalação.

## 1. Problema (provado — handoff §Z.3 + §AB)
- Press publicado no barramento (Press_ES/NQ, insumo do passo 4 do `AoGate.EsNq`, minForce 0.03) = `cumDelta/sessVolume` acumulado SÓ em tempo real desde `max(carga do indicador, virada de sessão)`. Dois publicadores possíveis (eleição AoPublisher): FlowOne.PublishDirBySymbol (`AlfaOmegaFlowOne.cs:4686`) e AoTapeEngine (pacote standalone, via AoMarketDataPublisher/AoControlCenter). Ambos com a mesma regra.
- Consequência: o MESMO mercado gera Press/anchor diferentes conforme o horário em que o NT8/indicador foi carregado (LOAD_TIME_DEPENDENT).
- Estudo quantitativo local (dados reais deste PC: NT8 tick db ES/NQ 12-26, 14/09→02/10 00:47Z, 15 sessões, 15,4 M + 7,0 M trades; decodificador validado contra o audit do robô: preço erro médio 0,29 pt; me/mvi concordância 0,85–0,89):
  - P0 (regra atual) com carga em L = sessão+0h/+2h/+4h/+8h: 241 / 295 / 275 / 112 aberturas do gate (cooldown 60 s); 1,6–4,8 % do tempo aberto; **teste explícito de invariância: 2,71 % dos segundos com gate diferente entre L=0h/4h/8h ⇒ LOAD_TIME_DEPENDENT**.
  - P2 janela móvel por tempo (W 1800/3600/7200/14400 s): 1726/977/543/359 aberturas = **1,5×–7× a referência**, invariância 0 % diff após warmup, mas **qualidade NÃO melhora**: acerto direcional do ES (sinal × movimento) 5/15/60 min = 0,43–0,51 (P1: 0,506/0,508/0,549). Janelas = mais sinais sem mais informação ⇒ inflação artificial ⇒ REJEITADA.
  - P3 janela por volume (N fixo 20k–200k ou k×volume horário mediano por símbolo, k=1/2/4): 46–1731 aberturas, acerto 0,42–0,54, mesma conclusão (invariância 0 %, sem ganho de qualidade; N grande mata sinais) ⇒ REJEITADA.
  - P1 (reset determinístico na sessão, histórico completo da sessão) = P0@L=0h: 241 aberturas (16,1/sessão), melhor acerto do conjunto (não significativo, n=241), 39 % nas 2 primeiras horas. É o comportamento PRETENDIDO pelo código (pressão de sessão) quando a carga coincide com a abertura.
  - Gaps de trade intra-sessão (15 sessões): ES p99.999 30,7 s, máx 79,1 s · NQ p99.999 32,9 s, máx 113 s.
  - Resultados: `%LOCALAPPDATA%\InvictusJevCode\fix-backups\close-divergence-20261001\press-policy\results\` (eval1_P0_P2.json, eval2_hourly_cooldown.json, eval3_quality_invariance.json, gaps_intrasession.json); scripts em `press-policy\tools\`.

## 2. Política proposta — P1S "SESSÃO COMPLETA OU ZERO"
- Fórmula INALTERADA: Press = cumDelta / sessVolume da sessão (agressor pela regra de cotação, só tempo real — preserva a decisão do operador 2026-07-24 "acumuladores de sessão só contam tempo real").
- Reset INALTERADO: virada de sessão do template (IsFirstBarOfSession && IsFirstTickOfBar) zera os acumuladores; carga (DataLoaded / novo motor) zera.
- NOVO (único): o Press só é PUBLICADO se a sessão corrente foi observada INTEIRA ao vivo: a virada de sessão aconteceu com State == Realtime E não houve buraco de tape em tempo real > 300 s desde então. Caso contrário o valor publicado é 0 ⇒ o passo 4 do gate (|Press| ≥ 0.03) falha ⇒ gate fecha por força (fail-safe, nunca abre sinal com Press parcial).
- Por que é LOAD_TIME_INVARIANT: qualquer máquina/carga que tenha visto a virada ao vivo publica exatamente o P1 (mesmo tick ⇒ mesmo cumDelta/sessVolume); quem não viu publica 0. Não existe mais um Press "parcial dependente da carga". Valor publicado ∈ {P1(t), 0}, nunca outro.
- minForce = 0.03 INALTERADO (AoGate.DefaultMinForce e EsNqMinForce não mudam). me/mvi/conf/LastPrice INALTERADOS. AoGate/SharedState NÃO alterados.
- Warmup: até a próxima virada de sessão ao vivo (22:00Z no horário de verão dos EUA). Restart/F5/recarga no meio da sessão ⇒ Press 0 até a próxima virada (custo medido: perde no máximo os sinais da sessão corrente, ~16/sessão na média; nos dados, 39 % deles caem nas 2 primeiras horas).
- Rollover: troca de contrato = nova série/novo motor ⇒ mesmo tratamento da carga.
- Gap 300 s: ≈ 2,7× o maior gap intra-sessão observado (113 s); nenhum falso positivo nos 15 dias. Um buraco real (desconexão ≥ 5 min) invalida a sessão (fail-safe). Desconexões < 300 s não são detectadas (risco residual documentado; o gate já exige tape fresco ≤ 90 s).
- Determinismo entre máquinas: sim, para máquinas que observaram a virada ao vivo com o mesmo feed; ordem tick/virada tratada (ver 3.1).
- Diluição intra-sessão (sinais concentrados no início, ~0 após ~16 h) é PROPRIEDADE da regra de sessão pretendida e NÃO é alterada aqui; estudo de threshold/janela fica para fase separada se o operador pedir (os dados atuais não mostram ganho de qualidade com janelas).

## 3. Diff (staging) — 1 arquivo novo + 4 alterados

### 3.1 NOVO `staging\Indicators\TTW_DarkProjects\AoPressSessao.cs` (classe pura, só System)
```csharp
using System;
namespace NinjaTrader.NinjaScript.Indicators
{
	/// Politica de validade do Press PUBLICADO (2026-10-02). Usada pelos DOIS publicadores (FlowOne e AoTapeEngine).
	public class AoPressSessao
	{
		public const double GapMaxSeg = 300;
		private bool _completa;
		private DateTime _ultimoTickRt = DateTime.MinValue;
		public bool Completa { get { return _completa; } }
		public string Motivo { get; private set; }
		public AoPressSessao() { Motivo = "aguardando virada de sessao ao vivo"; }
		/// Carga/recarga: a sessao corrente NAO foi vista inteira.
		public void Carga() { _completa = false; _ultimoTickRt = DateTime.MinValue; Motivo = "carga: aguardando virada de sessao ao vivo"; }
		/// Virada de sessao (no MESMO ponto em que os acumuladores zeram). Completa so se ao vivo.
		public void ViradaSessao(bool realtime) { _completa = realtime; _ultimoTickRt = DateTime.MinValue; Motivo = realtime ? null : "virada de sessao no historico: aguardando a proxima ao vivo"; }
		/// Cada trade contado em tempo real (mesmo ponto em que cumDelta/sessVolume acumulam).
		public void TickRealtime(DateTime t)
		{
			if (t == DateTime.MinValue) return;
			if (_completa && _ultimoTickRt != DateTime.MinValue && (t - _ultimoTickRt).TotalSeconds > GapMaxSeg)
			{ _completa = false; Motivo = "buraco de tape > 300 s: aguardando a proxima virada ao vivo"; }
			if (t > _ultimoTickRt) _ultimoTickRt = t;
		}
		/// Valor publicado: P1 se a sessao foi vista inteira; 0 (gate fecha por forca) caso contrario.
		public double Publicavel(long cumDelta, long sessVolume)
		{
			if (!_completa || sessVolume <= 0) return 0.0;
			return (double)cumDelta / sessVolume;
		}
	}
}
```
Ordem tick × virada: se o 1º trade da sessão chega ANTES da virada, o gap (pausa de 60 min) desliga e a virada religa; se chega DEPOIS, a virada zerou `_ultimoTickRt` e o gap não é checado. Mesmo resultado nas duas ordens.

### 3.2 `AoTapeEngine.cs` (cópia do live no staging)
- `+ private readonly AoPressSessao _pressSessao = new AoPressSessao();` (motor novo ⇒ incompleto = carga)
- `Press` ⇒ `get { return _pressSessao.Publicavel(_cumDelta, _sessVolume); }`
- `+ public double PressBruta { get { return _sessVolume > 0 ? (double)_cumDelta / _sessVolume : 0.0; } }` · `+ public bool PressSessaoCompleta` · `+ public string PressMotivo`
- `ResetSessao()` ⇒ `ResetSessao(bool realtime) { _cumDelta = 0; _sessVolume = 0; _pressSessao.ViradaSessao(realtime); }`
- dentro de `if (realtime) { … }` em Tick: `+ _pressSessao.TickRealtime(now);`
- cabeçalho: nota da política P1S.

### 3.3 `AoMarketDataPublisher.cs`
- `ResetSessao(long instancia, string sym)` ⇒ `ResetSessao(long instancia, string sym, bool realtime)` ⇒ `Motor(instancia, sym).ResetSessao(realtime)`.
- `Resumo()`: acrescenta " · Press: aguardando virada de sessao ao vivo" quando algum motor ES/NQ desta instância publicadora não tem sessão completa (só texto de painel).

### 3.4 `AoControlCenter.cs` (OnBarUpdate :1169)
- `AoMarketDataPublisher.ResetSessao(_tapePubId, sym)` ⇒ `AoMarketDataPublisher.ResetSessao(_tapePubId, sym, State == State.Realtime)`.

### 3.5 `AlfaOmegaFlowOne.cs`
- `+ private readonly AoPressSessao _pressSessao = new AoPressSessao();`
- DataLoaded (:1209, onde os acumuladores zeram): `+ _pressSessao.Carga();`
- OnMarketData bloco `if (State == State.Realtime)` (:1411-1422): `+ _pressSessao.TickRealtime(now);`
- OnBarUpdate virada de sessão (:4705): `+ _pressSessao.ViradaSessao(State == State.Realtime);`
- PublishDirBySymbol (:4686): `double _press = _pressSessao.Publicavel(_cumDelta, _sessVolume);` (painel híbrido, DoubleConf e footprint do FlowOne INALTERADOS — continuam com os acumuladores brutos).

## 4. Testes (todos via `finish.mjs test`)
- NOVO `conf-tests\sync\test_press.ps1` + `ProgramPress.cs` + fixture real `conf-tests\sync\fixtures\press_ticks_<data>.csv` (ES/NQ, virada−6 h → virada+8 h, extraída read-only do tick db com o decodificador validado; lado ⇒ bid/ask sintéticos coerentes) + referência JS P1 em checkpoints. Compila AoPressSessao + AoTapeEngine do STAGING e o AoTapeEngine do LIVE renomeado (controle negativo embutido):
  - PR1 unidade AoPressSessao: carga ⇒ 0; virada histórica ⇒ 0; virada ao vivo ⇒ ratio; gap 301 s ⇒ 0 até a próxima virada; gap 113 s ⇒ mantém; ordem tick/virada A e B; volume 0 ⇒ 0; GapMaxSeg = 300.
  - PR2 invariância (dados reais): cargas L ∈ {−6 h, −30 min, −5 min} ⇒ Press publicado após a virada IDÊNTICO tick a tick entre si e = referência JS P1 (tolerância 1e−12); cargas L ∈ {+1 h, +4 h} ⇒ Press publicado = 0 em todo tick; antes da virada (todas as cargas) = 0. Predicado: Press(t) ∈ {Ref(t), 0}.
  - PR3 não-regressão: me/mvi/conf/LastPrice do motor staging = motor live em todo tick; PressBruta (staging) = Press (live).
  - PR4 CONTROLE NEGATIVO: o mesmo predicado de invariância aplicado ao motor LIVE TEM QUE FALHAR (carga +1 h ⇒ Press ∉ {Ref, 0}). Se não falhar ⇒ teste inválido ⇒ FAIL.
  - PR5 fiação estrutural (node `test_press_wiring.js`): FlowOne/AoControlCenter/AoMarketDataPublisher do staging contêm as chamadas nos pontos exatos (Carga em DataLoaded, TickRealtime dentro do bloco realtime, ViradaSessao(State == State.Realtime) na virada, Publicavel no publish); fórmula bruta ausente no publish; AoGate.DefaultMinForce = 0.03 e SharedState inalterado; diff staging×live restrito aos hunks propostos.
- `build_sync.ps1`: overlay também de `staging\Indicators\TTW_DarkProjects\` + inclusão de AoPressSessao.cs e AlfaOmegaFlowOne.cs no conjunto compilado; exigir erros = 0 e nenhum tipo de warning novo.
- Regressões: test_equity, test_wiring, test_real_flow, test_exec, test_race, run_sync, build_sync — PASS.

## 5. Depois
JEV FINAL ⇒ pacote regenerado em `%LOCALAPPDATA%\InvictusJevCode\fix-backups\close-divergence-20261001\install-package-20261002-press\` (payload AddOns 4 + Indicators 5 + aot 2, SHA256, manifesto NÃO executado; NOTA: arquivos do FlowOne/AoControlCenter exigem F5 do operador) ⇒ documentação (handoff + KB). Instalação/F5/ordens = NÃO (exigem ordem do operador; parte U continua bloqueando).

## 6. Riscos
- Restart no meio da sessão ⇒ zero sinais até a próxima virada (intencional, fail-safe, documentado; visível no painel "Press: aguardando virada de sessao ao vivo").
- Desconexão < 300 s não detectada. Feriado/sessão fina com gap > 300 s ⇒ sessão invalidada (fail-safe).
- FlowOne (produto da suíte) passa a depender do novo AoPressSessao.cs ⇒ o arquivo tem que ir junto no pacote.
- Diluição intra-sessão mantida (fora do escopo; política de sessão pretendida).

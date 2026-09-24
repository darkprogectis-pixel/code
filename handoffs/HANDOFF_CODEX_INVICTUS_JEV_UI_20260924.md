# HANDOFF — INVICTUS JEV CODE / Product & Dashboard Design
Data: 24/09/2026 · FRONT A
Entrega: modelo visual e especificação de produto, sem código de produção.

## 1. Decisão de produto

**INVICTUS JEV CODE** é um Market Analyzer, JEV Status / Decision Panel e Robot Control Center no mesmo AddOn. A identidade é própria: monograma geométrico IJ, fundo grafite, tipografia precisa e acento discreto em latão/ciano. Não reutilizar logotipo, nome, fonte proprietária ou composição distintiva de terceiros.

A referência visual mencionada pelo operador não estava anexada/acessível nesta solicitação. O mockup foi criado a partir da descrição de painel lateral; não declarar reprodução ou comparação com a imagem ausente.

Estado-base: Runtime V1 operacional e live bridge implementada conforme a ordem atual e o handoff Control Center. NT8 AddOn existe como código preliminar; esta entrega não instala nem compila no NT8. Robot Executor continua OFF / não operacional. Não usar a antiga condição de projeto “IMPLEMENTATION NONE” para negar o runtime atual; “nenhuma implementação” aqui refere-se somente ao trabalho de design desta frente.

**Invariante:** um único JEV Shared Engine produz o snapshot; Analyzer e Robot consomem exatamente esse resultado. Nenhum tab, filtro, seletor, botão ou gateway de agente recalcula o contexto, origina outra classificação ou muda regras do cérebro.

## 2. Artefatos e fontes

Mockup: [INVICTUS_JEV_CODE_DASHBOARD_20260924.png](assets/INVICTUS_JEV_CODE_DASHBOARD_20260924.png).
Imagem gerada pela ferramenta built-in image_gen; prompt integral no apêndice. Não é captura do mercado ou do NT8 em funcionamento. Os valores da imagem são ilustrativos, incluindo POSITIVE_GAMMA/DEGRADED; não foram consultados endpoints live.

Fontes de integração lidas, sem alteração:
- handoffs/HANDOFF_JEV_RUNTIME_V1_20260924.md
- handoffs/HANDOFF_JEV_CONTROL_CENTER_V1_20260924.md
- nt8/AddOns/JevControlCenter.cs
- src/jev/bridge/panel-model.mjs

O contrato textual abaixo prevalece sobre pequenas diferenças de texto/alinhamento da imagem gerada. A coluna de estados do mockup é referência de design, não uma região permanente do painel real.

## 3. Layout e hierarquia

Unidades de layout: DIPs WPF, não pixels físicos. Fonte base Segoe UI 13; números tabulares. Grade de espaçamento 4/8/12/16/24; raio 6; contorno 1 DIP. Margem externa 16, espaço entre cards 12; linha de dados mínima 28–32, controles 32–36.

- Janela lateral padrão: **480 × 960 DIPs**, redimensionável, mínimo 400 × 640. Largura confortável 480–560; não fixar altura ao conteúdo.
- Header fixo 66: monograma 28, título 18 semibold, subtítulo 11, ação de janela nativa. Nome sempre INVICTUS JEV CODE.
- Status fixo 58: quatro células ENGINE, LIVE DATA, JEV AGENT, ROBOT, com ícone + texto, no mínimo duas linhas.
- Navegação fixa 40: Analyzer, Robot, Details, Settings, Logs. Tab selecionado por sublinhado ciano e texto, não apenas cor.
- Corpo com rolagem vertical independente: Market ~90, contexto ~96, Native Dealer ~202, SPX Context ~128, Analysis ~150. Alturas aproximadas; texto pode expandir.
- Rodapé Robot sempre visível ~170–190: OFF/ON, resumo de execução, estratégia, posição e safeguards; footer snapshot ~24.
- A 640 de altura, header/status/tabs/Robot permanecem visíveis; conteúdo central rola. Nenhuma horizontal obrigatória. Estados longos quebram em linha, não reduzir fonte abaixo de 12 para fazê-los caber.
- Em 400 de largura: status 2×2; labels e valores podem empilhar; mesma ordem e mesmos dados. Em janela expandida ≥760, corpo pode usar duas colunas, mas contexto e Robot continuam inequívocos.

**Ordem de leitura:** estado técnico → contexto do JEV → qualidade/razões → evidências → autorização de execução. Tela não é order-entry e não contém BUY/SELL.

## 4. Componentes e textos

### STATUS

| Componente | Conteúdo / regra |
|---|---|
| ENGINE | OPERATIONAL quando snapshot reporta RUNNING ou RUNNING_NO_USABLE_DATA; STARTING quando reportado. RUNNING_NO_USABLE_DATA mantém motor operacional e mostra DATA_INVALID separadamente. Falha de bridge não prova motor parado: ENGINE UNKNOWN / last known. |
| LIVE DATA | Mostrar LIVE / REPLAY / UNKNOWN a partir de bridge.mode e estado de conectividade separado. CONNECTED significa transporte respondendo, não qualidade FRESH. |
| JEV AGENT | Telemetria própria de agente, se disponível. Contrato atual não fornece status dedicado: NOT REPORTED, tooltip “Status do agente não disponibilizado”. Não inferir agent ONLINE porque ENGINE está ativo. |
| ROBOT | OFF com cadeado no V1. ON só pode vir de estado confirmado de executor em fase futura. |

Selo discreto “ONE SHARED ENGINE”. JEV Agent é consumidor opcional/assíncrono, não outro cérebro obrigatório.

### MARKET / CONTEXT

Instrument: mostrar alvo do snapshot; ES quando efetivamente informado. Nunca transformar market_origin SPX em ES_NATIVE. Timeframe: “—” quando ausente; timeframe visual de gráfico, se futuramente associado, identificado como “Visual” e não como horizonte do motor.

Market state: descrição disponível do motor, sem sintetizar sinal. Directional context: enum exato com explicação curta. Data quality: badge próprio. Destaque principal: UNKNOWN + “Sem regra direcional ativa” quando o reason correspondente existir. Para primeiro ciclo: “Aguardando primeiro snapshot”. Não mostrar a mesma razão para todo UNKNOWN.

Rodapé do contexto: “Contexto, não ordem”. Não exibir porcentagem, chance, gauge de confiança ou score inventado. UNCALIBRATED vai em Details; remover medidor, não substituir por 0%.

### JEV NATIVE DEALER

Seis linhas com disclosure:
1. Gamma regime: 0DTE e detalhes next/full, sem cor direcional LONG/SHORT.
2. Structure: níveis acima/abaixo e distância com unidade conhecida; nenhum nível ausente vira zero.
3. Delta positioning: razão put/call DEX quando reportada; direção UNRESOLVED.
4. Second-order flows: valor/estado recebido; UNRESOLVED no modelo atual.
5. Vol / skew: estado recebido.
6. Transitions: lista de eventos efetivamente reportados; falta de telemetria = “—”, lista vazia válida = “Nenhuma transição reportada”.

Não contar campos como votos ou gerar outra conclusão no renderer.

### SPX FINAL CONTEXT

TRACE e VolSignals em namespaces separados, cada um com freshness e efeitos por dimensão. Sem fundir números ou converter unidades UNKNOWN. Se effect_on_native=null, mostrar “Efeitos por dimensão”, não inventar agregado.

MenthorQ aparece nessa região por conveniência visual, mas em subárea separada **“MENTHORQ · CONFIRMATION OVERLAY”**. POSITIVE ou ZERO; política “Positive only · Non-blocking”. Não reclassificar MenthorQ como fonte C equivalente a TRACE/VolSignals. ZERO não é erro, veto ou penalidade.

### ANALYSIS / DETAILS

Linhas: Current context, Reason codes, Conflicts, Unresolved, Source quality. Cada disclosure abre Details na seção correspondente, sem perder o instrumento selecionado. Mostrar reason.code + label legível; código desconhecido deve continuar visível. Separar conflito descritivo entre fontes de CONFLICTED_CONTEXT.

Contagens somente quando disponíveis no snapshot. unresolved.sample contém no máximo 12 itens: rotular como amostra; contagem total vem de unresolved.count. Details pode consultar output/audit existentes para lista completa. Ausência de conflicts no panel não significa “0 conflicts”.

### ROBOT

Card visualmente separado, label ROBOT e seletor [OFF | ON]. OFF selecionado; ON desabilitado com cadeado e texto “Executor ainda não operacional”. Motivo técnico completo em tooltip/Details.

Execution: DISABLED. Strategy: NOT AVAILABLE até telemetria real. Position: UNKNOWN / “Não reportada”; não mostrar FLAT, P&L zero, conta ou posição fictícios. Safeguards: “Execução bloqueada · Analyzer ativo”, refletindo a capacidade real reportada. Exibir safeguards conhecidos; “não reportado” nos demais.

O clique na navegação Robot apenas abre detalhes. OFF não significa fechar posição ou cancelar ordens. A V1 não tem executor nem caminho de envio; não inventar um “emergency flatten” decorativo.

## 5. Estados visuais

Paleta: fundo #10151C; cards #171E28; divisores #2B3543; texto #E7EDF4; secundário #AAB7C7; ciano #68CFE5; latão #D0B478. Evitar gradiente/brilho decorativo.

| Enum | Estilo / ícone | Significado visual |
|---|---|---|
| LONG_CONTEXT | Verde #6ED3A6 + seta para cima + texto | Contexto, nunca botão Buy |
| SHORT_CONTEXT | Coral #FF8A8A + seta para baixo + texto | Contexto, nunca botão Sell |
| NEUTRAL_CONTEXT | Cinza claro + traço horizontal | Sem inclinação efetivamente classificada |
| CONFLICTED_CONTEXT | Âmbar #F0BC62 + setas opostas | Leituras em conflito segundo o motor |
| UNKNOWN | Azul-acinzentado #AFC4DA + informação | Não classificável; não erro de software |
| VALID | Verde + check | Qualidade válida reportada |
| DEGRADED | Âmbar + triângulo contornado | Qualidade parcial; mostrar dimensão |
| DATA_INVALID | Coral + losango/exclamação | Dados inválidos; pode coexistir com ENGINE OPERATIONAL |
| OFFLINE | Cinza + plug desconectado | Transporte indisponível |
| STALE | Âmbar + relógio | Dado antigo conforme fonte/engine |
| FROZEN | Âmbar + pausa | Congelamento reportado, não falta de animação |

Compatibilidade obrigatória: NO_TRADE_CONTEXT recebido deve renderizar label exato, ícone de pausa e explicação “Contexto desfavorável à exposição direcional; não é ordem”, sem convertê-lo em OFF ou DATA_INVALID. UNKNOWN/UNRESOLVED, FROZEN_VALUES e MARKET_CLOSED mantêm seu texto distinto; não colapsar MARKET_CLOSED em STALE.

Contexto, DQ e transporte são eixos independentes. Preservar seu par completo. Em OFFLINE, mostrar banner “Bridge indisponível” e último snapshot atenuado com timestamp e marca “Último conhecido”; não reapresentá-lo como atual. Nunca sobrepor UNKNOWN falso ao último contexto sem distinguir falta de transporte.

Somente cor não basta; manter ícone, label e tooltip. Contraste a validar na implementação (texto normal ≥4,5:1, contornos/ícones funcionais ≥3:1). Foco de teclado visível e ordem lógica; tooltip não pode ser a única explicação do Robot bloqueado.

## 6. Binding para Claude Code

Bridge atual loopback: http://127.0.0.1:3590.
Rotas existentes segundo o handoff: GET/HEAD /jev/v1/health, /state, /output, /audit, /robot. Esta frente não chamou endpoints nem propôs POST.

| UI | Dado existente / fallback |
|---|---|
| Motor / modo / ciclo | status, bridge.mode, bridge.cycles, bridge.last_cycle_at; distinguir falha de transporte |
| Contexto | jev.directional_context, context_reason, context_explanation, native_directional_context |
| Snapshot / sessão | jev.evaluated_at, jev.session; generated_at não substitui vendor timestamp |
| Instrumento | market_state.target quando existente; ausente “—” |
| Timeframe | Não encontrado em jev-panel/v1; “—” |
| Market / DQ | market_state, data_quality.status, per_source, dimensions, degradation_codes |
| Dealer | dealer_context.gamma_regime, nearest_above/below, put_call_dex_ratio, dex_direction, second_order_flows, vol_skew, change_transition |
| Contexto SPX | spx_context.trace_freshness, volsignals_freshness, effects, effect_on_native |
| MenthorQ | menthorq.confirmation e policy |
| Explicações | reason_codes, unresolved; conflicts no output completo se necessário |
| Robot | robot.state, can_enable, locked_reason, safety; execução/estratégia/posição não existem no panel atual |
| Agent | Sem telemetria dedicada no panel atual; NOT REPORTED |
| Auditoria | guarantees, core_comparison, versões disponíveis; sem direção final inventada |

Não criar endpoints, campos do motor ou acesso a contas para preencher o desenho. Se um dado não existir, usar fallback honesto. Não embutir fixture visual no caminho LIVE. Um único ciclo renderiza componentes a partir do mesmo snapshot; não misturar razões de um ciclo com contexto de outro.

## 7. Controles, interação e composição no NT8

- Analyzer: visão principal e leitura contínua; abrir outra aba não pausa o Shared Engine.
- Robot: status e safeguards. ON indisponível no V1, inclusive por teclado, atalhos ou restore de workspace.
- Details: dados e razões por fonte, listas virtualizadas, distinção raw/derived; não abrir dump gigante automaticamente.
- Settings: tema, tamanho da fonte, densidade e preferências de janela. Engine/bridge endereços e políticas são informação read-only no escopo visual atual.
- Logs: eventos locais e diagnóstico sanitizado, com timestamp/ciclo; nunca tokens, cookies ou payload bruto.
- Futuro ON: desenho previsto, não autorização de implementar executor. Sem atualização otimista; distinguir solicitação pendente de execução confirmada. Política de parada, ordens pendentes e posições requer contrato de execução próprio. UI não decide isso.

O AddOn atual já registra item em **Control Center → New** e abre **NTWindow**. Nome futuro do item e Caption: INVICTUS JEV CODE. Manter a janela NTWindow independente e posicionável lateralmente ao gráfico, sem prometer docking nativo em ChartTrader que não foi demonstrado no código atual. Persistir somente posição, tamanho e preferências visuais; Robot sempre inicia OFF, nunca restaurar autorização ON.

Não hospedar segundo engine dentro do NT8. Preservar poll assíncrono fora da thread UI e atualização via Dispatcher. Encerrar janela encerra sua assinatura/poll; não encerra engine, bridge ou ordens. Não instalar, não copiar para a pasta NT8, não F5 nesta entrega.

## 8. Obrigatório, opcional e aceite

Obrigatório:
- marca própria e nome exato; um Shared Engine; Robot OFF bloqueado; zero código de produção nesta entrega;
- todos os grupos solicitados, contexto sem probabilidade, UNKNOWN calmo, qualidade separada de transporte e execução;
- nenhum dado inventado; fallbacks explícitos; timestamps; efeitos SPX segregados; MenthorQ separado semanticamente;
- nenhum enum do motor alterado, nenhuma regra de classificação duplicada na UI;
- interface utilizável em 400×640, 480×960 e escalas Windows 100/150/200%.

Opcional, em fase posterior: modo claro, janela expandida, densidade compacta, atalhos de navegação, tooltips ricos e identificação visual de instrumento. Sparklines somente com série real e unidade definida; não necessárias ao design aprovado nesta frente.

Checklist de implementação futura: verificar cinco contextos + NO_TRADE; VALID/DEGRADED/DATA_INVALID e transporte/freshness; snapshot inicial/ausente; OFFLINE conserva last-known; longas listas; layout em DPI alto; agent ausente; endpoint sem fields; Robot bloqueado por todos os caminhos. ON nunca autoriza outro cálculo de contexto. Testes aqui são critérios de aceite, não executados nesta fase.

Instrução exata para Claude Code: usar este documento como especificação visual do renderer existente; reaproveitar panel-model e NTWindow. Não criar novo motor, executor ou integração de ordens. Implementação futura exige sua própria autorização. Onde contrato estiver ausente, renderizar fallback. Priorizar layout/status/contexto, depois Details/Logs e refinamentos. Preservar todos os invariantes de shared engine e do Robot V1.

## 9. Prompt integral do mockup

Ferramenta: image_gen built-in. Sem referência de imagem disponível; geração original.



```text
Use case: ui-mockup. Create a polished high-resolution product design mockup board for a native Windows desktop trading sidebar AddOn named exactly "INVICTUS JEV CODE". Own original identity, no third-party logos. Flat front-facing screenshot, no perspective, no devices, no 3D. Crisp legible typography, professional institutional trading console. Landscape 1800x1400 or comparable high resolution. Dark graphite #10151C canvas, panels #171E28, fine slate separators, warm white text, cyan accent #68CFE5, restrained brass identity accent #D0B478. Segoe UI-like typography, tabular numbers, excellent spacing and understated precision. NOT a marketing website.
Composition: left 70% a large dominant tall desktop sidebar panel at readable scale; right 30% a compact carefully organized visual state reference with small reusable badges and notes. The panel is the focus, with thin Windows window chrome title "INVICTUS JEV CODE". Header own minimalist geometric I/J mark and title "INVICTUS JEV CODE", subtitle "Market Analyzer / Robot Control Center". Small top label "DESIGN PREVIEW". All values here illustrative, not current live readings.
Header status row four evenly spaced cells: ENGINE "OPERATIONAL" with teal dot; LIVE DATA "CONNECTED" with teal dot; JEV AGENT "NOT CONNECTED" slate dot; ROBOT "OFF" with lock. Small shared-engine badge "ONE SHARED ENGINE". Do not imply agent is engine.
Navigation: Analyzer (selected, cyan underline), Robot, Details, Settings, Logs.
MARKET compact two-column row: Instrument "ES" ; Timeframe "—"; Market state "Descriptive"; Data quality amber "DEGRADED".
Prominent context card: small label "DIRECTIONAL CONTEXT", large calm pale blue-gray "UNKNOWN", normal information-circle icon not warning/error icon. Supporting text "Sem regra direcional ativa". Footer "Contexto, não ordem". No probability, no percentages, no score, no charts of confidence.
JEV NATIVE DEALER section six sleek label/value rows, with aligned columns: Gamma regime "POSITIVE_GAMMA"; Structure "Acima / abaixo do spot"; Delta positioning "UNRESOLVED"; Second-order flows "UNRESOLVED"; Vol / skew "UNRESOLVED"; Transitions "—". Gamma regime uses neutral slate styling, never long green. These are illustrative display states.
SPX FINAL CONTEXT: two columns TRACE "DEGRADED" amber and VolSignals "UNKNOWN" slate. Underneath within this same visual region a distinctly separated row "MENTHORQ / CONFIRMATION OVERLAY" value "ZERO"; small text "Positive only · Non-blocking".
ANALYSIS section with compact stacked rows "Current context   UNKNOWN", "Reason codes   Sem regra direcional ativa", "Conflicts   Ver detalhes", "Unresolved   Ver campos", "Source quality   Por fonte". Chevron disclosure affordances; no numeric made-up counts.
ROBOT section clearly physically separated in a slightly darker bordered card. Header ROBOT with prominent segmented toggle "[ OFF | ON ]": OFF selected, ON muted disabled with lock. Note "Executor ainda não operacional". Three rows: Execution "DISABLED"; Strategy "NOT AVAILABLE"; Position "UNKNOWN". Footer safeguards text "Execução bloqueada · Analyzer ativo". Do NOT show FLAT or no-position assertion. Small explanation "Analyzer e Robot usam o mesmo motor".
Panel footer subtle "Último snapshot: —" and "Ilustrativo · Sem execução".
Right reference column title "STATE SYSTEM" and subtitle "Contexto ≠ qualidade ≠ execução". Five context badges each with icon, uppercase exact names and one brief description: green up arrow LONG_CONTEXT; coral down arrow SHORT_CONTEXT; gray horizontal dash NEUTRAL_CONTEXT; amber opposing arrows CONFLICTED_CONTEXT; blue-gray information icon UNKNOWN. Below "DATA QUALITY" three badges VALID green, DEGRADED amber, DATA_INVALID red. Below "SOURCE / TRANSPORT" OFFLINE gray disconnected icon, STALE amber clock, FROZEN amber pause. Bottom small architecture drawing a single box "JEV SHARED ENGINE" branching to two equal boxes "ANALYZER" and "ROBOT · OFF"; one shared brain only. Notes "Sem probabilidades não calibradas", "OFF por padrão", "ON indisponível no V1".
Strong visual hierarchy, elegant dense information design, proportional native UI controls with 8px spacing and 6px corners, no gratuitous glow or gradients. Maintain exact brand spelling and all state enum spelling. All sections visible without clipping.
```

### Revisão localizada da imagem

Ferramenta: `image_gen` built-in, edição da imagem gerada acima.

```text
Edit this dashboard mockup with only two localized text corrections. Preserve the entire layout, design, colors, typography, all other words and panels exactly. In the ROBOT panel below the OFF/ON toggle, replace the malformed sentence with the exact Portuguese text: 'Executor ainda não operacional.' In the top status JEV AGENT tile replace 'NOT CONNECTED' with 'NOT REPORTED'. No other changes.
```

## 10. Entrega e validação

Mockup final: `handoffs/assets/INVICTUS_JEV_CODE_DASHBOARD_20260924.png`.

Inspeção visual concluída: identidade própria, cinco controles, sete áreas funcionais, estados de contexto/qualidade/transporte distinguíveis, UNKNOWN informativo, ROBOT OFF com ON bloqueado e diagrama do motor compartilhado. Corrigidos o texto do executor e o fallback NOT REPORTED do agente. A coluna direita é prancha de referência de estados, não um painel obrigatório na janela operacional. Dados exibidos são exemplos visuais; não comprovam telemetria ao vivo. A especificação e os bindings reais prevalecem sobre textos ilustrativos da imagem.

Escopo entregue: imagem e especificação de implementação para Claude Code. Nenhum código de produção, operação de mercado ou teste de instalação/F5 foi executado nesta frente.

FRONT A: COMPLETE
PRODUCT: INVICTUS JEV CODE

# OPERATOR ORDER — OLIVER_MAIN_MACHINE_PGCAP_UPDATE_20261007 (texto integral)

Recebida 2026-10-07 na sessão 132665f6 (bloqueada pelo hook ROTATED_READ_ONLY, nada executado lá); retomada pela sucessora 41f1f360 por ordem do operador.

```text
MISSÃO END-TO-END — ATUALIZAR A MÁQUINA-MÃE OLIVER PARA O PADRÃO P-GCAP
PRESERVANDO A CREDENCIAL/IDENTIDADE ATUAL

PAPEL:
Claude-JEV = único executor e decisor técnico.
ChatGPT = apenas revisor/validador.

NÃO inferir base.
NÃO assumir que OLIVER usa CANON/F1/F2/F3/F4.
NÃO trocar login.
NÃO trocar senha.
NÃO trocar device.
NÃO trocar licença.
NÃO importar identidade de outro pack.
NÃO usar MAGNUM como base.
NÃO reabrir assuntos fora do escopo.

==================================================
OBJETIVO DO OPERADOR
==================================================

Atualizar AGORA a máquina-mãe:

WINDOWS / HOST = OLIVER
NT8 PRINCIPAL = máquina operacional principal

para o formato canônico atual:

P-GCAP = VERIFIED
JEV FINAL T3 = A
req_01a119300e367e49b270d19b6447cab7

preservando integralmente:

- credencial original;
- AuthV2/identidade original;
- licença original;
- indicadores instalados;
- configurações próprias da máquina;
- contas;
- bindings;
- execução/risk não relacionados.

O resultado deve ter:

RTH_OPTIONS_API_HARD_GATE = 0
RTH_OPTIONS_API_VETO = 0
RTH_OPTIONS_API_FRESHNESS_REQUIREMENT = 0
RTH_OPTIONS_API_READINESS_REQUIREMENT = 0
EXTERNAL_API_NETWORK_REQUIRED_FOR_ENTRY = NO

e incorporar:

P-GCAP
CURRENT_CANONICAL_PRESS_VERSION = P-GCAP

==================================================
FONTES CANÔNICAS
==================================================

Auditar:

C:\Users\ADM\Downloads\Club gamma\Handof TTW
C:\Users\ADM\Desktop\Handof TTW
C:\Users\ADM\Claude-JEV\code\handoffs
C:\Users\ADM\Claude-JEV\code

Prioridade:

HANDOFF_PRESS_RECALIBRATION_30D_20261007.md
HANDOFF_GLOBAL_RTH_API_INDEPENDENCE_FIX_20261007.md
HANDOFF_PACKS_CLIENTES_INVICTUS_ATUALIZADOS_20261007.md
HANDOFF_PACK_INVICTUS_NATIVE_POINTER_20261006.md

Release final:

press-recalibration-20261007\entregas\RELEASE_PGCAP_VERIFIED_20261007.json

Final commit conhecido:
fdf4ab5

==================================================
FASE 1 — IDENTIFICAR A BASE REAL DA OLIVER
==================================================

Auditar READ-ONLY o NT8 principal da máquina OLIVER.

Inventariar os arquivos AlfaOmega/INVICTUS realmente instalados:

FILE =
PATH =
SHA256 =
MODIFIED =
SOURCE_MATCH =

Comparar contra:

- P-RTH1;
- P-GCAP CANON;
- F1/F2/F3/F4;
- packs históricos;
- versões anteriores instaladas na OLIVER.

Determinar:

OLIVER_CURRENT_BASE =
OLIVER_CURRENT_BASE_SHA =
OLIVER_CURRENT_FAMILY =
OLIVER_CURRENT_INVICUTS_VERSION =
OLIVER_CURRENT_AUTH_VERSION =
OLIVER_CURRENT_CREDENTIAL_BINDING =
OLIVER_CURRENT_DEVICE_BINDING =

NÃO inferir família pelo nome.

==================================================
FASE 2 — PROVAR QUAL PACK HISTÓRICO PERTENCE À OLIVER
==================================================

Pesquisar histórico da própria máquina:

OLIVER
ADM
main machine
máquina mãe
mother machine
principal
piloto
indicator pack
INVICTUS

Localizar:

- pack originalmente instalado;
- evolução posterior;
- login/Auth relacionado;
- indicadores que pertencem a essa máquina;
- diferenças locais intencionais.

Retornar internamente:

OLIVER_LKG_PACK =
OLIVER_LKG_SHA =
OLIVER_LKG_DATE =
OLIVER_LKG_AUTH =
OLIVER_LKG_INDICATORS =
OLIVER_LKG_INVICUTS =

==================================================
FASE 3 — NÃO CONFUNDIR COM O LOADER
==================================================

Existe achado separado:

NT8 principal carrega código legado/externo relacionado a:
NT8Loader / nt8_plugins.dll.

ISSO NÃO FAZ PARTE DESTA MISSÃO.

NÃO:
- remover;
- patchar;
- registrar;
- copiar;
- alterar;
- substituir;

esse loader nesta missão.

Apenas registrar se ele interfere MATERIALMENTE na atualização do
INVICTUS.

Se interferir:
JEV decide o tratamento mínimo.

Se não interferir:
não tocar.

==================================================
FASE 4 — PRECHECK DE SEGURANÇA
==================================================

Antes de qualquer alteração no NT8 principal:

auditar estado real:

NT8_RUNNING =
BROKER_CONNECTIONS =
OPEN_POSITIONS =
WORKING_ORDERS =
COPY_ENGINE_ACTIVE =
STRATEGY_ACTIVE =
F5_STATE =

Não desligar ou alterar nada ainda.

Pergunta ao JEV:

"Com base no estado operacional real da máquina OLIVER, qual é o
procedimento mínimo e seguro para atualizar somente a camada INVICTUS
para P-GCAP preservando sua base, Auth e configurações?"

JEV deve decidir:
- quando parar/reiniciar;
- quais arquivos substituir;
- quais preservar;
- rollback;
- se import NinjaScript é correto;
- se patch direto é incorreto;
- qualquer passo técnico.

NÃO pré-definir o método.

==================================================
FASE 5 — MATRIZ BASE OLIVER x P-GCAP
==================================================

Construir diff completo:

FILE =
OLIVER_CURRENT_SHA =
PGCAP_SHA =
ACTION =
KEEP_OLIVER
UPDATE_PGCAP
ADD
DO_NOT_TOUCH
REQUIRES_JEV

Regra:

AUTH/LOGIN/LICENSE/DEVICE =
KEEP_OLIVER

por padrão.

P-GCAP deve trazer apenas a evolução aprovada do robô e dependências
realmente necessárias.

==================================================
FASE 6 — JEV DIFF
==================================================

Montar dossier contendo:

- base real OLIVER;
- histórico;
- hashes;
- indicadores;
- Auth;
- bindings;
- estado operacional;
- P-GCAP;
- matriz de merge;
- rollback;
- risco operacional.

Pergunta:

"Qual é o merge mínimo e correto para transformar a instalação atual
da máquina-mãe OLIVER no padrão P-GCAP VERIFIED, preservando integralmente
sua identidade e sem alterar componentes não relacionados?"

Executar JEV DIFF.

Se != A:
corrigir proposta e reenviar.

NÃO retornar ao operador.

==================================================
FASE 7 — BACKUP / ROLLBACK
==================================================

Antes do patch aprovado:

criar backup versionado dos arquivos que SERÃO alterados.

Registrar:

BACKUP_PATH =
BACKUP_FILES =
BACKUP_HASHES =
ROLLBACK_TESTED =

Não copiar secrets para handoff.

==================================================
FASE 8 — APLICAR A ATUALIZAÇÃO
==================================================

Somente após JEV DIFF = A.

Aplicar exatamente o merge aprovado.

Não alterar:

- login;
- senha;
- device;
- licença;
- contas;
- indicadores não relacionados;
- parâmetros operacionais;
- stops;
- takes;
- qty;
- instrumentos;
- copy engine;
- broker configs.

Atualizar apenas o necessário para:

P-GCAP
+
API independence já aprovada.

==================================================
FASE 9 — COMPILAR E VALIDAR
==================================================

Após aplicação:

COMPILE =
CONTROL_CENTER =
INVICTUS_LOAD =
AUTH_PRESERVED =
CREDENTIAL_PRESERVED =
DEVICE_PRESERVED =
LICENSE_PRESERVED =
CONFIG_PRESERVED =

Confirmar por static/runtime:

RTH_OPTIONS_API_HARD_GATE = 0
RTH_OPTIONS_API_VETO = 0
RTH_OPTIONS_API_FRESHNESS_REQUIREMENT = 0
RTH_OPTIONS_API_READINESS_REQUIREMENT = 0
EXTERNAL_API_NETWORK_REQUIRED_FOR_ENTRY = NO

Confirmar P-GCAP:

PRESS_FORMULA =
GCAP_PRESENT =
DYNAMIC_MINFORCE =
CANONICAL_VERSION = P-GCAP

==================================================
FASE 10 — REGRESSÃO
==================================================

Executar testes sem ordens reais:

MOTOR =
ENTRY =
EXIT =
STOP =
TAKE =
PROTECTION =
SESSION =
CONFIG =
AUTH =
CONTROL_CENTER =
API_INDEPENDENCE =
PGCAP =

ORDERS = 0
F5 = 0

==================================================
FASE 11 — GERAR PACK ESPECÍFICO OLIVER
==================================================

Além da instalação atualizada, gerar um pack de recuperação/distribuição
específico da máquina-mãe OLIVER.

Nome deve ser decidido pelo padrão existente, mas deve ficar inequívoco:

OLIVER
P-GCAP
VERIFIED

Preservar a família/base correta.

Registrar:

OLIVER_NEW_IMPORT =
OLIVER_NEW_IMPORT_SHA =
OLIVER_NEW_DELIVERY =
OLIVER_NEW_DELIVERY_SHA =

Esse pack deve poder reconstruir a mesma configuração AlfaOmega da
máquina OLIVER sem trocar a identidade/credencial histórica.

NÃO embutir senha.

==================================================
FASE 12 — JEV FINAL
==================================================

Depois da atualização + testes:

JEV FINAL específico OLIVER.

Pergunta:

"A máquina-mãe OLIVER está corretamente atualizada para o padrão
P-GCAP VERIFIED, sem dependência obrigatória de opções/APIs para entrada,
preservando sua Auth, credencial e configuração operacional?"

Objetivo:

JEV_FINAL_DECISION = A

Se != A:
corrigir e retestar.

==================================================
FASE 13 — HANDOFF
==================================================

Atualizar:

HANDOFF_PRESS_RECALIBRATION_30D_20261007.md
HANDOFF_PACKS_CLIENTES_INVICTUS_ATUALIZADOS_20261007.md
HANDOFF_PACK_INVICTUS_NATIVE_POINTER_20261006.md

e cópias canônicas em:

C:\Users\ADM\Desktop\Handof TTW
C:\Users\ADM\Downloads\Club gamma\Handof TTW

Criar seção:

OLIVER_MAIN_MACHINE_PGCAP_UPDATE_20261007

Registrar:

- base anterior;
- hashes;
- merge;
- backup;
- JEV DIFF;
- testes;
- nova versão;
- pack OLIVER;
- hashes;
- JEV FINAL.

==================================================
FASE 14 — PASTA FINAL DE PACKS
==================================================

Após JEV FINAL A, adicionar também o pack OLIVER atualizado à pasta:

C:\Users\ADM\Downloads\Telegram Desktop\invictus pack 1000

Sem substituir os 12 packs atuais.

Recalcular SHA.

Atualizar:

MANIFEST_PACOTES_INVICTUS_PGCAP_20261007.txt

com nova entrada:

CLIENT = OLIVER_MAIN_MACHINE
STATUS = VERIFIED_PGCAP

==================================================
REGRA DE FINALIZAÇÃO
==================================================

NÃO retornar:

IN_PROGRESS
PARTIAL
ROTATED
AUDIT_COMPLETE
BUILD_PENDING
TEST_PENDING
JEV_PENDING

Se houver rotação:
handoff + sucessora continua automaticamente.

Só retornar quando 100% concluído.

==================================================
RETORNO FINAL
==================================================

STATUS = COMPLETE_AND_VERIFIED

OLIVER_CURRENT_BASE =
OLIVER_CURRENT_FAMILY =
OLIVER_PREVIOUS_INVICTUS =

JEV_DIFF_DECISION = A
JEV_DIFF_REQUEST_ID =

FILES_CHANGED =
FILES_PRESERVED =

AUTH_PRESERVED = YES
CREDENTIAL_PRESERVED = YES
PASSWORD_CHANGED = NO
DEVICE_PRESERVED = YES
LICENSE_PRESERVED = YES

RTH_OPTIONS_API_HARD_GATE = 0
RTH_OPTIONS_API_VETO = 0
RTH_OPTIONS_API_FRESHNESS_REQUIREMENT = 0
RTH_OPTIONS_API_READINESS_REQUIREMENT = 0
EXTERNAL_API_NETWORK_REQUIRED_FOR_ENTRY = NO

PRESS_VERSION = P-GCAP

COMPILE = PASS
TESTS = PASS

ORDERS = 0
F5 = 0

OLIVER_NEW_IMPORT =
OLIVER_NEW_IMPORT_SHA =

OLIVER_NEW_DELIVERY =
OLIVER_NEW_DELIVERY_SHA =

OLIVER_PACK_ADDED_TO =
C:\Users\ADM\Downloads\Telegram Desktop\invictus pack 1000

JEV_FINAL_DECISION = A
JEV_FINAL_CONFIDENCE =
JEV_FINAL_REQUEST_ID =

HANDOFF_UPDATED = YES
POINTER_UPDATED = YES
FINAL_COMMIT =

FINAL_VERDICT = OLIVER_MAIN_MACHINE_PGCAP_COMPLETE_AND_VERIFIED

COMECE AGORA PELA IDENTIFICAÇÃO EXATA DA BASE INSTALADA NA OLIVER.
```

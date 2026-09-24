# nt8/ — JEV Control Center AddOn (SOURCE ONLY)

**Estado:** código-fonte no repositório. **NÃO instalado no NinjaTrader 8, NÃO compilado no NT8 (F5 NOT PERFORMED).**

- `AddOns/JevControlCenter.cs`: Analyzer somente leitura. Lê `http://127.0.0.1:3590/jev/v1/state` da JEV Bridge. Não usa nenhuma API de conta ou ordem. O robô fica travado OFF.
- `check/JevControlCenter.check.csproj`: verificação de compilação **fora** do NT8 (`npm run check:nt8`). Só lê os DLLs do NT8; não copia nada para lá.

## Instalação futura (NÃO executada; exige ordem explícita do operador)

1. Com o NT8 fechado ou aberto, copiar `AddOns/JevControlCenter.cs` para `Documents\NinjaTrader 8\bin\Custom\AddOns\`.
2. No NT8, abrir o NinjaScript Editor e compilar (F5).
3. Iniciar a bridge: `npm run serve`.
4. No NT8: Control Center → New → **JEV Control Center**.

Remover = apagar o arquivo de `bin\Custom\AddOns` e recompilar. O AddOn não mantém estado, não grava arquivos e não interage com contas.

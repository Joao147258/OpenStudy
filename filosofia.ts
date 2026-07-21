// ─── Plugin: Injeção da Filosofia de Interação ──────────────────
// Objetivo: Carregar o arquivo filosofia.md como instrução de
// sistema em TODA sessão do OpenCode, sem precisar carregar
// skill manualmente.
//
// Arquitetura: A função exportada recebe PluginInput do OpenCode
// e retorna hooks. Aqui usamos apenas o hook `config` — executado
// uma vez na inicialização — para adicionar o caminho do arquivo
// ao array `instructions` da config.
//
// O OpenCode lê automaticamente o conteúdo de cada arquivo em
// `instructions` e inclui no system prompt do agente. Se o
// arquivo mudar, o OpenCode detecta e recarrega (hot-reload).

import type { Plugin } from "@opencode-ai/plugin"
// resolve(): transforma caminhos relativos/"~" em absolutos,
// independente do SO. Garante que o caminho funcione mesmo
// que o OpenCode rode em diretórios diferentes.
import { resolve } from "node:path"

// ─── Caminho do arquivo de filosofia ──────────────────────────────
// Usamos import.meta.dirname para resolver o caminho relativo ao
// próprio plugin. Isso permite que o repositório seja clonado em
// qualquer local, sem hardcodar caminhos absolutos.
// Bun e Node 21+ suportam import.meta.dirname nativamente.
const FILOSOFIA_PATH = resolve(
  import.meta.dirname,
  "filosofia.md"
)

// ─── Exportação padrão (factory do plugin) ─────────────────────
// O OpenCode chama esta função passando o PluginInput
// (client, project, directory, worktree, serverUrl, $).
// O tipo `Plugin` (via satisfies) garante que o retorno
// está no formato esperado — se faltar algo, o TS grita
// em tempo de compilação, não em runtime.
export default (async (_input) => {
  // Neste plugin não usamos o input — só precisamos injetar
  // o caminho da filosofia. Plugins mais complexos (como o
  // estudo.ts) usam input.client para acessar o SDK.

  return {
    // ─── Hook: config ──────────────────────────────────────────
    // Quando dispara: UMA vez, na inicialização, depois que
    // todas as configs (global, projeto, env, managed) foram
    // merged. O objeto `cfg` é o Config completo e MUTÁVEL —
    // alterações aqui são usadas pelo OpenCode.
    //
    // O que fazemos: adicionamos o caminho do filosofia.md ao
    // array `instructions`. O OpenCode lê o conteúdo do arquivo
    // e inclui no system prompt do agente automaticamente.
    // async: o tipo Plugin espera Promise<void> em todos os hooks.
    // Mesmo sem await interno, declarar como async satisfaz o tipo.
    async config(cfg) {
      // Garante que o array existe (pode ser undefined se
      // nenhuma config anterior definiu instructions)
      cfg.instructions = cfg.instructions || []

      // Evita duplicação: se outra config ou execução anterior
      // já adicionou este caminho, não repetimos
      if (!cfg.instructions.includes(FILOSOFIA_PATH)) {
        cfg.instructions.push(FILOSOFIA_PATH)
      }
    },
  }
  // satisfies Plugin: verifica conformidade com o tipo Plugin
  // sem alterar o tipo inferido. É validação, não coerção.
}) satisfies Plugin

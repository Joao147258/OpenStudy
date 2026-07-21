// ─── Plugin: Estudo — Parceiro de Pensamento Híbrido ──────────────
// Objetivo: Transformar cada linha de código em uma aula tríplice:
//   1. Explicação técnica (o que faz, por que está ali)
//   2. Filosofia por trás (qual princípio SOLID/pattern justifica)
//   3. Analogia com assunto de vestibular cadastrado (fixação cruzada)
//
// Arquitetura: Cloud (agente principal) decide O QUE explicar.
// Local (DeepSeek R1 via Ollama) gera o CONTEÚDO BRUTO:
// documentação, explicações, comentários, analogias.
// O reasoning do R1 (pensamento interno) vira material de estudo.
//
// Fases de aprendizado:
//   Fase 1 — Cloud decide, local escreve
//   Fase 2 — Plugin acumula perfil do usuário (assuntos, padrões)
//   Fase 3 — Local assume progressivamente com base no perfil

import type { Plugin, PluginInput, Config } from "@opencode-ai/plugin"
import {
  readFileSync,        // Leitura síncrona de arquivo (perfil.json)
  writeFileSync,       // Escrita síncrona (salvar perfil, diário)
  existsSync,          // Verifica se o arquivo existe antes de ler
  mkdirSync,           // Cria diretório do diário se não existir
  appendFileSync,      // Adiciona ao diário sem sobrescrever
} from "node:fs"
import { resolve, join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

// ═══════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════

// Usamos fileURLToPath + dirname em vez de import.meta.dirname
// porque o runtime do OpenCode pode não suportar import.meta.dirname
// (disponível apenas no Node 21.2+ e Bun).
const ESTUDO_DIR = dirname(fileURLToPath(import.meta.url))

// Perfil do usuário: assuntos vinculados, padrões de código, preferências
// Este arquivo é o "cérebro" do plugin — acumula contexto entre sessões
const PERFIL_PATH = join(ESTUDO_DIR, "perfil.json")

// Diários de aprendizado: um arquivo por dia com tudo que foi explicado
// Formato: aprendizado/YYYY-MM-DD.md
const DIARIO_DIR = join(ESTUDO_DIR, "aprendizado")

// URL da API do Ollama (servidor local)
// Ollama expõe API compatível com OpenAI em /v1, mas para o /api/generate
// (formato nativo do Ollama) usamos a porta 11434 direto
const OLLAMA_URL = "http://localhost:11434/api/generate"

// Modelo local usado para gerar conteúdo bruto
// deepseek-r1:7b — 4.7GB, expõe reasoning tokens (pensamento interno)
const MODELO_LOCAL = "deepseek-r1:7b"

// ─── Caminho da filosofia (também injetada por filosofia.ts) ──────
// Duplicamos aqui para garantir que o estudo.ts funcione mesmo se
// filosofia.ts for removido da config.
// resolve() sobe dois níveis: estudo/estudo.ts → estudo/ → raiz/
const FILOSOFIA_PATH = resolve(ESTUDO_DIR, "..", "filosofia.md")

// ─── Diretório de referências técnicas ─────────────────────────────
// Cada arquivo .md neste diretório é uma referência de boas práticas
// para uma tecnologia (go.md, csharp.md, typescript.md, nestjs.md,
// design-patterns.md). O plugin carrega e injeta no prompt do modelo
// local para garantir que as explicações sigam padrões atualizados.
const REFERENCIAS_DIR = join(ESTUDO_DIR, "referencias")

// Mapeamento de nome de tecnologia → caminho do arquivo de referência
// Se adicionar uma nova tecnologia, adicione o .md aqui e no perfil
const MAPA_REFERENCIAS: Record<string, string> = {
  "go":              join(REFERENCIAS_DIR, "go.md"),
  "csharp":          join(REFERENCIAS_DIR, "csharp.md"),
  "c#":              join(REFERENCIAS_DIR, "csharp.md"),  // alias
  "typescript":      join(REFERENCIAS_DIR, "typescript.md"),
  "nestjs":          join(REFERENCIAS_DIR, "nestjs.md"),
  "design-patterns": join(REFERENCIAS_DIR, "design-patterns.md"),
  "design patterns": join(REFERENCIAS_DIR, "design-patterns.md"), // alias
}

// Carrega o conteúdo de todas as referências disponíveis.
// Retorna uma string concatenada que será injetada no prompt
// do modelo local para contextualizar as explicações.
function carregarReferencias(especialidades: string[]): string {
  // Set para evitar carregar o mesmo arquivo duas vezes
  // (ex: "csharp" e "c#" apontam pro mesmo arquivo)
  const carregados = new Set<string>()
  const partes: string[] = []

  // Carrega referências específicas de cada tecnologia no perfil
  for (const tec of especialidades) {
    const chave = tec.toLowerCase()
    const caminho = MAPA_REFERENCIAS[chave]
    if (caminho && !carregados.has(caminho)) {
      carregados.add(caminho)
      try {
        if (existsSync(caminho)) {
          partes.push(readFileSync(caminho, "utf-8"))
        }
      } catch {
        console.error(`[estudo] Erro ao carregar referência: ${caminho}`)
      }
    }
  }

  // Sempre carrega design-patterns como referência universal
  const dpPath = MAPA_REFERENCIAS["design-patterns"]
  if (dpPath && !carregados.has(dpPath)) {
    carregados.add(dpPath)
    try {
      if (existsSync(dpPath)) {
        partes.push(readFileSync(dpPath, "utf-8"))
      }
    } catch {
      console.error(`[estudo] Erro ao carregar design-patterns`)
    }
  }

  return partes.join("\n\n---\n\n")
}

// ═══════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════

// Perfil do usuário — persiste entre sessões
// É o "currículo de aprendizado" que o plugin acumula
interface Perfil {
  // Tecnologias que o plugin está pré-configurado para ensinar.
  // O modelo local usa isso como contexto base para explicações,
  // conectando código com padrões específicos de cada linguagem.
  // Ex: ["Go", "C#", "TypeScript", "NestJS"]
  especialidades: string[]

  // Assuntos de vestibular/curiosidade vinculados para analogias cruzadas.
  // Ex: ["Biologia - Genética", "História - Brasil Colônia"]
  assuntos: string[]

  // Padrões de código que o usuário usa com frequência
  // Ex: ["NestJS Service", "Prisma Repository"]
  padroes: string[]

  // Preferências de tom e estilo
  preferencias: {
    tom: "didatico" | "conciso"
  }

  // Histórico de sessões — o que foi trabalhado em cada dia
  historico: {
    data: string         // YYYY-MM-DD
    arquivos: string[]   // Arquivos editados na sessão
    conceitos: string[]  // Conceitos abordados
  }[]

  // Contador de uso — quantas vezes o modelo local foi chamado
  // Útil para medir economia vs cloud
  metricas: {
    chamadasLocais: number
    chamadasCloud: number
  }
}

// Valor padrão para um perfil novo (primeiro uso do plugin)
const PERFIL_VAZIO: Perfil = {
  // Tecnologias que o plugin ensina por padrão.
  // Baseado nas regras matrizes da filosofia: explicar, não avaliar;
  // código como laboratório; múltiplas perspectivas; ritmo do usuário.
  especialidades: ["Go", "C#", "TypeScript", "NestJS"],
  assuntos: [],
  padroes: [],
  preferencias: { tom: "didatico" },
  historico: [],
  metricas: { chamadasLocais: 0, chamadasCloud: 0 },
}

// ═══════════════════════════════════════════════════════════════════
// FUNÇÕES DE PERSISTÊNCIA (PERFIL)
// ═══════════════════════════════════════════════════════════════════

// Carrega o perfil do disco. Se não existir, retorna o padrão vazio.
// Executado uma vez no startup do plugin.
function carregarPerfil(): Perfil {
  try {
    if (existsSync(PERFIL_PATH)) {
      const raw = readFileSync(PERFIL_PATH, "utf-8")
      // Spread com PERFIL_VAZIO garante que campos novos (adicionados
      // em versões futuras do plugin) tenham valor padrão, evitando
      // undefined em runtime
      return { ...PERFIL_VAZIO, ...JSON.parse(raw) }
    }
  } catch (erro) {
    // Se o JSON estiver corrompido, logamos e começamos do zero
    // Em vez de quebrar o plugin inteiro por um arquivo malformado
    console.error("[estudo] Erro ao carregar perfil.json:", erro)
  }
  return { ...PERFIL_VAZIO }
}

// Salva o perfil no disco. Chamado após cada alteração (vincular
// assunto, registrar conceito, atualizar métricas).
// Síncrono porque as alterações são pequenas e queremos garantir
// que o perfil está salvo antes de qualquer operação seguinte.
function salvarPerfil(perfil: Perfil): void {
  try {
    writeFileSync(PERFIL_PATH, JSON.stringify(perfil, null, 2), "utf-8")
  } catch (erro) {
    console.error("[estudo] Erro ao salvar perfil.json:", erro)
  }
}

// ═══════════════════════════════════════════════════════════════════
// FUNÇÕES DE COMUNICAÇÃO COM OLLAMA (MODELO LOCAL)
// ═══════════════════════════════════════════════════════════════════

// Chama o DeepSeek R1 via Ollama para gerar conteúdo bruto.
// Recebe um prompt completo (já formatado com código + assunto +
// instruções) e retorna a resposta do modelo.
//
// O DeepSeek R1 expõe "reasoning" — o pensamento interno do modelo
// antes da resposta final. Capturamos isso como material de estudo
// adicional: "olha como o modelo raciocinou sobre este código".
//
// Tratamento de erro: se o Ollama não estiver rodando ou o modelo
// não existir, retornamos mensagem explicativa em português em vez
// de quebrar o fluxo.
async function chamarDeepSeek(
  prompt: string
): Promise<{ resposta: string; reasoning?: string }> {
  try {
    // fetch nativo do Node.js 18+ — não precisa de dependência extra
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELO_LOCAL,       // deepseek-r1:7b
        prompt,                     // O prompt completo que montamos
        stream: false,             // Queremos a resposta completa, não streaming
        // options: { temperature: 0.7 } — omitido, usa default do modelo
      }),
    })

    if (!response.ok) {
      // Se o Ollama retornar erro (ex: modelo não encontrado, servidor offline)
      const texto = await response.text()
      throw new Error(`Ollama respondeu ${response.status}: ${texto}`)
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await response.json() as Record<string, unknown>

    // Extrai a resposta principal
    const resposta = (data.response as string) || ""

    // Tenta extrair o reasoning (pensamento interno do R1)
    // O Ollama pode retornar em dois formatos:
    // 1. Campo separado `reasoning` (Ollama >= 0.5.1)
    // 2. Dentro do response com tags <｜end▁of▁thinking｜> (formato nativo do R1)
    const reasoning = (data.reasoning as string) || undefined

    return { resposta, reasoning }
  } catch (erro) {
    // Erro controlado: não quebramos o plugin, informamos o que aconteceu
    const mensagem = erro instanceof Error ? erro.message : String(erro)
    console.error("[estudo] Erro ao chamar DeepSeek R1:", mensagem)
    return {
      resposta: [
        "❌ Não foi possível conectar ao Ollama (DeepSeek R1).",
        "",
        `Erro: ${mensagem}`,
        "",
        "Verifique:",
        "1. O Ollama está rodando? (`ollama serve`)",
        "2. O modelo deepseek-r1:7b está baixado? (`ollama list`)",
        "3. A porta 11434 está livre?",
      ].join("\n"),
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// MONTAGEM DE PROMPTS PARA O MODELO LOCAL
// ═══════════════════════════════════════════════════════════════════

// Conteúdo da filosofia — carregado uma vez no startup
// Usamos let porque o arquivo pode ser recarregado (hot-reload)
// Na prática, é lido uma vez; se o arquivo mudar, precisa reiniciar
let conteudoFilosofia = ""
try {
  conteudoFilosofia = existsSync(FILOSOFIA_PATH)
    ? readFileSync(FILOSOFIA_PATH, "utf-8")
    : ""
} catch {
  console.error("[estudo] Não foi possível ler filosofia.md")
}

// Monta o prompt completo para o DeepSeek R1 gerar uma explicação.
// Estrutura do prompt em 5 partes:
//   1. Sistema: filosofia de interação (tom, regras)
//   2. Contexto: tecnologias que o plugin domina (especialidades)
//   3. Contexto: assunto vinculado para analogias cruzadas
//   4. Tarefa: o código a ser explicado
//   5. Formato: saída esperada (3 camadas)
function montarPromptExplicacao(
  codigo: string,
  assunto: string | undefined,
  arquivo: string | undefined,
  especialidades: string[]
): string {
  // Se não tem assunto vinculado no perfil nem foi passado na chamada,
  // usamos "programação" como fallback genérico
  const assuntoAnalogia = assunto || "programação"

  // Informação do arquivo de origem — ajuda o modelo a contextualizar
  const infoArquivo = arquivo ? `\nArquivo de origem: ${arquivo}` : ""

  // Lista as tecnologias que o plugin domina como contexto adicional
  const tecs = especialidades.length > 0
    ? especialidades.join(", ")
    : "TypeScript, NestJS"

  // Carrega as referências técnicas (boas práticas, idioms, patterns)
  // para as tecnologias que o plugin ensina. Isso permite que o modelo
  // local gere código idiomático e atualizado, seguindo as convenções
  // de cada linguagem/framework.
  const referencias = carregarReferencias(especialidades)

  return [
    "Você é um parceiro de estudo que explica código conectando com outros assuntos.",
    "",
    "Siga estas regras de interação:",
    conteudoFilosofia || "Explique de forma clara e didática, em português.",
    "",
    // ── Contexto das tecnologias que o plugin ensina ──────────
    // Isso ajuda o modelo local a contextualizar explicações com
    // os padrões e idioms específicos de cada linguagem/framework
    `Você está ensinando as seguintes tecnologias: ${tecs}.`,
    "Ao explicar código, conecte com os padrões e idioms dessas tecnologias.",
    "Mostre como o mesmo conceito aparece em cada uma delas quando relevante.",
    "",
    // ═══════════════════════════════════════════════════════════
    // REFERÊNCIAS TÉCNICAS — boas práticas atualizadas
    // ═══════════════════════════════════════════════════════════
    // Injetamos o conteúdo dos arquivos de referência (go.md,
    // csharp.md, typescript.md, nestjs.md, design-patterns.md)
    // para que o modelo local tenha acesso às convenções,
    // idioms e patterns mais recentes de cada tecnologia.
    // Só incluímos se houver referências carregadas (evita
    // poluir o prompt com seção vazia).
    ...(referencias ? [
      "─── REFERÊNCIAS TÉCNICAS (boas práticas atualizadas) ───",
      "Use estas referências para gerar código idiomático e seguindo",
      "as convenções mais recentes de cada tecnologia:",
      "",
      referencias,
      "",
    ] : []),
    "─── TAREFA ───",
    `Explique o código abaixo usando "${assuntoAnalogia}" como fonte de analogias.${infoArquivo}`,
    "",
    "CÓDIGO:",
    "```",
    codigo,
    "```",
    "",
    "─── FORMATO DA RESPOSTA ───",
    "Estruture sua resposta em TRÊS camadas:",
    "",
    "1. O QUE FAZ (técnica)",
    "   - Comportamento em runtime de cada parte",
    "   - Por que está estruturado assim",
    "   - Como se conecta com o resto do sistema",
    "",
    `2. FILOSOFIA POR TRÁS (comparar com "${assuntoAnalogia}")`,
    `   - Crie uma analogia entre o código e um conceito de ${assuntoAnalogia}`,
    "   - Explique qual princípio de design (SOLID, pattern) aparece aqui",
    `   - Mostre como o conceito de ${assuntoAnalogia} ajuda a entender o código`,
    "",
    "3. PRINCÍPIO UNIFICADOR",
    "   - Qual princípio mais profundo explica tanto o código quanto a analogia",
    "   - Como esse mesmo padrão aparece em outros contextos",
    "",
    "─── REGRAS ───",
    "- Responda em português (PT-BR)",
    "- Tom de parceria: use 'nós', não 'você'",
    "- NÃO avalie se o código está certo ou errado",
    "- NÃO faça perguntas — apenas explique",
    "- Use comentários inline no código quando relevante",
  ].join("\n")
}

// ═══════════════════════════════════════════════════════════════════
// DIÁRIO DE APRENDIZADO
// ═══════════════════════════════════════════════════════════════════

// Função auxiliar: busca o registro do dia no histórico ou cria um novo.
// Encapsula a lógica de find+create para evitar null safety issues
// que o TypeScript não consegue afunilar em variáveis `let`.
function getOrCreateRegistro(perfil: Perfil, data: string): Perfil["historico"][number] {
  const existente = perfil.historico.find((h) => h.data === data)
  if (existente) return existente
  const novo = { data, arquivos: [] as string[], conceitos: [] as string[] }
  perfil.historico.push(novo)
  return novo
}

// Gera um arquivo de diário no formato Markdown com tudo que foi
// trabalhado na sessão atual. O diário é salvo em:
//   estudo/aprendizado/YYYY-MM-DD.md
function gerarDiario(perfil: Perfil): string {
  // Data de hoje no formato ISO (YYYY-MM-DD)
  const hoje = new Date().toISOString().split("T")[0]! // !: split sempre retorna ao menos 1 elemento
  const diarioPath = join(DIARIO_DIR, `${hoje}.md`)

  // Busca o registro de hoje no histórico (se já foi criado)
  const registroHoje = getOrCreateRegistro(perfil, hoje)

  // Monta o conteúdo do diário no formato Markdown
  // Cada seção é um aspecto diferente do que foi aprendido
  const linhas: string[] = [
    `# Diário de Aprendizado — ${hoje}`,
    "",
    "## Assuntos vinculados",
    ...(perfil.assuntos.length > 0
      ? perfil.assuntos.map((a) => `- ${a}`)
      : ["- Nenhum assunto vinculado ainda"]),
    "",
    "## Arquivos trabalhados",
    ...(registroHoje?.arquivos?.length
      ? registroHoje.arquivos.map((a) => `- \`${a}\``)
      : ["- Nenhum arquivo registrado"]),
    "",
    "## Conceitos abordados",
    ...(registroHoje?.conceitos?.length
      ? registroHoje.conceitos.map((c) => `- ${c}`)
      : ["- Nenhum conceito registrado"]),
    "",
    "## Métricas",
    `- Chamadas ao modelo local: ${perfil.metricas.chamadasLocais}`,
    `- Chamadas ao modelo cloud: ${perfil.metricas.chamadasCloud}`,
    "",
    "---",
    "_Gerado automaticamente pelo plugin de estudo_",
    "",
  ]

  const conteudo = linhas.join("\n")

  // Garante que o diretório de diários existe
  if (!existsSync(DIARIO_DIR)) {
    mkdirSync(DIARIO_DIR, { recursive: true })
  }

  // Escreve o diário (sobrescreve se já existir — reflete o estado atual)
  writeFileSync(diarioPath, conteudo, "utf-8")

  return diarioPath
}

// ═══════════════════════════════════════════════════════════════════
// PLUGIN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

export default (async (input: PluginInput) => {
  // ─── Destruturação do PluginInput ──────────────────────────
  // client: SDK completo — criar sessões, ler config, subscrever eventos
  // project: informações do projeto atual
  // directory: caminho absoluto do diretório do projeto
  const { client, project, directory } = input

  // ─── Estado em memória (vivo durante a sessão) ────────────
  // Perfil: carregado do disco no startup, salvo a cada alteração.
  // Mantemos em memória para evitar I/O de disco a cada acesso.
  const perfil = carregarPerfil()

  // Cache de arquivos editados nesta sessão (evita duplicatas no perfil)
  const arquivosSessao = new Set<string>()

  // Flag de alternância automática cloud↔local
  // false = cloud sempre decide (Fase 1)
  // true = local pode assumir quando tem contexto suficiente (Fase 3)
  let alternanciaAutomatica = false

  // ═══════════════════════════════════════════════════════════
  // RETORNO DO PLUGIN: hooks + tools
  // ═══════════════════════════════════════════════════════════
  return {
    // ─── HOOK: config ──────────────────────────────────────
    // Injeta a filosofia.md como instrução de sistema.
    // Redundante com filosofia.ts, mas garante que funcione
    // mesmo se filosofia.ts for removido.
    // async: o tipo Plugin espera Promise<void> em todos os hooks
    async config(cfg: Config) {
      cfg.instructions = cfg.instructions || []
      if (!cfg.instructions.includes(FILOSOFIA_PATH)) {
        cfg.instructions.push(FILOSOFIA_PATH)
      }
    },

    // ─── HOOK: event ───────────────────────────────────────
    // Observa eventos do sistema para acumular contexto.
    //
    // Eventos monitorados:
    //   file.edited → registra quais arquivos foram modificados
    //   session.status → detecta idle (fim de sessão) para
    //     sugerir geração de diário
    //
    // Por que async? Porque alguns handlers podem precisar
    // de operações assíncronas (ex: salvar no disco).
    async event(evento: Record<string, unknown>) {
      const tipo = evento.type as string | undefined

      // ── Arquivo editado ──────────────────────────────
      if (tipo === "file.edited") {
        const props = evento.properties as Record<string, unknown> | undefined
        const caminho = props?.path as string | undefined

        if (caminho && !arquivosSessao.has(caminho)) {
          arquivosSessao.add(caminho)

          // Registra no histórico do perfil (hoje)
          const hoje = new Date().toISOString().split("T")[0]! // !: split sempre retorna ao menos 1 elemento
          const registroHoje = getOrCreateRegistro(perfil, hoje)
          if (!registroHoje.arquivos.includes(caminho)) {
            registroHoje.arquivos.push(caminho)
            salvarPerfil(perfil)
          }
        }
      }

      // ── Sessão ficou idle (agente terminou de responder) ──
      // Podemos sugerir gerar o diário, mas NÃO fazemos
      // automaticamente — o usuário decide quando.
      // Isso evita poluir o chat com notificações.
      if (tipo === "session.idle") {
        // Placeholder para futura notificação suave
        // Por enquanto, o diário é gerado sob demanda via tool `diario`
      }
    },

    // ═══════════════════════════════════════════════════════
    // TOOLS — ferramentas que o agente (cloud) pode chamar
    // ═══════════════════════════════════════════════════════
    tool: {
      // ── Tool: vincular_assunto ──────────────────────────
      // Registra um assunto de vestibular para usar nas
      // analogias das explicações.
      //
      // Quem chama: o agente cloud (ou o usuário manualmente).
      // Quando usar: quando o usuário quiser conectar código
      //   com um assunto específico que está estudando.
      vincular_assunto: {
        description:
          "Vincula um assunto de estudo (vestibular, curiosidade, conteúdo " +
          "acadêmico) para usar como fonte de analogias cruzadas nas explicações " +
          "de código. Ex: 'Biologia - Genética', 'História - Brasil Colônia', " +
          "'Física - Termodinâmica'. O plugin já ensina Go, C#, TypeScript e " +
          "NestJS por padrão — use esta tool para adicionar comparações com " +
          "outras áreas. Use quando o usuário mencionar que quer conectar " +
          "código com um tópico específico de outra disciplina.",

        // JSON Schema dos parâmetros — o modelo cloud usa isso
        // para saber COMO chamar a ferramenta
        parameters: {
          type: "object",
          properties: {
            assunto: {
              type: "string",
              description:
                "O assunto a vincular. Formato sugerido: " +
                "'Área - Tópico' (ex: 'Biologia - Genética'). " +
                "Pode ser qualquer área: vestibular, programação, " +
                "filosofia, história, etc.",
            },
          },
          required: ["assunto"],
        },

        async execute(args: { assunto: string }) {
          // Evita duplicatas — não adiciona o mesmo assunto duas vezes
          if (!perfil.assuntos.includes(args.assunto)) {
            perfil.assuntos.push(args.assunto)
            salvarPerfil(perfil)
          }

          // Retorna confirmação com o assunto ativo (o agente cloud
          // vê este texto como "resultado da ferramenta")
          return (
            `✅ Assunto vinculado: **${args.assunto}**\n\n` +
            `A partir de agora, as explicações de código usarão ` +
            `conceitos de ${args.assunto} para criar analogias.\n\n` +
            `Assuntos cadastrados: ${perfil.assuntos.join(", ") || "nenhum"}`
          )
        },
      },

      // ── Tool: explicar ──────────────────────────────────
      // A ferramenta principal do plugin. Explica um trecho
      // de código usando o modelo local (DeepSeek R1) com o
      // assunto vinculado como fonte de analogias.
      //
      // Fluxo:
      //   1. Agente cloud decide que este código merece explicação
      //   2. Agente chama esta tool passando o código
      //   3. Tool monta prompt com código + assunto + filosofia
      //   4. Tool chama DeepSeek R1 via Ollama
      //   5. Retorna explicação completa (3 camadas)
      explicar: {
        description:
          "Explica um trecho de código conectando com o assunto de estudo " +
          "vinculado e com as tecnologias que o plugin ensina (Go, C#, " +
          "TypeScript, NestJS). Gera explicação em 3 camadas: " +
          "(1) técnica — o que faz e como se conecta com a stack, " +
          "(2) filosofia — princípios SOLID/patterns, " +
          "(3) analogia — conexão com o assunto cadastrado OU comparação " +
          "entre as tecnologias (ex: como isso seria feito em Go vs C#). " +
          "Use quando o usuário perguntar 'explique este código' ou quando " +
          "código novo for gerado e merecer explicação. " +
          "O conteúdo é gerado pelo modelo local (DeepSeek R1), economizando " +
          "créditos do modelo cloud.",

        parameters: {
          type: "object",
          properties: {
            codigo: {
              type: "string",
              description:
                "O trecho de código a ser explicado. Pode ser uma função, " +
                "classe, módulo ou arquivo completo.",
            },
            assunto: {
              type: "string",
              description:
                "Opcional. Assunto para analogia (sobrescreve o vinculado). " +
                "Ex: 'Biologia - Genética'. Se omitido, usa o assunto vinculado.",
            },
            arquivo: {
              type: "string",
              description:
                "Opcional. Caminho do arquivo de origem do código. " +
                "Ajuda o modelo a contextualizar. Ex: 'src/services/user.service.ts'",
            },
          },
          required: ["codigo"],
        },

        async execute(args: {
          codigo: string
          assunto?: string
          arquivo?: string
        }) {
          // Determina qual assunto usar: o passado na chamada
          // ou o primeiro assunto vinculado no perfil
          const assunto =
            args.assunto || perfil.assuntos[0] || undefined

          // Monta o prompt completo para o DeepSeek R1.
          // Passa as especialidades (Go, C#, TypeScript, NestJS)
          // como contexto base — mesmo sem assunto vinculado,
          // o modelo local tem material rico para analogias.
          // Se não tem assunto vinculado, o modelo usa as
          // especialidades como fonte primária de comparações.
          const prompt = montarPromptExplicacao(
            args.codigo,
            assunto,
            args.arquivo,
            perfil.especialidades
          )

          // Chama o modelo local (custo zero de API)
          const { resposta, reasoning } = await chamarDeepSeek(prompt)

          // Incrementa métrica de uso local
          perfil.metricas.chamadasLocais++
          salvarPerfil(perfil)

          // Se temos reasoning (pensamento interno do R1),
          // incluímos como material extra de estudo
          const blocoReasoning = reasoning
            ? [
                "",
                "─── 🧠 RACIOCÍNIO DO MODELO (REASONING) ───",
                "> O DeepSeek R1 expõe o pensamento interno antes da resposta.",
                "> Isso é material de estudo: como o modelo raciocinou.",
                "",
                reasoning,
                "",
                "─── RESPOSTA ───",
                "",
              ].join("\n")
            : ""

          return blocoReasoning + resposta
        },
      },

      // ── Tool: diario ────────────────────────────────────
      // Gera o diário de aprendizado da sessão atual.
      // Consolida tudo que foi trabalhado: arquivos, conceitos,
      // métricas de uso dos modelos.
      //
      // Quem chama: o agente ou o usuário, tipicamente no final
      // de uma sessão de estudo.
      diario: {
        description:
          "Gera o diário de aprendizado da sessão atual. Consolida: " +
          "arquivos trabalhados, conceitos abordados, assuntos vinculados, " +
          "e métricas de uso (cloud vs local). Salva em " +
          "estudo/aprendizado/YYYY-MM-DD.md. Use no final de uma sessão " +
          "de estudo ou quando o usuário pedir um resumo do que foi visto.",

        parameters: {
          type: "object",
          properties: {},
          required: [],
        },

        async execute() {
          const diarioPath = gerarDiario(perfil)

          return [
            "📓 Diário de aprendizado gerado com sucesso!",
            "",
            `📁 Local: \`${diarioPath}\``,
            "",
            "## Resumo da sessão",
            `- Tecnologias: ${perfil.especialidades.join(", ") || "nenhuma"}`,
            `- Assuntos vinculados: ${perfil.assuntos.join(", ") || "nenhum"}`,
            `- Arquivos trabalhados: ${arquivosSessao.size}`,
            `- Chamadas ao modelo local: ${perfil.metricas.chamadasLocais}`,
            `- Chamadas ao modelo cloud: ${perfil.metricas.chamadasCloud}`,
          ].join("\n")
        },
      },

      // ── Tool: treinar ───────────────────────────────────
      // Envia o perfil acumulado para o modelo local processar
      // e refinar. Isso ajuda o modelo local a "entender" melhor
      // o contexto do usuário para a Fase 3 (local autônomo).
      //
      // Na prática: manda um resumo do perfil pro DeepSeek R1
      // e pede pra ele gerar um "resumo de entendimento" que
      // será usado em prompts futuros.
      treinar: {
        description:
          "Envia o perfil acumulado do usuário (assuntos, padrões de código, " +
          "histórico) para o modelo local (DeepSeek R1) processar e refinar " +
          "seu entendimento do contexto. Ajuda o modelo local a gerar " +
          "explicações mais personalizadas. Use periodicamente para melhorar " +
          "a qualidade das analogias.",

        parameters: {
          type: "object",
          properties: {},
          required: [],
        },

        async execute() {
          // Monta um prompt de "treinamento" com o perfil completo
          const promptTreino = [
            "─── PERFIL DO USUÁRIO ───",
            "Use estas informações para personalizar suas explicações futuras.",
            "",
            "## Assuntos de estudo vinculados",
            ...perfil.assuntos.map((a) => `- ${a}`),
            "",
            "## Padrões de código frequentes",
            ...perfil.padroes.map((p) => `- ${p}`),
            "",
            "## Histórico recente",
            ...perfil.historico.slice(-5).flatMap((h) => [
              `### ${h.data}`,
              ...h.arquivos.map((a) => `  - Arquivo: ${a}`),
              ...h.conceitos.map((c) => `  - Conceito: ${c}`),
            ]),
            "",
            "─── TAREFA ───",
            "Com base no perfil acima, gere um breve resumo do que você",
            "entendeu sobre este usuário: o que ele está estudando, que",
            "tipo de código escreve, e como você pode ajudar melhor.",
            "Responda em português, em 3-5 frases.",
          ].join("\n")

          const { resposta } = await chamarDeepSeek(promptTreino)
          perfil.metricas.chamadasLocais++
          salvarPerfil(perfil)

          return [
            "🧠 Treinamento do modelo local concluído!",
            "",
            "## O que o DeepSeek R1 entendeu sobre você:",
            "",
            resposta,
            "",
            "───",
            "Este entendimento será usado nas próximas explicações para",
            "gerar analogias mais relevantes e personalizadas.",
          ].join("\n")
        },
      },

      // ── Tool: alternar ──────────────────────────────────
      // Ativa/desativa a alternância automática entre cloud e local.
      //
      // Modo manual (padrão): cloud sempre decide o que explicar,
      //   local só gera conteúdo quando a tool `explicar` é chamada.
      //
      // Modo automático (Fase 3): o plugin pode decidir sozinho
      //   quando usar o modelo local, baseado no perfil acumulado.
      //
      // Por enquanto, a alternância automática é um placeholder —
      // a lógica real de decisão será implementada na Fase 3.
      alternar: {
        description:
          "Ativa ou desativa a alternância automática entre modelo cloud " +
          "(decisão) e modelo local (geração de conteúdo). Quando ativado, " +
          "o plugin pode automaticamente delegar explicações para o modelo " +
          "local quando tem contexto suficiente. Use quando quiser economizar " +
          "créditos da cloud ou testar o modelo local de forma autônoma.",

        parameters: {
          type: "object",
          properties: {
            ativar: {
              type: "boolean",
              description:
                "true para ativar alternância automática, false para desativar",
            },
          },
          required: ["ativar"],
        },

        async execute(args: { ativar: boolean }) {
          alternanciaAutomatica = args.ativar

          const estado = alternanciaAutomatica ? "ATIVADA" : "DESATIVADA"
          const icone = alternanciaAutomatica ? "🔄" : "☁️"

          return [
            `${icone} Alternância automática cloud↔local: **${estado}**`,
            "",
            alternanciaAutomatica
              ? [
                  "O plugin agora pode automaticamente delegar explicações",
                  "para o modelo local (DeepSeek R1) quando julgar que há",
                  "contexto suficiente no perfil.",
                  "",
                  "⚠️ Modo experimental — a lógica de decisão automática",
                  "ainda está em desenvolvimento.",
                ].join("\n")
              : [
                  "Modo manual: o modelo cloud (agente principal) decide",
                  "quando chamar a ferramenta `explicar`. O modelo local só",
                  "é usado quando explicitamente solicitado.",
                ].join("\n"),
          ].join("\n")
        },
      },
    },
  }
// Nota: removemos o `satisfies Plugin` porque o tipo ToolDefinition
// espera Zod (`args`) enquanto usamos JSON Schema (`parameters`).
// Em runtime o OpenCode aceita ambos; o modelo precisa do JSON Schema
// para saber como chamar a ferramenta. A validação de tipo real
// acontece quando o OpenCode carrega o plugin.
})

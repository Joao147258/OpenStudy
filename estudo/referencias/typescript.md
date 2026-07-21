# TypeScript — Referência de Boas Práticas

> Versão alvo: **TypeScript 5.8** | Atualizado: Julho 2026

## Filosofia

TypeScript não é uma linguagem separada — é JavaScript com tipos. Os tipos
documentam intenção, habilitam autocompletar, e pegam erros antes do runtime.
Bom código TypeScript é bom JavaScript com tipos mínimos e precisos.

## Princípios

1. **Tipos descrevem intenção, não implementação** — modele o domínio, não o algoritmo
2. **Narrowing sobre casting** — use `typeof`, `instanceof`, discriminated unions
3. **Preferir tipos inferidos** — declare tipos só onde adicionam clareza ou segurança
4. **`unknown` sobre `any`** — `any` desliga o type checker; `unknown` exige narrowing
5. **`satisfies` sobre `as`** — valida sem perder o tipo inferido literal
6. **Discriminated unions para estados** — cada variante é um estado possível

## Configuração (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "strict": true,                    // Liga TODAS as verificações estritas
    "noUncheckedIndexedAccess": true,  // undefined em acessos de índice
    "exactOptionalPropertyTypes": true,// undefined ≠ omitido
    "module": "nodenext",              // ESM moderno (Node 22+)
    "moduleResolution": "nodenext",    // Resolução ESM moderna
    "erasableSyntaxOnly": true,        // Compatível com Node --strip-types
    "verbatimModuleSyntax": true,       // Imports preservados como escritos
    "isolatedDeclarations": true,      // .d.ts paralelizável por ferramentas
    "experimentalDecorators": true,    // NestJS: @Injectable(), @Module()
    "emitDecoratorMetadata": true,     // NestJS: metadados de tipo em runtime
    "skipLibCheck": true,              // Não checa .d.ts de bibliotecas
    "forceConsistentCasingInFileNames": true
  }
}
```

### ⚠️ `nodenext`: imports exigem extensão `.js`

```typescript
// Com module: "nodenext", imports de arquivos LOCAIS precisam da extensão .js
import { AppService } from './app.service.js'  // ✅ .js mesmo sendo .ts
import { PrismaClient } from '@prisma/client'  // ✅ pacote npm, sem extensão

// Esqueceu o .js → erro em runtime: "Cannot find module './app.service'"
```

### Relaxamentos intencionais (estilo dos projetos reais)

- `noImplicitAny: false` — permite `any` implícito (útil em aprendizado)
- `strictPropertyInitialization: false` — permite propriedades sem inicializador (NestJS injeta via constructor)
- `skipLibCheck: true` — melhora performance de compilação

### TS 6.0 → breaking changes futuros

| Mudança | Impacto | Correção |
|---|---|---|
| `types` default `[]` (antes: tudo de `@types`) | Quebra imports de `@types/node`, `@types/jest` | Adicionar `"types": ["node", "jest"]` |
| `strict` default `true` | Todas as verificações estritas ligadas | Remover relaxamentos, ou desligar explicitamente |
| `module` default `esnext` | Pode quebrar `nodenext` | Manter `"module": "nodenext"` explícito |
| `esModuleInterop` não pode ser `false` | Força interoperabilidade CJS/ESM | Aceitar (já é boa prática) |
| `moduleResolution node` (node10) deprecated | Migrar para `nodenext` ou `bundler` | Já estamos em `nodenext` ✅ |

## Erros comuns (catálogo rápido)

| Erro | Causa | Solução |
|---|---|---|
| `Cannot find module './x'` | Falta `.js` no import com `nodenext` | Adicionar `.js` |
| Decorator não funciona | `experimentalDecorators: false` | Ligar `experimentalDecorators: true` |
| `Parameter 'x' implicitly has 'any'` | `noImplicitAny: true` sem tipo explícito | Adicionar tipo ou desligar a opção |
| `.d.ts` gerado mas types não funcionam | `skipLibCheck: true` escondeu erro | Checar bibliotecas específicas com `skipLibCheck: false` temporário |

## Patterns essenciais

### Discriminated unions (o pattern mais poderoso do TS)

```typescript
// Cada variante tem um tag discriminador (type: "ok" | "erro")
type Resultado<T> =
  | { type: "ok"; data: T }
  | { type: "erro"; error: string }

function processar<T>(r: Resultado<T>): string {
  switch (r.type) {
    case "ok":    return `Sucesso: ${r.data}`    // TS sabe que data existe
    case "erro":  return `Falha: ${r.error}`     // TS sabe que error existe
  }
}
```

### `satisfies` — valida sem perder inferência

```typescript
const config = {
  provider: "ollama",
  model: "deepseek-r1:7b",
  baseURL: "http://localhost:11434/v1",
} satisfies Record<string, string>
// config.provider ainda é "ollama" (literal!), não string genérica
```

### `const` type parameters

```typescript
function buscar<T, const K extends keyof T>(obj: T, chave: K): T[K] {
  return obj[chave]
}
// K é inferido como literal, não como string
```

### `NoInfer<T>` — bloqueia inferência

```typescript
declare function criar<const T extends string>(valor: NoInfer<T>): T
criar("hello") // T inferido como "hello", mas valor não influencia inferência
```

## Async patterns

```typescript
// Promise<T> com tipo de erro via Result pattern
async function buscarUsuario(id: string): Promise<Resultado<Usuario>> {
  try {
    const user = await db.usuario.findUnique({ where: { id } })
    return user
      ? { type: "ok", data: user }
      : { type: "erro", error: "Não encontrado" }
  } catch (err) {
    return { type: "erro", error: err instanceof Error ? err.message : "Erro desconhecido" }
  }
}

// Zod + discriminated union para validação na borda
const LoginDTO = z.object({
  email: z.string().email(),
  senha: z.string().min(8),
})
type LoginDTO = z.infer<typeof LoginDTO>  // tipo extraído do schema
```

## Generics — quando e como

```typescript
// Generic quando o tipo VARIA com o uso, não quando só aparece uma vez
// ✅ Bom: Repository genérico
class Repository<T extends { id: string }> {
  async buscar(id: string): Promise<T | null> { ... }
}

// ❌ Ruim: generic desnecessário
function log<T>(msg: T): void { console.log(msg) }  // T é any disfarçado
```

## Zod-first tool schemas (padrão emergente em agentes)

```typescript
import { z } from "zod"

// Define UMA vez: schema Zod → tipo TS → JSON Schema gerado
const ExplicarParams = z.object({
  codigo: z.string().describe("Trecho de código a explicar"),
  assunto: z.string().optional().describe("Assunto para analogia"),
})

// Tipo inferido automaticamente
type ExplicarParams = z.infer<typeof ExplicarParams>
```

## Evite

1. `as` casting — minta pro compilador e perca segurança. Prefira narrowing
2. `any` — é um buraco negro de tipos. Use `unknown` e faça narrowing
3. Enums do TypeScript — prefira unions de string (`"a" | "b"`) ou `as const`
4. `export default` — prefira named exports (refatoração mais segura, autocompletar)
5. Classes com herança profunda — prefira composição + interfaces
6. Módulos com namespace — o sistema de módulos ES já resolve o problema

## Ferramentas

- **tsx**: executa TypeScript sem build (Node 18+)
- **Node --experimental-strip-types**: TS nativo no Node 23+ (só sintaxe apagável)
- **tsc --newTsc**: Compilador Go (10x mais rápido, mesmo output — em preview)
- **Biome**: alternativa ao Prettier + ESLint, nativo em Rust

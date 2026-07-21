# Go — Referência de Boas Práticas

> Versão alvo: **Go 1.26** | Atualizado: Julho 2026

## Filosofia da linguagem

Go recompensa disciplina sobre esperteza. Pacotes pequenos, erros explícitos,
APIs estáveis. "Menos é mais" não é slogan — é o compilador rejeitando imports
não usados.

## Princípios fundamentais

1. **Clareza sobre esperteza** — código é lido mais vezes do que escrito
2. **Standard library como padrão** — só busque libs externas quando melhorarem
   correção, manutenibilidade ou velocidade de entrega
3. **Pacotes pequenos com responsabilidades explícitas** — evite pacotes
   "utility" que viram saco de gatos
4. **Caminhos de falha explícitos** — erros são parte da API, não ruído
5. **Meça antes de otimizar** — benchmark, profile, inspecione alocações
6. **Construa para operabilidade** — logging, métricas, tracing, health checks,
   graceful shutdown

## Estrutura de projeto (golang-standards/project-layout)

Padrão canônico da comunidade Go. Não é obrigatório, mas é o layout que projetos
grandes convergem naturalmente. Regra de ouro: **comece com um `main.go`, adicione
diretórios conforme a dor aparecer**. Não crie estrutura antes do código.

```
meu-projeto/
  # ── Diretórios Go ──────────────────────────────────────
  cmd/                    # Entry points. Um subdir por executável
    meu-app/
      main.go             # Função main() FINA: só importa e invoca internal/
  internal/               # Código PRIVADO. Compilador Go IMPEDE imports externos
    app/                  # Código da aplicação (opcional, organiza projetos maiores)
      meu-app/
    pkg/                  # Código compartilhado ENTRE aplicações internas
  pkg/                    # Código PÚBLICO. Bibliotecas que outros projetos importam
    minhalib/             # Pense 2x antes de colocar aqui: vira contrato público
  vendor/                 # Dependências (go mod vendor). Não versionar em bibliotecas

  # ── Aplicações de serviço ──────────────────────────────
  api/                    # OpenAPI/Swagger, JSON Schema, definições de proto

  # ── Aplicações web ─────────────────────────────────────
  web/                    # Assets estáticos, templates server-side, SPAs

  # ── Diretórios comuns ──────────────────────────────────
  configs/                # Templates de config (confd, consul-template)
  init/                   # Systemd, upstart, supervisor configs
  scripts/                # Scripts de build, install, análise. Mantém Makefile enxuto
  build/                  # Empacotamento e CI
    package/              # Docker, AMI, deb, rpm
    ci/                   # Travis, Circle, Drone, GitHub Actions
  deployments/            # Docker Compose, Kubernetes/Helm, Terraform
  test/                   # Testes externos e dados de teste
    testdata/             # Go ignora este diretório (pode usar _ também)

  # ── Outros diretórios ──────────────────────────────────
  docs/                   # Documentação (além do godoc)
  tools/                  # Ferramentas de suporte (podem importar internal/ e pkg/)
  examples/               # Exemplos para bibliotecas públicas
  third_party/            # Código forkeado, ferramentas externas
  githooks/               # Git hooks
  assets/                 # Imagens, logos
  website/                # Dados do site (se não for GitHub Pages)

  # ── NUNCA crie ─────────────────────────────────────────
  # src/   ← Padrão Java, não Go. Com Go Modules, GOPATH/src não é mais relevante
```

### Regras de cada diretório

| Diretório | Visibilidade | Quando criar | Quem importa |
|---|---|---|---|
| `cmd/` | Entry point | Desde o início se tiver executável | Ninguém (só `go build`) |
| `internal/` | **Privado** (compilador bloqueia) | Quando código NÃO deve ser reusado fora | Só este módulo |
| `pkg/` | Público | Quando código DEVE poder ser importado | Qualquer projeto |
| `vendor/` | Dependências | Se precisar de builds offline/reprodutíveis | Gerenciado por `go mod vendor` |

### O ciclo natural de um projeto Go

```
Fase 1: main.go (1 arquivo)
  ↓ "main está muito grande, preciso separar"
Fase 2: main.go + internal/ (código privado)
  ↓ "tenho 2 executáveis compartilhando lógica"
Fase 3: cmd/app1/main.go + cmd/app2/main.go + internal/
  ↓ "esse código de parsing é útil pra outros projetos"
Fase 4: + pkg/parser/ (código público)
  ↓ "preciso de CI, Docker, configurações"
Fase 5: + build/ + deployments/ + configs/
```

**Anti-padrão:** pular da Fase 1 pra Fase 5 criando 15 diretórios vazios "pra já
deixar organizado". Isso é arquitetura de PowerPoint, não engenharia de software.

## Convenções de nomenclatura

- **Pacotes:** minúsculas, uma palavra, sem underscore. Ex: `bytes`, `http`
- **Visibilidade:** primeira letra maiúscula = exportado; minúscula = privado
- **Getters:** `Owner()` não `GetOwner()`. Setter: `SetOwner()`
- **Interfaces de 1 método:** nome do método + sufixo `er`. Ex: `Reader`, `Writer`
- **Multi-palavras:** `MixedCaps` ou `mixedCaps`, nunca underscore

## Tratamento de erros

```go
// Erros são parte do contrato. Todo erro deve responder: o que deu errado?
if err != nil {
    return fmt.Errorf("falha ao processar usuário %s: %w", id, err)
}
```

- Use `%w` para wrapping (preserva `errors.Is` / `errors.As`)
- `errors.Is` para comparar sentinelas, `errors.As` para type assertion
- **NUNCA** use `panic` para falhas rotineiras
- Log uma vez, trate muitas — não logue o mesmo erro em cada camada
- Sentinel errors com moderação — prefira tipos de erro customizados

## Context propagation

```go
func (s *Service) Processar(ctx context.Context, id string) error {
    // context.Context SEMPRE como primeiro parâmetro
    // NUNCA armazene context em struct
    // SEMPRE passe o context recebido pra baixo
    // Derive apenas quando precisar de cancelamento/timeout
    ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
    defer cancel()
    // ...
}
```

## Interfaces

```go
// Defina interfaces ONDE consome, não onde implementa
// Prefira tipos concretos internamente
// Interfaces pequenas (1-2 métodos) são as mais úteis
type Leitor interface {
    Ler(destino []byte) (int, error)
}

// Retorne tipos concretos quando possível
func NovoCliente() *Cliente { ... }  // não io.Reader
```

## Concorrência

```go
// Prefira concorrência estruturada (errgroup)
g, ctx := errgroup.WithContext(ctx)
g.Go(func() error { return buscarAPI(ctx) })
g.Go(func() error { return buscarDB(ctx) })
if err := g.Wait(); err != nil { ... }

// Channels para coordenação, mutexes para estado compartilhado
// Seja explícito sobre ownership do channel (quem fecha?)
// Bound worker pools: goroutines não são gratuitas em produção
```

## Testes

- `go test ./...` como gate de qualidade padrão
- Table-driven tests para matrizes de comportamento
- Teste comportamento, não detalhe de implementação
- `-race` regularmente (detecta data races)
- Fuzzing para parsers e inputs com muitos edge cases
- Benchmark hot paths com `testing.B`

## Dependências

- Prefira menos dependências — cada uma é um passivo de manutenção
- `go.mod` e `go.sum` sob versionamento
- Revise diffs de dependências tão seriamente quanto código de aplicação
- Use `go work` para desenvolvimento local multi-módulo, mas CI deve funcionar sem

## Observabilidade

- Logs estruturados (não `fmt.Println`)
- Métricas nos paths críticos
- Tracing propagado entre serviços
- Health endpoints para load balancer
- Graceful shutdown: capture SIGTERM, drene conexões, feche recursos

## Anti-padrões

1. Design "interface-first" em tudo — crie interface quando precisar, não antes
2. Package-level globals — estado mutável global é dívida técnica
3. Goroutines sem controle de vida — leaks são silenciosos e cumulativos
4. Panic como controle de fluxo — `panic` é para bugs irrecuperáveis
5. Ignorar erros com `_` — todo erro tem algo a dizer

# C# — Referência de Boas Práticas

> Versão alvo: **.NET 10 / C# 14** | Atualizado: Julho 2026

## Paralelos TypeScript ↔ C# (contexto de aprendizado)

Ambas são linguagens Microsoft com tipagem forte. Saber uma ajuda a aprender a outra.

| Conceito | TypeScript | C# |
|---|---|---|
| Tipos | `string`, `number`, `boolean` | `string`, `int`/`double`/`decimal`, `bool` |
| Interfaces | `interface` | `interface` |
| Classes | `class` com `constructor` | `class` com `constructor` |
| Async | `async/await` + Promise | `async/await` + Task |
| Generics | `<T>` | `<T>` |
| Decorators | `@decorator` (experimental) | `[Attribute]` (nativo) |
| DI | NestJS providers | `IServiceCollection` / constructor injection |
| ORM | Prisma | Entity Framework Core |
| Módulos | ES modules / CommonJS | Namespaces + assemblies |
| Null safety | `strictNullChecks` | `?` (nullable), `!` (null-forgiving) |
| Pattern matching | `switch` com tipos (TS 5+) | `switch` expression + `is` (C# 7+) |
| Tuplas | `[string, number]` | `(string, int)` com nomes opcionais |

## SOLID com exemplos reais (C#)

### SRP — Single Responsibility + DIP combinados

```csharp
// Service com UMA responsabilidade: gerar prova
// SRP: só muda se a lógica de geração de prova mudar
public class ProvaGenerator
{
    // DIP: depende da abstração IQuestaoRepository, não da implementação concreta
    private readonly IQuestaoRepository _questaoRepo;

    // Injeção de dependência via construtor (padrão do .NET/C#)
    public ProvaGenerator(IQuestaoRepository questaoRepo)
    {
        _questaoRepo = questaoRepo;
    }

    public async Task<Prova> GerarAsync(int materiaId, int quantidade)
    {
        var questoes = await _questaoRepo.FiltrarPorMateriaAsync(materiaId);
        return new Prova(questoes.Take(quantidade));
    }
}

// ISP: interface enxuta, apenas métodos realmente necessários
public interface IQuestaoRepository
{
    Task<IEnumerable<Questao>> FiltrarPorMateriaAsync(int materiaId);
}

// OCP: se quisermos trocar o banco, criamos nova implementação
public class QuestaoRepository : IQuestaoRepository
{
    public async Task<IEnumerable<Questao>> FiltrarPorMateriaAsync(int materiaId)
    {
        // Lógica de acesso ao banco
    }
}

// Registro no container DI (equivalente ao @Module no NestJS)
services.AddScoped<IQuestaoRepository, QuestaoRepository>();
```

## Estrutura de função serverless (Appwrite)

```
MinhaFuncao/
├── MinhaFuncao.csproj    # projeto .NET (dependências, configurações)
├── Function.cs           # entrypoint (chamado pelo Appwrite runtime)
└── Services/             # lógica de negócio separada (SRP)
    └── ProvaGenerator.cs
```

```csharp
// Entrypoint — Appwrite runtime chama automaticamente
// Similar ao main.ts do NestJS: ponto de entrada
public class Function
{
    public async Task ExecuteAsync()
    {
        var client = new Client()
            .SetEndpoint(Environment.GetEnvironmentVariable("APPWRITE_ENDPOINT")!)
            .SetProject(Environment.GetEnvironmentVariable("APPWRITE_FUNCTION_PROJECT_ID")!)
            .SetKey(Environment.GetEnvironmentVariable("APPWRITE_API_KEY")!);
        // Lógica delegada para services (SRP)
    }
}
```

## Ferramentas essenciais

```bash
dotnet new console -n MeuProjeto    # cria projeto console
dotnet add package Appwrite         # SDK Appwrite (NuGet)
dotnet add package MySqlConnector   # driver MySQL
dotnet run                          # executa o projeto
dotnet build                        # compila
dotnet test                         # roda testes (xUnit/NUnit/MSTest)
dotnet watch run                    # hot reload em desenvolvimento
```

## Convenções de código (Microsoft)

- **Indentação:** 4 espaços (não tabs)
- **Chaves:** estilo Allman (abre/fecha em linha própria)
- **using directives:** FORA da declaração do namespace
- **Namespace:** file-scoped (`namespace MeuApp;` — sem bloco)
- **Linhas:** limite de 65 caracteres em docs, quebre antes de operadores binários
- **Comentários:** `//` para breves; explicações longas no artigo, não no código

## Linguagem

- Use keywords (`string`, `int`) em vez de tipos do runtime (`String`, `Int32`)
- `var` só quando o tipo é óbvio da expressão. Em LINQ, `var` é encorajado
- Use `Func<>` e `Action<>` em vez de declarar tipos delegate
- `using` statement em vez de `try-finally` com só `Dispose()`
- LINQ: aliases para propriedades de tipos anônimos com PascalCase
- Evite construtos obsoletos; use features modernas da linguagem

## C# 14 — Novidades (.NET 10)

```csharp
// Extension members (métodos E propriedades de extensão)
public extension class EnumerableExtensions for IEnumerable<int>
{
    public bool IsEmpty => !this.Any();           // propriedade de extensão
    public static IEnumerable<int> Identity => []; // membro estático de extensão
}

// field-backed properties (substitui backing field manual)
public string Nome { get => field; set => field = value?.Trim() ?? ""; }

// Null-conditional assignment (novo!)
cliente?.PedidoAtual = novoPedido;  // só atribui se cliente != null

// nameof com genéricos não vinculados
nameof(List<>)  // retorna "List"

// Modificadores em lambda sem tipo explícito
var fn = (ref int x) => x++;

// Construtor e evento partial
public partial class MinhaClasse { public partial MinhaClasse(); }
public partial class MinhaClasse { public partial MinhaClasse() { /* impl */ } }
```

## Dependency Injection (prioridade #1)

| Lifetime | Quando usar | Exemplo |
|---|---|---|
| **Transient** | Objeto leve, sem estado, vida curta | `EmailService` |
| **Scoped** | Uma instância por request HTTP | `DbContext`, `UserContext` |
| **Singleton** | Estado compartilhado, thread-safe | `CacheService`, `Logger` |

**Regra:** NUNCA injete serviço Scoped em Singleton. O container avisa, mas não conte com isso.

## Async/Await

```csharp
// SEMPRE: propague async. NUNCA: .Result ou .Wait()
public async Task<Pedido> BuscarPedidoAsync(int id, CancellationToken ct = default)
{
    return await _db.Pedidos
        .AsNoTracking()  // leitura = sem tracking (2.9-5.2x mais rápido)
        .FirstOrDefaultAsync(p => p.Id == id, ct);
}

// NUNCA: async void (exceto em event handlers)
// SEMPRE: passe CancellationToken por TODA cadeia async
```

## EF Core 10

```csharp
// Leituras: AsNoTracking() sempre (2.9x-5.2x mais rápido)
var pedidos = await _db.Pedidos.AsNoTracking().ToListAsync();

// Evite N+1: use Include() ou projection
var pedidos = await _db.Pedidos.Include(p => p.Itens).ToListAsync();

// Set-based updates: ExecuteUpdate (não carrega entidades pra modificar)
await _db.Pedidos.Where(p => p.Status == Status.Antigo)
    .ExecuteUpdateAsync(p => p.SetProperty(x => x.Status, Status.Novo));

// Paginação: Skip/Take em TODO dataset (antes do ToList)
```

## Caching (.NET 10: HybridCache)

```csharp
// HybridCache: unifica L1 (memória) + L2 (Redis/SQL) com proteção anti-stampede
public async Task<Dashboard> GetDashboardAsync(CancellationToken ct)
{
    return await _cache.GetOrCreateAsync("dashboard", async (entry) =>
    {
        entry.Expiration = TimeSpan.FromMinutes(5);
        return await _db.BuildDashboardAsync(ct);
    });
}
```

## Tratamento de exceções

- Use `IExceptionHandler` + `ProblemDetails` (não try-catch global manual)
- Capture exceções específicas, não `Exception` genérico
- `CancellationToken` propaga `OperationCanceledException` — trate separado
- NUNCA expor stack trace em produção

## Segurança

- JWT com tempo de expiração curto + refresh token
- CORS restrito (não `AllowAnyOrigin` em produção)
- Rate limiting com `AddRateLimiter` (não deixe endpoints públicos sem)
- Feature flags para releases seguras (desligue feature problemática sem redeploy)
- Secrets: NUNCA no código. Use User Secrets (dev) + Key Vault/AWS Secrets Manager (prod)

## Performance

```csharp
// Meça antes de otimizar: dotnet-trace, BenchmarkDotNet
// Pooling: ArrayPool<T> para buffers temporários
// Spans: evite alocações em hot paths
Span<byte> buffer = stackalloc byte[256];  // zero alocação no heap

// Dapper para queries de leitura críticas (híbrido com EF Core)
var resultado = await _dapper.QueryAsync<PedidoDto>(sql, parametros);
```

## Anti-padrões

1. `.Result` ou `.Wait()` em código async — causa deadlock
2. `async void` fora de event handlers — exceções não capturadas
3. Service Scoped em Singleton — estado corrompido entre requests
4. Premature abstraction — interface pra cada classe "por garantia"
5. `Console.WriteLine` em produção — use ILogger estruturado

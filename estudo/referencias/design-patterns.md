# Design Patterns & SOLID — Referência

> Base: GoF (1994) + SOLID (Martin, 2000) | Atualizado: Julho 2026

## Diagnóstico rápido: SOLID → Pattern

Quando sentir o sintoma, aplique a prescrição. A regra pragmática: **SOLID nas
costuras** (onde seu código encontra coisas que mudam independentemente). Deixe
o interior simples.

### SOLID com analogias (ferramenta de ensino)

| Princípio | Analogia (explicar com) | Sintoma | Prescrição (Pattern) |
|---|---|---|---|
| **S** RP — Classe faz coisa demais | Um chef que cozinha E atende mesa. Separe: chef cozinha, garçom serve | Muda uma feature, quebra outra não relacionada | Factory Method, Observer |
| **O** CP — Aberto p/ extensão, fechado p/ modificação | Uma régua de energia: pluga novos aparelhos sem rewiring da casa | Todo tipo novo = modificar código existente | Strategy, Decorator, Template Method |
| **L** SP — Subtipos substituíveis | Se a receita pede "qualquer queijo", mussarela E cheddar devem funcionar | Substituir tipo base por subtipo causa crash | Adapter, Decorator |
| **I** SP — Interface enxuta | Um controle remoto de TV não deveria ter botão "lançar mísseis" | Classe implementa métodos que não usa (throws) | Split interfaces, Facade |
| **D** IP — Dependa de abstrações | Uma lâmpada pluga em qualquer tomada (padrão). Não importa se a energia vem de solar, eólica ou carvão | Não testa sem banco/API/filesystem reais | Abstract Factory, Strategy, Observer |

## Catálogo GoF (23 padrões)

### Criacionais (criação de objetos)

| Padrão | Problema | Quando usar |
|---|---|---|
| **Factory Method** | Não sabe qual classe concreta instanciar até runtime | Subclasses decidem o tipo. Ex: `createTransport()` retorna Email/SMS |
| **Abstract Factory** | Famílias de objetos relacionados sem depender de concretos | UI cross-platform: botão Windows + checkbox Windows |
| **Builder** | Objeto complexo com muitas opções de construção | Query builder, HTTP request builder |
| **Prototype** | Clonar objetos sem depender de classes concretas | Objeto caro de criar, clona e modifica. Ex: template de documento |
| **Singleton** | Uma única instância global | Logger, conexão DB, cache. **Cuidado:** estado global = difícil de testar |

### Estruturais (composição de classes/objetos)

| Padrão | Problema | Quando usar |
|---|---|---|
| **Adapter** | Interface incompatível com o que o cliente espera | Wrapper de API legada. Ex: adaptar XML → JSON |
| **Bridge** | Separar interface da implementação pra ambos evoluírem | Dispositivo (TV, Rádio) + Controle (básico, avançado) |
| **Composite** | Tratar objeto único e composição uniformemente | Árvore de componentes UI, sistema de arquivos (arquivo/pasta) |
| **Decorator** | Adicionar comportamento sem modificar original | Middleware, logging, caching. Ex: `LoggedRepository` decora `Repository` |
| **Facade** | Interface simples para subsistema complexo | `EmailService.send()` esconde SMTP, template, fila |
| **Flyweight** | Compartilhar estado comum entre muitos objetos | Cache de caracteres em editor de texto |
| **Proxy** | Controlar acesso ao objeto real | Lazy loading, acesso remoto, proteção. Ex: `VirtualProxyImage` |

### Comportamentais (comunicação entre objetos)

| Padrão | Problema | Quando usar |
|---|---|---|
| **Chain of Responsibility** | Passar request por cadeia de handlers | Middleware HTTP, pipeline de validação |
| **Command** | Encapsular requisição como objeto | Fila de tarefas, undo/redo. Ex: `CommandBus` |
| **Iterator** | Percorrer coleção sem expor estrutura interna | `for...of` do JS, cursores de banco |
| **Mediator** | Reduzir acoplamento entre objetos que conversam | Chat room, orquestrador de microservices |
| **Memento** | Capturar estado interno pra restaurar depois | Undo em editor, snapshot de jogo |
| **Observer** | Notificar dependentes sobre mudanças | EventEmitter, WebSocket broadcast, pub/sub |
| **State** | Comportamento varia com estado interno | Máquina de estados: Pedido (novo → pago → enviado → entregue) |
| **Strategy** | Família de algoritmos intercambiáveis | Método de pagamento, algoritmo de compressão, validação customizada |
| **Template Method** | Esqueleto de algoritmo com passos customizáveis | Hook de ciclo de vida (onModuleInit), pipeline com etapas fixas |
| **Visitor** | Operação sobre objetos de estrutura complexa | Exportador de AST (JSON, XML, SQL de uma árvore sintática) |

## O fluxo pragmático

```
1. Escreva código simples e direto. Sem patterns, sem abstrações prematuras.
2. Sinta a dor. Mudanças difíceis? Testes quebradiços? Classes inchando?
3. Diagnostique com SOLID. Qual princípio está sendo violado? Nomeie.
4. Prescreva o pattern. Qual padrão trata ESSA violação específica?
5. Refatore incremental. Pequenos passos. Testes entre cada passo.
6. Pare quando a dor passar. Não precisa aplicar todo princípio a toda classe.
```

## Quando NÃO aplicar

- Código pequeno, estável, com pouca chance de mudar → SOLID pode PIORAR
- Duas classes no mesmo módulo que sempre mudam juntas → DIP é overhead
- "Interface pra cada classe" → cria dezenas de abstrações sem valor
- Utility class com um método e zero expectativa de extensão → SRP já está ok

## Patterns em frameworks modernos

| Framework/Contexto | Patterns usados |
|---|---|
| **NestJS** | DI (IoC container), Decorator, Guard (Chain of Resp), Module (Facade), Interceptor (Proxy) |
| **Angular** | Observer (RxJS), DI, Decorator, Singleton (services) |
| **React** | Observer (useEffect/useState), Composite (árvore de componentes), Strategy (hooks) |
| **Entity Framework** | Unit of Work (DbContext), Repository (DbSet), Lazy Loading (Proxy) |
| **Express/Fastify** | Middleware (Chain of Resp), Router (Strategy por rota) |

## Como explicar (além da definição)

Ao ensinar um pattern, use 3 camadas:

1. **Problema real** — "Imagine que você tem 5 formas de pagamento e cada uma
   tem regras diferentes de validação..."
2. **Solução concreta** — "O Strategy permite encapsular cada algoritmo em sua
   própria classe, e o contexto escolhe qual usar em runtime"
3. **Conexão com SOLID** — "Isso é Open/Closed: você adiciona uma nova forma
   de pagamento sem modificar o código do checkout"

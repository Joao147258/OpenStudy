# NestJS — Referência de Boas Práticas

> Versão alvo: **NestJS 11** (Express v5, Fastify v5) | Atualizado: Julho 2026

## Filosofia do framework

NestJS impõe arquitetura: módulos, providers, injeção de dependência. O framework
dá a estrutura, você decide como os módulos se relacionam. A maior força e a
maior armadilha é a mesma: a arquitetura é aberta.

## Estrutura de projeto

```
src/
  modules/              # Módulos de domínio (feature-based)
    auth/
      auth.module.ts    # Registra controllers + providers deste domínio
      auth.controller.ts
      auth.service.ts
      auth.service.spec.ts  # Testes co-localizados
      guards/            # Guards específicos do módulo
      decorators/        # Decorators específicos
      dto/              # DTOs de entrada/saída
    usuarios/
      usuarios.module.ts
      usuarios.controller.ts
      usuarios.service.ts
      dto/
  shared/               # Cross-cutting concerns
    filters/            # Exception filters globais
    interceptors/       # Transform interceptors
    pipes/              # Validation pipes
    guards/             # Guards globais
  core/                 # Configuração one-time (DB, logger, global pipes)
    core.module.ts       # @Global(), importado só no AppModule
  health/               # Health checks
  main.ts               # bootstrap(): porta, pipes globais, swagger, versioning
  app.module.ts          # Importa CoreModule + feature modules
```

**Regra:** feature-based (agrupa por domínio), não layered (NÃO pasta controllers/, services/, dtos/ separadas).

## Módulos

```typescript
// Feature module: exporta só o que outros módulos precisam injetar
@Module({
  imports: [PrismaModule],          // Dependências
  controllers: [UsuarioController], // HTTP layer
  providers: [UsuarioService],      // Lógica de negócio
  exports: [UsuarioService],        // SÓ o que outros módulos injetam
})
export class UsuarioModule {}

// Core module: configuração one-time, @Global() com moderação
@Global()
@Module({
  imports: [PrismaModule, ConfigModule.forRoot({ isGlobal: true })],
  providers: [Logger],
  exports: [PrismaModule, Logger],
})
export class CoreModule {}
```

- **NUNCA** exporte tudo por padrão
- **NUNCA** `@Global()` em feature modules — só em cross-cutting
- **NUNCA** faça `forwardRef()` sem repensar a estrutura — é sintoma de dependência circular

## DTOs vs Entities

Separe SEMPRE. Eles parecem iguais no começo, divergem com o tempo.

```typescript
// DTO: forma dos dados entrando/saindo da API. Validado com class-validator ou Zod.
export class CriarUsuarioDto {
  @IsEmail() email: string
  @MinLength(8) senha: string
  @IsOptional() @IsString() nome?: string
}

// Entity: modelo do banco (classe TypeORM ou model Prisma).
// NUNCA exponha direto do controller — vaza campos internos,
// acopla API ao schema do banco.
```

## Guards, Interceptors, Pipes — ordem de execução

```
Middleware → Guards → Interceptors (antes) → Pipes → Handler
  → Interceptors (depois) → Exception Filters
```

| O que | Quando usar |
|---|---|
| **Guard** | Autorização: este usuário PODE acessar este recurso? |
| **Pipe** | Validação/transformação de input (body, params, query) |
| **Interceptor** | Transformar response, cache, métricas, logging |
| **Filter** | Tratamento de exceções, formato de erro consistente |
| **Middleware** | Coisas que PRECISAM rodar antes de tudo (correlation ID, logging bruto) |

## Padrões essenciais

### `@Public()` decorator — rotas abertas com guard global

```typescript
// Decorator
export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

// Guard
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), context.getClass(),
    ])
    if (isPublic) return true  // bypass em rotas @Public()
    // ... valida JWT
  }
}

// Uso
@Public()
@Get('health')
healthCheck() { return { status: 'ok' } }
```

### ValidationPipe global

```typescript
// main.ts — registrado UMA vez
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,          // Remove propriedades não declaradas no DTO
  forbidNonWhitelisted: true, // Erro se enviar campo extra
  transform: true,           // Transforma string → number, etc.
}))
```

### Exception filter global

```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    
    // NUNCA exponha stack trace em produção
    const isDev = process.env.NODE_ENV !== 'production'
    
    response.status(status).json({
      statusCode: status,
      message: message,
      ...(isDev && { stack: exception instanceof Error ? exception.stack : undefined }),
    })
  }
}

// main.ts — ORDEM IMPORTA: registre ANTES de init
app.useGlobalFilters(new GlobalExceptionFilter())
```

## NestJS 11 — Breaking changes

| Mudança | Impacto | Detalhe |
|---|---|---|
| Express v5 é default | Path matching mudou: `*` não captura tudo | Use `{*splat}` em middleware, `/*splat` em rotas |
| Query parser simples | NÃO suporta nested objects por padrão | `app.set('query parser', 'extended')` se precisar |
| Fastify v5 suportado | `(.*)` substituído por named wildcards `{*splat}` | Middleware: `forRoutes('{*splat}')` |
| Módulo dinâmico sem hash | Atribua a variável e reuse a referência | `const mod = SomeModule.forFeature([E])` |
| Lifecycle hooks invertidos | Destroy executa na ordem REVERSA do init | Init: último→primeiro. Destroy: primeiro→último |
| Middleware global primeiro | Middleware de `@Global()` executa ANTES dos imports | Ordem previsível: global → imports |
| Cache: Keyv adapter | `CacheModule` usa Keyv | Dados cacheados: `{value, expires}` |
| `HealthIndicator` deprecated | Use `HealthIndicatorService` | `this.health.check(key).up()` |
| Node.js 20+ obrigatório | Node 16 e 18 não são mais suportados | Use LTS mais recente |
| `Reflector.getAllAndMerge` | Retorna objeto (não array de 1 elemento) | Quando metadata é `object` |
| `Reflector.getAllAndOverride` | Retorna `T \| undefined` (não `T`) | Reflete possibilidade de undefined |

## ConfigModule

```typescript
// Validação com Zod (recomendado) ou Joi
ConfigModule.forRoot({
  isGlobal: true,
  validate: (config: Record<string, unknown>) => {
    return ConfigSchema.parse(config)  // Falha rápido se inválido
  },
})
```

## Testing

```
usuarios.service.spec.ts  // Unit test: co-localizado
test/                     // e2e tests
  app.e2e-spec.ts         // Testa AppModule real contra DB de teste
```

```typescript
// Unit test com DeepMockProxy (padrão dos projetos rascunho/AOP)
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended' // ou jest-mock-extended

describe('UsuarioService', () => {
  let service: UsuarioService
  let prisma: DeepMockProxy<PrismaClient>

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>() // Mock tipado: autocompleta todos os métodos
    const module = await Test.createTestingModule({
      providers: [
        UsuarioService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()
    service = module.get(UsuarioService)
  })

  it('deve criar um usuário', async () => {
    // Arrange — prepara o mock
    const dto = { email: 'a@b.com', nome: 'Ana' }
    prisma.usuario.create.mockResolvedValue({ id: 1, ...dto } as any)

    // Act — executa
    const result = await service.criar(dto)

    // Assert — verifica
    expect(result.nome).toBe('Ana')
    expect(prisma.usuario.create).toHaveBeenCalledTimes(1)
  })
})

// e2e com supertest
return request(app.getHttpServer())
  .post('/usuarios')
  .send({ email: 'test@ex.com', senha: '12345678' })
  .expect(201)
```

**Ordem de validação:** `npm run build` (typecheck) → `npm run test` (unit) → `npm run test:e2e` (integração)

## Debug de erros comuns

### "Nest can't resolve dependencies of the [Service] (?)"

O erro mais comum do NestJS. O `?` indica qual parâmetro do constructor está sem provider.

**Causas (em ordem de probabilidade):**
1. O provider não está no array `providers` do módulo
2. O módulo que contém o provider não foi importado
3. O provider não está no array `exports` do módulo de origem
4. Erro de digitação no nome da classe
5. Circular dependency

**Debug:** conte os parâmetros do constructor. O `?` indica a POSIÇÃO:
```typescript
constructor(
  private readonly a: ServiceA,   // pos 0 ✅
  private readonly b: ServiceB,   // pos 1 → "(?, +)" = ServiceB faltando
) {}
```

### "Circular dependency detected"

**Solução preferida:** extrair lógica compartilhada para um terceiro módulo.
**Solução tática** (quando não dá pra refatorar agora):
```typescript
// AMBOS os lados precisam de forwardRef
@Module({ imports: [forwardRef(() => ModuloB)] })
export class ModuloA {}
@Module({ imports: [forwardRef(() => ModuloA)] })
export class ModuloB {}
```
⚠️ `forwardRef()` mascara problema de design — prefira refatorar.

### "Unknown authentication strategy 'jwt'"

Causa mais comum: importar `Strategy` de `passport-local` em vez de `passport-jwt`.

### Controller retorna dados mas cliente recebe vazio

Falta `ValidationPipe` global ou `class-transformer` não está transformando.
```typescript
// main.ts — SEMPRE configure globalmente
app.useGlobalPipes(new ValidationPipe({
  transform: true,         // transforma payload no tipo do DTO
  whitelist: true,         // remove campos não declarados
}))
```

### `NotFoundException` vs `throw new Error()`

```typescript
// ❌ ERRADO — retorna 500 genérico
throw new Error('Matéria não encontrada')

// ✅ CORRETO — retorna 404 com mensagem clara
throw new NotFoundException(`Matéria com ID ${id} não encontrada`)
```

## Padrões de código

### Módulo Global
```typescript
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
// Um módulo @Global() não precisa ser importado em cada feature module
// Seus exports ficam disponíveis em toda a aplicação
```

### Módulo Dinâmico
```typescript
@Module({})
export class ConfigModule {
  static forRoot(options: ConfigOptions): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: 'CONFIG_OPTIONS', useValue: options }],
      exports: ['CONFIG_OPTIONS'],
    }
  }
}
```

### Decorator Customizado (compose)
```typescript
import { applyDecorators } from '@nestjs/common'

export const Auth = (...roles: string[]) =>
  applyDecorators(
    SetMetadata('roles', roles),
    UseGuards(AuthGuard, RolesGuard),
  )
// Uso: @Auth('admin') — aplica metadata + 2 guards de uma vez
```

## Comandos CLI

```bash
nest generate module mod<NOME>                # cria módulo
nest generate controller mod<NOME>            # cria controller
nest generate service mod<NOME>               # cria service
nest generate class mod<NOME>/dto/create-<NOME>  # cria classe DTO
nest info                                     # versão, SO, dependências
```

## Performance

- Guards globais: mantenha rápidos (1-5ms). JWT verification é o limite.
- NUNCA faça query no banco dentro de guard — carregue permissões no JWT payload
- Se precisar de permissões frescas: Redis com TTL curto, não banco
- Lazy modules: para serverless cold starts e apps muito grandes

## Anti-padrões

1. **Lógica de negócio no controller** — controller é HTTP, service é negócio
2. **Um AppModule gigante** — se importa 40 feature modules, quebre em domain modules
3. **Circular dependency** — `forwardRef()` é band-aid, não solução
4. **Entity exposta no controller** — use DTOs, sempre
5. **`console.log` em produção** — use Logger service injetável
6. **`process.env` direto** — use ConfigService

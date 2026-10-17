import { Injectable, Inject, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import {
  clinicalTextCipherFrom,
  clinicalTextEncryption,
} from './clinical-text/clinical-text.extension';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /**
   * CC-207 — o Nest recebe o cliente com a extensão do texto clínico cifrado
   * (o construtor devolve o cliente estendido). Os campos decifrados têm o
   * mesmo nome e tipo dos do banco, então o tipo `PrismaService` continua
   * valendo para os serviços; `onModuleInit`/`onModuleDestroy` seguem
   * acessíveis pelo cliente estendido.
   *
   * Sem ConfigService (contexto Nest mínimo), lê do ambiente. A chave só é
   * exigida quando a flag liga a gravação cifrada ou quando aparece um valor
   * cifrado: a ingestão de diretrizes continua rodando sem ela.
   */
  constructor(@Optional() @Inject(ConfigService) config?: ConfigService) {
    super();
    const extended = this.$extends(
      clinicalTextEncryption(clinicalTextCipherFrom(config ?? new ConfigService())),
    );
    return extended as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

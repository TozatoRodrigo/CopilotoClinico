import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

/** Quanto tempo um "não eliminado" lido do banco vale sem nova consulta. */
export const NOT_ERASED_TTL_MS = 30_000;

/** Teto de médicos em memória; o mais antigo sai primeiro. */
export const MAX_CACHED_PHYSICIANS = 10_000;

interface CachedStatus {
  erased: boolean;
  expiresAt: number;
}

/**
 * CC-018 — o médico dono deste token foi eliminado (LGPD Art. 18, VI)?
 *
 * O access token é stateless: sem esta checagem, o de um médico eliminado
 * seguia valendo até expirar (15 min). A estratégia JWT pergunta a cada
 * requisição autenticada, então a resposta fica em memória: "não eliminado"
 * por NOT_ERASED_TTL_MS e "eliminado" sem prazo, porque a eliminação não
 * volta atrás. A eliminação marca o médico aqui na hora; numa segunda
 * instância da API, o token deixa de valer em até NOT_ERASED_TTL_MS.
 *
 * O marcador é `physicians.erased_at`, gravado pela eliminação. O cadastro
 * não é apagado (fica anonimizado como referente da trilha de auditoria),
 * então a existência da linha não diz nada.
 */
@Injectable()
export class PhysicianErasureCheck {
  private readonly cache = new Map<string, CachedStatus>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async isErased(physicianId: string): Promise<boolean> {
    const cached = this.cache.get(physicianId);
    if (cached && (cached.erased || cached.expiresAt > Date.now())) {
      return cached.erased;
    }

    // Pela chave primária, só o id: a linha existe apenas se foi eliminado.
    const erasedPhysician = await this.prisma.physician.findFirst({
      where: { id: physicianId, erasedAt: { not: null } },
      select: { id: true },
    });

    // A eliminação pode ter marcado o médico enquanto a consulta corria: um
    // "não eliminado" lido antes dela não desfaz a marca.
    if (this.cache.get(physicianId)?.erased) {
      return true;
    }

    const erased = erasedPhysician !== null;
    this.remember(physicianId, erased);
    return erased;
  }

  /** Chamado pela eliminação depois do commit: vale na hora nesta instância. */
  markErased(physicianId: string): void {
    this.remember(physicianId, true);
  }

  private remember(physicianId: string, erased: boolean): void {
    // Reinserir põe a chave no fim da ordem de inserção do Map.
    this.cache.delete(physicianId);
    if (this.cache.size >= MAX_CACHED_PHYSICIANS) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) {
        this.cache.delete(oldest.value);
      }
    }
    this.cache.set(physicianId, {
      erased,
      expiresAt: erased ? Number.POSITIVE_INFINITY : Date.now() + NOT_ERASED_TTL_MS,
    });
  }
}

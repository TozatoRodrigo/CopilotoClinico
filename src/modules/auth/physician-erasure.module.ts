import { Module } from '@nestjs/common';
import { PhysicianErasureCheck } from './physician-erasure-check.service';

/**
 * CC-018 — a checagem de médico eliminado num módulo só dela. A estratégia JWT
 * (AuthModule) e a eliminação (LgpdModule) precisam da MESMA instância: a
 * eliminação marca o cache em memória que a estratégia lê. Fora do AuthModule
 * para o LgpdModule, que o GuidelinesModule importa pelo consentimento de IA
 * (CC-010), não arrastar JWT, MFA e cadastro para contextos sem HTTP (gabarito,
 * `pnpm cards:draft`).
 */
@Module({
  providers: [PhysicianErasureCheck],
  exports: [PhysicianErasureCheck],
})
export class PhysicianErasureModule {}

import { SetMetadata } from '@nestjs/common';

export const ALLOW_WITHOUT_LEGAL_ACCEPTANCE_KEY = 'legal:allowWithoutAcceptance';

/**
 * CC-905 — rota que continua aberta para quem ainda não aceitou a versão
 * vigente dos termos e da política (LEGAL_TERMS_V2): o próprio aceite, o
 * logout e os direitos LGPD (exportação, eliminação e consentimentos). Quem
 * não concorda com o texto novo precisa conseguir sair, levar os dados e
 * apagar a conta. Ver LegalTermsGateInterceptor.
 */
export const AllowWithoutLegalAcceptance = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_WITHOUT_LEGAL_ACCEPTANCE_KEY, true);

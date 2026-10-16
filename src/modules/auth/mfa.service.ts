import {
  Injectable,
  Inject,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { createHash, randomBytes } from 'crypto';
import QRCode from 'qrcode';
import { PrismaService } from '../../config/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import { AccountLockedException, AccountLockoutService } from './account-lockout.service';

const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_BYTES = 4; // produces 8 hex chars each
const APP_NAME = 'CopilotoClinico';

function isValidTotp(token: string, secret: string): boolean {
  try {
    return verifySync({ token, secret }).valid;
  } catch {
    return false;
  }
}

@Injectable()
export class MfaService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(AccountLockoutService) private readonly lockout: AccountLockoutService,
  ) {}

  async setupMfa(physicianId: string): Promise<{
    otpauthUri: string;
    backupCodes: string[];
    qrCode: string;
  }> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { id: true, email: true, mfaEnabled: true },
    });

    if (!physician) throw new NotFoundException('Physician not found');
    if (physician.mfaEnabled) throw new BadRequestException('MFA is already enabled');

    const secret = generateSecret();
    const encryptedSecret = this.crypto.encrypt(secret);

    const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      randomBytes(BACKUP_CODE_BYTES).toString('hex'),
    );
    const backupCodeHashes = backupCodes.map((code) =>
      createHash('sha256').update(code).digest('hex'),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.physician.update({
        where: { id: physicianId },
        data: { mfaSecret: encryptedSecret },
      });
      await tx.mfaBackupCode.deleteMany({ where: { physicianId } });
      await tx.mfaBackupCode.createMany({
        data: backupCodeHashes.map((codeHash) => ({ physicianId, codeHash })),
      });
    });

    const otpauthUri = generateURI({ issuer: APP_NAME, label: physician.email, secret });
    const qrCode = await QRCode.toDataURL(otpauthUri);

    await this.auditSilently({
      actorId: physicianId,
      action: 'AUTH_MFA_SETUP',
      entity: 'Physician',
      entityId: physicianId,
    });

    return { otpauthUri, backupCodes, qrCode };
  }

  async enableMfa(physicianId: string, totpCode: string): Promise<void> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { mfaEnabled: true, mfaSecret: true },
    });

    if (!physician) throw new NotFoundException('Physician not found');
    if (physician.mfaEnabled) throw new BadRequestException('MFA is already enabled');
    if (!physician.mfaSecret) {
      throw new BadRequestException('MFA not set up — call POST /auth/mfa/setup first');
    }

    // Sem limite por conta: quem chama acabou de receber o segredo no setup,
    // então chutar o código não abre nada.
    if (!isValidTotp(totpCode, this.crypto.decrypt(physician.mfaSecret))) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    await this.prisma.physician.update({
      where: { id: physicianId },
      data: { mfaEnabled: true },
    });

    await this.auditSilently({
      actorId: physicianId,
      action: 'AUTH_MFA_ENABLED',
      entity: 'Physician',
      entityId: physicianId,
    });
  }

  async verifyMfaCode(physicianId: string, code: string, ip?: string): Promise<void> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { mfaEnabled: true, mfaSecret: true },
    });

    if (!physician || !physician.mfaEnabled || !physician.mfaSecret) {
      throw new UnauthorizedException('MFA not configured');
    }

    // CC-025 — sem limite por conta, o limite por IP era a única defesa dos
    // 10^6 códigos possíveis. A reserva já conta a tentativa; só o acerto zera.
    try {
      await this.lockout.reserveAttempt('mfa', physicianId);
    } catch (err) {
      if (err instanceof AccountLockedException) {
        await this.auditSilently({
          actorId: physicianId,
          action: 'AUTH_MFA_FAILED',
          entity: 'Physician',
          entityId: physicianId,
          payload: { reason: 'account_locked' },
          ip,
        });
      }
      throw err;
    }

    const accepted =
      isValidTotp(code, this.crypto.decrypt(physician.mfaSecret)) ||
      (await this.consumeBackupCode(physicianId, code));
    if (accepted) {
      await this.lockout.clear('mfa', physicianId);
      return;
    }

    await this.auditSilently({
      actorId: physicianId,
      action: 'AUTH_MFA_FAILED',
      entity: 'Physician',
      entityId: physicianId,
      ip,
    });

    throw new UnauthorizedException('Invalid MFA code');
  }

  private async consumeBackupCode(physicianId: string, code: string): Promise<boolean> {
    const codeHash = createHash('sha256').update(code).digest('hex');
    const backupCode = await this.prisma.mfaBackupCode.findFirst({
      where: { physicianId, codeHash, usedAt: null },
    });
    if (!backupCode) return false;

    await this.prisma.mfaBackupCode.update({
      where: { id: backupCode.id },
      data: { usedAt: new Date() },
    });
    return true;
  }

  /**
   * CC-025 — TOTP pedido a quem já tem sessão (desativar o MFA, gerar novos
   * códigos de backup). Conta no mesmo limite do login com MFA: com uma sessão
   * roubada, chutar o código aqui desligaria o 2º fator da conta.
   */
  private async assertTotpWithinLimit(
    physicianId: string,
    encryptedSecret: string,
    totpCode: string,
  ): Promise<void> {
    await this.lockout.reserveAttempt('mfa', physicianId);
    if (!isValidTotp(totpCode, this.crypto.decrypt(encryptedSecret))) {
      throw new UnauthorizedException('Invalid TOTP code');
    }
    await this.lockout.clear('mfa', physicianId);
  }

  async disableMfa(physicianId: string, totpCode: string): Promise<void> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { mfaEnabled: true, mfaSecret: true },
    });

    if (!physician) throw new NotFoundException('Physician not found');
    if (!physician.mfaEnabled || !physician.mfaSecret) {
      throw new BadRequestException('MFA is not enabled');
    }

    await this.assertTotpWithinLimit(physicianId, physician.mfaSecret, totpCode);

    await this.prisma.$transaction(async (tx) => {
      await tx.physician.update({
        where: { id: physicianId },
        data: { mfaEnabled: false, mfaSecret: null },
      });
      await tx.mfaBackupCode.deleteMany({ where: { physicianId } });
    });

    await this.auditSilently({
      actorId: physicianId,
      action: 'AUTH_MFA_DISABLED',
      entity: 'Physician',
      entityId: physicianId,
    });
  }

  /**
   * S24-MFA-03 — Regenera códigos de backup.
   *
   * Exige TOTP válido (não permite regenerar sem provar identidade). Invalida
   * TODOS os códigos anteriores e gera ${BACKUP_CODE_COUNT} novos. Útil quando
   * o médico perdeu/suspeita de vazamento dos backups antigos.
   *
   * Não mexe no TOTP (secret) — apenas nos backups. Médico continua com o
   * mesmo app autenticador configurado.
   *
   * Retorna os códigos em texto claro (única oportunidade — depois só hash).
   */
  async regenerateBackupCodes(
    physicianId: string,
    totpCode: string,
  ): Promise<{ backupCodes: string[] }> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { mfaEnabled: true, mfaSecret: true },
    });

    if (!physician) throw new NotFoundException('Physician not found');
    if (!physician.mfaEnabled || !physician.mfaSecret) {
      throw new BadRequestException('MFA is not enabled');
    }

    await this.assertTotpWithinLimit(physicianId, physician.mfaSecret, totpCode);

    const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      randomBytes(BACKUP_CODE_BYTES).toString('hex'),
    );
    const backupCodeHashes = backupCodes.map((code) =>
      createHash('sha256').update(code).digest('hex'),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.mfaBackupCode.deleteMany({ where: { physicianId } });
      await tx.mfaBackupCode.createMany({
        data: backupCodeHashes.map((codeHash) => ({ physicianId, codeHash })),
      });
    });

    await this.auditSilently({
      actorId: physicianId,
      action: 'AUTH_MFA_BACKUPS_REGENERATED',
      entity: 'Physician',
      entityId: physicianId,
    });

    return { backupCodes };
  }

  async resetMfa(physicianId: string, adminId: string): Promise<void> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { id: true, mfaEnabled: true },
    });

    if (!physician) throw new NotFoundException('Physician not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.physician.update({
        where: { id: physicianId },
        data: { mfaEnabled: false, mfaSecret: null },
      });
      await tx.mfaBackupCode.deleteMany({ where: { physicianId } });
    });

    await this.auditSilently({
      actorId: adminId,
      action: 'AUTH_MFA_ADMIN_RESET',
      entity: 'Physician',
      entityId: physicianId,
    });
  }

  /**
   * Desativa o MFA de TODOS os médicos que atualmente o têm habilitado.
   *
   * Medida temporária, disparada por um admin — não exige o TOTP de cada
   * médico (mesma justificativa do resetMfa individual acima: quem está
   * pedindo já provou identidade de admin). Limpa secret e backup codes de
   * cada um (mesmo efeito de resetMfa, em lote) e não mexe em quem ainda não
   * tinha ativado, nem bloqueia setup/enable voluntário depois.
   *
   * Cada médico afetado gera sua própria entrada de auditoria
   * (AUTH_MFA_ADMIN_BULK_RESET) — dá pra saber exatamente quem foi afetado e
   * quando, igual ao reset unitário.
   */
  async resetAllMfa(adminId: string): Promise<{ count: number; physicianIds: string[] }> {
    const enabledPhysicians = await this.prisma.physician.findMany({
      where: { mfaEnabled: true },
      select: { id: true },
    });

    if (enabledPhysicians.length === 0) {
      return { count: 0, physicianIds: [] };
    }

    const physicianIds = enabledPhysicians.map((p) => p.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.physician.updateMany({
        where: { id: { in: physicianIds } },
        data: { mfaEnabled: false, mfaSecret: null },
      });
      await tx.mfaBackupCode.deleteMany({ where: { physicianId: { in: physicianIds } } });
    });

    await Promise.all(
      physicianIds.map((physicianId) =>
        this.auditSilently({
          actorId: adminId,
          action: 'AUTH_MFA_ADMIN_BULK_RESET',
          entity: 'Physician',
          entityId: physicianId,
        }),
      ),
    );

    return { count: physicianIds.length, physicianIds };
  }

  private async auditSilently(params: Parameters<AuditService['log']>[0]): Promise<void> {
    await this.auditService.log(params).catch(() => undefined);
  }
}

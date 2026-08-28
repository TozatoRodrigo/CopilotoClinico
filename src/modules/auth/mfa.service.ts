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

const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_BYTES = 4; // produces 8 hex chars each
const APP_NAME = 'CopilotoClinico';

@Injectable()
export class MfaService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(AuditService) private readonly auditService: AuditService,
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

    const secret = this.crypto.decrypt(physician.mfaSecret);
    let valid = false;
    try {
      valid = verifySync({ token: totpCode, secret }).valid;
    } catch {
      valid = false;
    }
    if (!valid) {
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

    const secret = this.crypto.decrypt(physician.mfaSecret);

    let totpValid = false;
    try {
      const totpResult = verifySync({ token: code, secret });
      totpValid = totpResult.valid;
    } catch {
      totpValid = false;
    }
    if (totpValid) {
      return;
    }

    const codeHash = createHash('sha256').update(code).digest('hex');
    const backupCode = await this.prisma.mfaBackupCode.findFirst({
      where: { physicianId, codeHash, usedAt: null },
    });

    if (backupCode) {
      await this.prisma.mfaBackupCode.update({
        where: { id: backupCode.id },
        data: { usedAt: new Date() },
      });
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

  async disableMfa(physicianId: string, totpCode: string): Promise<void> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { mfaEnabled: true, mfaSecret: true },
    });

    if (!physician) throw new NotFoundException('Physician not found');
    if (!physician.mfaEnabled || !physician.mfaSecret) {
      throw new BadRequestException('MFA is not enabled');
    }

    const secret = this.crypto.decrypt(physician.mfaSecret);
    let valid = false;
    try {
      valid = verifySync({ token: totpCode, secret }).valid;
    } catch {
      valid = false;
    }
    if (!valid) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

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

    const secret = this.crypto.decrypt(physician.mfaSecret);
    let valid = false;
    try {
      valid = verifySync({ token: totpCode, secret }).valid;
    } catch {
      valid = false;
    }
    if (!valid) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

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

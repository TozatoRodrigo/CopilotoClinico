import {
  Injectable,
  Inject,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { createHash, randomBytes } from 'crypto';
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
    private readonly auditService: AuditService,
  ) {}

  /**
   * Gera e persiste um novo segredo TOTP + 8 backup codes para o médico.
   * MFA não fica ativo até que enableMfa() seja chamado com código válido.
   * Pode ser chamado novamente para resetar o setup enquanto mfaEnabled=false.
   */
  async setupMfa(physicianId: string): Promise<{ otpauthUri: string; backupCodes: string[] }> {
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

    await this.auditSilently({
      actorId: physicianId,
      action: 'AUTH_MFA_SETUP',
      entity: 'Physician',
      entityId: physicianId,
    });

    return { otpauthUri, backupCodes };
  }

  /**
   * Confirma o setup do MFA verificando o primeiro código TOTP.
   * Após isso mfaEnabled=true e o login passará a exigir TOTP.
   */
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

  /**
   * Valida um código MFA (TOTP ou backup code) durante o login.
   * Backup codes são de uso único; são marcados com usedAt após uso.
   */
  async verifyMfaCode(physicianId: string, code: string, ip?: string): Promise<void> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { mfaEnabled: true, mfaSecret: true },
    });

    if (!physician || !physician.mfaEnabled || !physician.mfaSecret) {
      throw new UnauthorizedException('MFA not configured');
    }

    const secret = this.crypto.decrypt(physician.mfaSecret);

    // 1. Tenta TOTP (verifySync throws TokenLengthError for non-6-digit tokens in otplib v13)
    let totpValid = false;
    try {
      const totpResult = verifySync({ token: code, secret });
      totpValid = totpResult.valid;
    } catch {
      // Invalid token format — treat as failed TOTP and try backup code
      totpValid = false;
    }
    if (totpValid) {
      return;
    }

    // 2. Tenta backup code
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

  /**
   * Desativa o MFA após confirmar o código TOTP atual.
   * Remove segredo e todos os backup codes.
   */
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

  private async auditSilently(params: Parameters<AuditService['log']>[0]): Promise<void> {
    await this.auditService.log(params).catch(() => undefined);
  }
}

import { Injectable, Inject, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import { RegisterInput, LoginInput, RefreshInput } from './schemas/auth.schemas';

type JwtExpiry = NonNullable<JwtSignOptions['expiresIn']>;

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiry: JwtExpiry;
  private readonly refreshExpiry: JwtExpiry;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {
    this.accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessExpiry = this.config.get<string>('JWT_ACCESS_EXPIRY', '15m') as unknown as JwtExpiry;
    this.refreshExpiry = this.config.get<string>(
      'JWT_REFRESH_EXPIRY',
      '7d',
    ) as unknown as JwtExpiry;
  }

  async register(input: RegisterInput) {
    const existing = await this.prisma.physician.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const physician = await this.prisma.physician.create({
      data: {
        email: input.email,
        passwordHash,
        crmUf: input.crmUf,
        crmNumber: input.crmNumber,
        name: input.name,
      },
      select: {
        id: true,
        email: true,
        crmUf: true,
        crmNumber: true,
        name: true,
        createdAt: true,
      },
    });

    const tokens = await this.generateTokens(physician.id, physician.email);
    return { physician, ...tokens };
  }

  async login(input: LoginInput) {
    const physician = await this.prisma.physician.findUnique({
      where: { email: input.email },
    });
    if (!physician) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(input.password, physician.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(physician.id, physician.email);
    return {
      physician: {
        id: physician.id,
        email: physician.email,
        crmUf: physician.crmUf,
        crmNumber: physician.crmNumber,
        name: physician.name,
      },
      ...tokens,
    };
  }

  async refresh(input: RefreshInput) {
    const tokenHash = this.hashToken(input.refreshToken);

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { physician: true },
    });

    if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    const tokens = await this.generateTokens(storedToken.physician.id, storedToken.physician.email);
    return tokens;
  }

  private async generateTokens(physicianId: string, email: string) {
    const payload = { sub: physicianId, email, physicianId };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiry,
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiry,
    });

    const refreshTokenHash = this.hashToken(refreshToken);
    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000);

    await this.prisma.refreshToken.create({
      data: {
        physicianId,
        tokenHash: refreshTokenHash,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

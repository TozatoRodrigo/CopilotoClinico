import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ready', timestamp: new Date().toISOString() };
  }
}

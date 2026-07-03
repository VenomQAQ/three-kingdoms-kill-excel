import { Controller, Get } from '@nestjs/common';
import { VERSIONS } from '@tk/shared';
import { env } from '../../config/env';

/**
 * GET /api/capabilities
 * 前端启动时读取一次，缓存到 store。
 * 对齐 design/api-contract.v1.md §2.1
 */
@Controller('api/capabilities')
export class CapabilitiesController {
  @Get()
  get() {
    return {
      ok: true,
      data: {
        sandboxEnabled: env.sandboxEnabled,
        versions: VERSIONS.map((v) => ({
          id: v.id,
          name: v.name,
          minPlayers: v.minPlayers,
          maxPlayers: v.maxPlayers,
          default: v.default,
        })),
        bgColorToken: '--bg-cell',
        chatLimits: {
          ratePerSec: 1,
          maxLength: 200,
          historySize: 1000,
          snapshotSize: 100,
        },
        session: {
          accessTtlSec: env.jwtAccessTtlSec,
          refreshTtlSec: env.refreshTtlSec,
          reconnectGraceSec: env.reconnectGraceSec,
        },
      },
      _v: 1,
    };
  }
}

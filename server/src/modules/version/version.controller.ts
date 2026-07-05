import { Controller, Get, Param } from '@nestjs/common';
import { VersionDetailService } from './version-detail.service';

@Controller('api/versions')
export class VersionController {
  constructor(private readonly versionDetail: VersionDetailService) {}

  @Get(':id')
  getVersion(@Param('id') id: string) {
    const detail = this.versionDetail.getVersionDetail(id);
    if (!detail) {
      return {
        ok: false,
        code: 'E_VERSION_UNKNOWN',
        message: '未知版本',
        _v: 1,
      };
    }
    return { ok: true, data: detail, _v: 1 };
  }
}

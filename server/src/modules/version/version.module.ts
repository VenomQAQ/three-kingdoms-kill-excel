import { Module } from '@nestjs/common';
import { VersionController } from './version.controller';
import { VersionDetailService } from './version-detail.service';

@Module({
  controllers: [VersionController],
  providers: [VersionDetailService],
  exports: [VersionDetailService],
})
export class VersionModule {}

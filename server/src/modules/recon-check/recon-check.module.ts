import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { ReconCheckSessionEntity } from './entities/recon-check-session.entity';
import { ReconCheckController } from './recon-check.controller';
import { ReconCheckService } from './recon-check.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([ReconCheckSessionEntity, User])],
  controllers: [ReconCheckController],
  providers: [ReconCheckService],
})
export class ReconCheckModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { NonogramSessionEntity } from './entities/nonogram-session.entity';
import { NonogramController } from './nonogram.controller';
import { NonogramService } from './nonogram.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([NonogramSessionEntity, User])],
  controllers: [NonogramController],
  providers: [NonogramService],
})
export class NonogramModule {}

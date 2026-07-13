import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { CardFlipSessionEntity } from './entities/card-flip-session.entity';
import { CardFlipController } from './card-flip.controller';
import { CardFlipService } from './card-flip.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([CardFlipSessionEntity, User])],
  controllers: [CardFlipController],
  providers: [CardFlipService],
})
export class CardFlipModule {}

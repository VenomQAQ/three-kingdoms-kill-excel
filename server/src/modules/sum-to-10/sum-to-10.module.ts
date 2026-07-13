import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { SumTo10SessionEntity } from './entities/sum-to-10-session.entity';
import { SumTo10Controller } from './sum-to-10.controller';
import { SumTo10Service } from './sum-to-10.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([SumTo10SessionEntity, User])],
  controllers: [SumTo10Controller],
  providers: [SumTo10Service],
})
export class SumTo10Module {}

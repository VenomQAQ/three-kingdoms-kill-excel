import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { CrimeSudokuController } from './crime-sudoku.controller';
import { CrimeSudokuService } from './crime-sudoku.service';
import { CrimeSudokuClearEntity } from './entities/crime-sudoku-clear.entity';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([CrimeSudokuClearEntity, User])],
  controllers: [CrimeSudokuController],
  providers: [CrimeSudokuService],
})
export class CrimeSudokuModule {}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'crime_sudoku_clear' })
@Index(['userId', 'levelId'], { unique: true })
export class CrimeSudokuClearEntity {
  @PrimaryColumn({ type: 'varchar', length: 26 })
  id!: string;

  @Column({ type: 'varchar', length: 26 })
  userId!: string;

  @Column({ type: 'varchar', length: 32 })
  levelId!: string;

  @Column({ type: 'integer' })
  clearTimeMs!: number;

  @Column({ type: 'integer', default: 0 })
  rewardCoins!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

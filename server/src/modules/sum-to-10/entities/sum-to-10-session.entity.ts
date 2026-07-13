import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { SumTo10SessionStatus } from '@tk/shared';

@Entity({ name: 'sum_to_10_session' })
@Index('idx_sum_to_10_session_user', ['userId'])
export class SumTo10SessionEntity {
  @PrimaryColumn('varchar', { length: 26 })
  id!: string;

  @Column('varchar', { length: 26 })
  userId!: string;

  @Column('varchar', { length: 16 })
  difficultyId!: string;

  @Column('varchar', { length: 16 })
  status!: SumTo10SessionStatus;

  @Column('int')
  rows!: number;

  @Column('int')
  cols!: number;

  @Column('int')
  targetScore!: number;

  @Column('int')
  timeLimitSec!: number;

  @Column('int')
  entryFee!: number;

  @Column('int')
  rewardCoins!: number;

  @Column('text')
  boardJson!: string;

  @Column('datetime')
  startedAt!: Date;

  @Column('datetime')
  deadlineAt!: Date;

  @Column('datetime', { nullable: true })
  finishedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}

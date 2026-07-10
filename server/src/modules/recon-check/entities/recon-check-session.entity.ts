import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ReconCheckSessionStatus } from '@tk/shared';

@Entity({ name: 'recon_check_session' })
@Index('idx_recon_session_user', ['userId'])
export class ReconCheckSessionEntity {
  @PrimaryColumn('varchar', { length: 26 })
  id!: string;

  @Column('varchar', { length: 26 })
  userId!: string;

  @Column('varchar', { length: 16 })
  difficultyId!: string;

  @Column('varchar', { length: 16 })
  status!: ReconCheckSessionStatus;

  @Column('int')
  rows!: number;

  @Column('int')
  cols!: number;

  @Column('int')
  rounds!: number;

  @Column('int')
  diffsPerRound!: number;

  @Column('int')
  timeLimitSec!: number;

  @Column('int')
  entryFee!: number;

  @Column('int')
  rewardCoins!: number;

  @Column('int')
  maxWrongClicks!: number;

  @Column('int', { default: 0 })
  extendCount!: number;

  @Column('int', { default: 3 })
  maxExtends!: number;

  /** 含答案的完整轮次 JSON：[{ left, right, diffKeys }] */
  @Column('text')
  roundsJson!: string;

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

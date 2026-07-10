import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { HitBossSessionStatus } from '@tk/shared';

@Entity({ name: 'hit_boss_session' })
@Index('idx_hitboss_session_user', ['userId'])
export class HitBossSessionEntity {
  @PrimaryColumn('varchar', { length: 26 })
  id!: string;

  @Column('varchar', { length: 26 })
  userId!: string;

  @Column('varchar', { length: 16 })
  difficultyId!: string;

  @Column('varchar', { length: 16 })
  status!: HitBossSessionStatus;

  @Column('int')
  rows!: number;

  @Column('int')
  cols!: number;

  @Column('int')
  timeLimitSec!: number;

  @Column('int')
  bossTarget!: number;

  @Column('int')
  entryFee!: number;

  @Column('int')
  rewardCoins!: number;

  @Column('int')
  spawnIntervalMs!: number;

  @Column('float')
  bossWeight!: number;

  @Column('float')
  distractorWeight!: number;

  @Column('float')
  workWeight!: number;

  @Column('int', { default: 0 })
  extendCount!: number;

  @Column('int')
  maxExtends!: number;

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

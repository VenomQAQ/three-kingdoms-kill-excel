import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { CardFlipSessionStatus } from '@tk/shared';

@Entity({ name: 'card_flip_session' })
@Index('idx_card_flip_session_user', ['userId'])
export class CardFlipSessionEntity {
  @PrimaryColumn('varchar', { length: 26 })
  id!: string;

  @Column('varchar', { length: 26 })
  userId!: string;

  @Column('varchar', { length: 32 })
  themeId!: string;

  @Column('varchar', { length: 16 })
  difficultyId!: string;

  @Column('varchar', { length: 16 })
  status!: CardFlipSessionStatus;

  @Column('int')
  rows!: number;

  @Column('int')
  cols!: number;

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

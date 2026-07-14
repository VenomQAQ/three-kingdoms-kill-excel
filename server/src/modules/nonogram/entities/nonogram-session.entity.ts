import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { NonogramSessionStatus } from '@tk/shared';

@Entity({ name: 'nonogram_session' })
@Index('idx_nonogram_session_user', ['userId'])
export class NonogramSessionEntity {
  @PrimaryColumn('varchar', { length: 26 })
  id!: string;

  @Column('varchar', { length: 26 })
  userId!: string;

  @Column('varchar', { length: 16 })
  difficultyId!: string;

  @Column('varchar', { length: 16 })
  status!: NonogramSessionStatus;

  @Column('int')
  size!: number;

  @Column('int')
  entryFee!: number;

  @Column('int')
  rewardCoins!: number;

  @Column('int')
  maxMistakes!: number;

  @Column('text')
  rowCluesJson!: string;

  @Column('text')
  colCluesJson!: string;

  @Column('text')
  solutionJson!: string;

  @Column('text', { nullable: true })
  digitsJson!: string | null;

  @Column('datetime')
  startedAt!: Date;

  @Column('datetime', { nullable: true })
  finishedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}

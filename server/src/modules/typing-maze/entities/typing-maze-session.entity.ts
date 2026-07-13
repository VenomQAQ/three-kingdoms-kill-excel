import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { TypingMazeCell, TypingMazeModeId, TypingMazePos, TypingMazeSessionStatus } from '@tk/shared';

@Entity({ name: 'typing_maze_session' })
@Index('idx_typing_maze_session_user', ['userId'])
export class TypingMazeSessionEntity {
  @PrimaryColumn('varchar', { length: 26 })
  id!: string;

  @Column('varchar', { length: 26 })
  userId!: string;

  @Column('varchar', { length: 16 })
  modeId!: TypingMazeModeId;

  @Column('varchar', { length: 16 })
  status!: TypingMazeSessionStatus;

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

  @Column('int')
  pathCount!: number;

  @Column('simple-json')
  start!: TypingMazePos;

  @Column('simple-json')
  end!: TypingMazePos;

  @Column('simple-json')
  board!: Array<Array<TypingMazeCell | null>>;

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

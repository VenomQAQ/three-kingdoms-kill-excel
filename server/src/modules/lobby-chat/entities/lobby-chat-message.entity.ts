import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'lobby_chat_message' })
@Index('idx_lcm_ts', ['ts'])
export class LobbyChatMessage {
  /** ULID */
  @PrimaryColumn('varchar', { length: 26 })
  id!: string;

  @Column('varchar', { length: 26 })
  userId!: string;

  @Column('varchar', { length: 20 })
  nickname!: string;

  @Column('varchar', { length: 400 })
  content!: string;

  /** epoch ms */
  @Column('bigint')
  ts!: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;
}

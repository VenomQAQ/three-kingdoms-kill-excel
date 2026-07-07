import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'user' })
@Index('idx_user_email', ['email'], { unique: true })
export class User {
  @PrimaryColumn('varchar', { length: 26 })
  id!: string;

  /** QQ 邮箱：^\d{5,11}@qq\.com$ */
  @Column('varchar', { length: 32 })
  email!: string;

  /** argon2id 哈希 */
  @Column('varchar', { length: 255 })
  passwordHash!: string;

  @Column('varchar', { length: 20 })
  nickname!: string;

  /** 用户偏好的三国杀版本 id */
  @Column('varchar', { length: 32, default: 'standard-2014' })
  preferredVersion!: string;

  @Column('int', { default: 100 })
  coins!: number;

  @Column('int', { default: 0 })
  experience!: number;

  @Column('int', { default: 1 })
  level!: number;

  @Column('text', { nullable: true })
  statsJson!: string | null;

  @Column('datetime', { nullable: true })
  lastCheckInAt!: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;

  @Column('datetime', { nullable: true })
  lastLoginAt!: Date | null;
}

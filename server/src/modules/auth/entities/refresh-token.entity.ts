import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * 一个 familyId 代表同一次登录派生出的所有 refresh 序列（generation 递增）。
 * 每次 refresh 旋转：把当前记录标 revoked，new record generation+1 写入。
 * 若收到 gen<latest 的复用请求：
 *   - 距 revokedAt ≤ 5s 视为重复请求（网络重试），不拉黑
 *   - 距 revokedAt >  5s 视为盗刷 → 整个 family 全部 revoke，并广播 auth:invalidated
 */
@Entity({ name: 'refresh_token' })
@Index('idx_rt_family', ['familyId'])
@Index('idx_rt_user', ['userId'])
export class RefreshToken {
  @PrimaryColumn('varchar', { length: 26 })
  id!: string;

  @Column('varchar', { length: 26 })
  userId!: string;

  @Column('varchar', { length: 26 })
  familyId!: string;

  @Column('integer')
  generation!: number;

  /** opaque token 的 sha256 hex（不直接存 token） */
  @Column('varchar', { length: 64 })
  tokenHash!: string;

  @Column('datetime')
  expiresAt!: Date;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @Column('datetime', { nullable: true })
  revokedAt!: Date | null;

  /** password-changed | rotated | reused | logout | admin */
  @Column('varchar', { length: 24, nullable: true })
  revokedReason!: string | null;
}

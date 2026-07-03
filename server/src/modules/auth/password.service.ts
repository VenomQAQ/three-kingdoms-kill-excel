import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * 密码哈希：argon2id
 * memoryCost / timeCost 采用 argon2 v0.41 默认（约 100-200ms 单次校验）
 */
@Injectable()
export class PasswordService {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // 哈希损坏或格式错误也视为不匹配，不抛出（避免向客户端暴露内部错误）
      return false;
    }
  }
}

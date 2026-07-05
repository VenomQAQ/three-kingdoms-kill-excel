import type { PlayerPublicProfile } from '@tk/shared';
import { httpGet } from './http';

export const ProfileApi = {
  getPublicProfile: (userId: string) =>
    httpGet<PlayerPublicProfile>(`/api/users/${encodeURIComponent(userId)}/profile`),
};

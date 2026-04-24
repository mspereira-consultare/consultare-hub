import { DefaultSession } from 'next-auth';
import type { PermissionMatrix } from '@consultare/core/permissions';

declare module 'next-auth' {
  interface Session {
    user?: DefaultSession['user'] & {
      id?: string;
      role?: string;
      department?: string;
      permissions?: PermissionMatrix;
    };
  }

  interface User {
    id?: string;
    role?: string;
    department?: string;
    permissions?: PermissionMatrix;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: string;
    department?: string;
    permissions?: PermissionMatrix;
  }
}
